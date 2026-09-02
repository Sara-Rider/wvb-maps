#!/usr/bin/env python3
"""Weekly health check for the WVB feeds.

WHY THIS EXISTS
---------------
The checks were already written. build_events_feed.py has printed
"FAIL <n> coordinate(s) shared by more than one event" since 2026-08-19,
added specifically because two unrelated events sat on the same state
centroid for ten days and nothing noticed.

It never fired. Not because the check was wrong — because no workflow ran
the script, and because the script prints its findings and then exits 0.
A green tick with FAIL in the log is worse than no check at all: it is a
check that reports success while telling you it failed.

This script closes both halves. It runs the builders, reads what they say,
adds the checks they cannot make from a feed alone, and exits non-zero when
anything is wrong so the workflow can put it in front of a person.

WHAT IT DOES NOT DO
-------------------
It never commits and never writes to Webflow or Airtable. It builds into a
throwaway checkout to see what WOULD be produced, compares that against what
is committed, and reports. A health check that changes things is not a
health check.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

API = "https://api.webflow.com/v2"
EVENTS_COLLECTION_ID = "6a40315929504b278760f841"

FEEDS = ["events.geojson", "directory.geojson"]
BUILDERS = [
    ("events.geojson", "scripts/build_events_feed.py"),
    ("directory.geojson", "scripts/build_directory_feed.py"),
]

# The signature of a geocoder giving up. Any event on this point is not
# where the feed says it is.
STATE_CENTROID = ("38.5976262", "-80.4549026")

findings = []   # things that are wrong
notes = []      # things worth seeing that are not wrong


def fail(text):
    findings.append(text)


def note(text):
    notes.append(text)


def run_builders():
    """Run each builder and keep what it printed.

    The builders overwrite their feed in place. That is fine here: this runs
    in a disposable checkout and nothing is committed. The rewritten file is
    exactly what we want, because comparing it to the committed one is how we
    detect a stale feed.
    """
    for feed, script in BUILDERS:
        if not os.path.exists(script):
            fail(f"`{script}` is missing from the repo.")
            continue
        proc = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True, env=os.environ,
        )
        out = (proc.stdout or "") + (proc.stderr or "")

        if proc.returncode != 0:
            fail(f"`{script}` exited {proc.returncode}.\n\n```\n{out.strip()[-1500:]}\n```")
            continue

        # The builders report problems by printing, not by failing. Read them.
        for line in out.splitlines():
            stripped = line.strip()
            if stripped.startswith("FAIL") or " FAIL " in stripped:
                fail(f"`{feed}` build reported: {stripped}")
            elif stripped.startswith("WARN"):
                note(f"`{feed}` build reported: {stripped}")


def check_feed_drift():
    """Is the committed feed what the builder would produce right now?

    This is the check that would have caught the Honor Flight pin. The
    coordinate was corrected in Webflow and published; the committed feed
    still had the old one, because nothing rebuilt it. Everything looked
    healthy. The map was wrong.
    """
    proc = subprocess.run(
        ["git", "status", "--porcelain"] + FEEDS,
        capture_output=True, text=True,
    )
    changed = [l.split(None, 1)[-1] for l in proc.stdout.splitlines() if l.strip()]
    for feed in changed:
        fail(
            f"**`{feed}` is stale.** Rebuilding it from the live site produces a "
            f"different file from the one committed, so the site is serving old "
            f"data. Run **Refresh events feed** (or the matching workflow) to fix it."
        )


def webflow_get(path):
    token = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
    if not token:
        return None
    import requests
    r = requests.get(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {token}", "accept": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def check_events_in_webflow():
    """Checks that need the CMS, not the feed.

    A feed can only report on what reached it. These are the fields that are
    empty at the source — which is why the feed looks fine and the page does
    not.
    """
    try:
        data = webflow_get(f"/collections/{EVENTS_COLLECTION_ID}/items/live?limit=100")
    except Exception as exc:                       # noqa: BLE001
        fail(f"Could not read the Events collection from Webflow: {exc}")
        return
    if data is None:
        fail("WEBFLOW_API_TOKEN is not set, so the CMS checks were skipped.")
        return

    items = data.get("items", [])
    if not items:
        fail("The Events collection has no published items. That is almost "
             "certainly wrong — check before assuming it is true.")
        return

    no_coord, centroid, no_nearby, no_venue = [], [], [], []
    for it in items:
        f = it.get("fieldData", {})
        name = f.get("name", it.get("id"))
        lat, lng = f.get("latitude"), f.get("longitude")
        if not lat or not lng:
            no_coord.append(name)
        elif (str(lat), str(lng)) == STATE_CENTROID:
            centroid.append(name)
        if not f.get("nearby-businesses"):
            no_nearby.append(name)
        if not f.get("venue"):
            no_venue.append(name)

    if centroid:
        fail("**Events sitting on the state centroid** — the coordinate a "
             "geocoder returns when it gives up. These pins are wrong:\n"
             + "\n".join(f"  - {n}" for n in centroid))
    if no_coord:
        fail("**Published events with no coordinate** — these draw no pin:\n"
             + "\n".join(f"  - {n}" for n in no_coord))
    if no_nearby:
        note(f"{len(no_nearby)} of {len(items)} published events have no "
             f"nearby-businesses set. Expected while the directory is thin; "
             f"worth a look if it stays at all of them.")
    if no_venue:
        note(f"{len(no_venue)} of {len(items)} published events have no Venue "
             f"link. Each one is a directory listing not being credited for "
             f"the traffic it earns — see the Venue Leads queue.")


def main():
    run_builders()
    check_feed_drift()
    check_events_in_webflow()

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [f"_Checked {stamp}._", ""]

    if findings:
        lines.append(f"## {len(findings)} thing(s) need attention")
        lines.append("")
        for f in findings:
            lines.append(f"- {f}")
        lines.append("")
    if notes:
        lines.append("## Worth knowing, not broken")
        lines.append("")
        for n in notes:
            lines.append(f"- {n}")
        lines.append("")
    if not findings and not notes:
        lines.append("Everything checked out. Feeds match the live site, every "
                     "published event has a unique coordinate, and no builder "
                     "reported a problem.")

    report = "\n".join(lines)
    with open("health-report.md", "w", encoding="utf-8") as fh:
        fh.write(report)
    print(report)

    # Exit non-zero ONLY on real findings. Notes are information, not alarms —
    # a check that cries wolf gets muted, and a muted check is the thing this
    # script exists to prevent.
    sys.exit(1 if findings else 0)


if __name__ == "__main__":
    main()
