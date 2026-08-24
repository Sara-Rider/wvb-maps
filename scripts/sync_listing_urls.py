"""Keep Directories.listing-url equal to /directory/<slug>, for every listing.

WHY THIS FIELD EXISTS AT ALL
----------------------------
A Webflow Collection List bound to a MultiReference field — which is how the
Routes Template renders The Stops and Along the Way — exposes NO current-item
page link. Verified 2026-08-24 by enumerating all 35 bindable sources on the
card: the only link-bindable ones are Maps URL, Tel Link and Website. There is
no "link to this item's page" option to pick, so the card link had nothing
correct to bind to and every card on every route page rendered the literal
path /routes/detail_directory.

`listing-url` is that missing target. It duplicates the slug on purpose. The
card links bind to it and resolve per item.

WHY A SCRIPT AND NOT A HUMAN STEP
---------------------------------
The value is pure derivation — no judgement, no lookup, no chance of two
people disagreeing about it. Anything a human types can be skipped, and the
failure is SILENT: a listing published without it gets a card that goes
nowhere, and nobody finds out until a rider clicks. The publish workflow
composes it too, but a listing created outside that workflow would slip
through. This closes that gap by making the value self-healing: whatever the
field says, one run puts it right.

WHY ITS OWN FILE, NOT A FEW LINES INSIDE build_directory_feed.py
----------------------------------------------------------------
Decision 72 narrowed the repo's CMS write surface to one field on one
collection, deliberately, and that narrowness is the safety property. Widening
it should be visible, not smuggled into a feed builder whose job is producing
GeoJSON. Every CMS write this repo performs should be findable by reading the
top of a file named after the write. This is the second such file; there
should not be a third without a reason.

READS BOTH STAGED AND LIVE, ON PURPOSE
--------------------------------------
An item can have the right value staged and a stale one live — that is what an
unpublished edit looks like. Comparing only staged would call that item correct
and leave the live site wrong, which is precisely the silent failure this
script exists to prevent. It writes when EITHER copy disagrees.

Requires env WEBFLOW_API_TOKEN with CMS read + write scope. A read-only token
reports no-permission per item and does not fail the run — same convention as
build_route_feed.py, because a token problem is not a bad build.

Env flags:
  WVB_SKIP_LISTING_URLS=1   read and report, write nothing
"""

import os
import sys

import requests

API = "https://api.webflow.com/v2"
DIRECTORY_COLLECTION_ID = "6a402eec052b0585b4a0452e"

# Frozen at creation and unchangeable, like every Webflow field slug.
LISTING_URL_FIELD = "listing-url"

# Relative, not absolute. An absolute URL would hard-code the production
# domain into 89 CMS records and break every link on a webflow.io preview.
PREFIX = "/directory/"

TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
HDRS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}

SKIP = os.environ.get("WVB_SKIP_LISTING_URLS") == "1"


def get(url, **params):
    r = requests.get(url, headers=HDRS, params=params or None, timeout=30)
    r.raise_for_status()
    return r.json()


def all_items(collection_id, live=True):
    path = "items/live" if live else "items"
    items, offset = [], 0
    while True:
        data = get(f"{API}/collections/{collection_id}/{path}",
                   limit=100, offset=offset)
        items.extend(data.get("items", []))
        total = data.get("pagination", {}).get("total", len(items))
        offset += 100
        if offset >= total:
            break
    return items


def want_for(slug):
    return PREFIX + slug if slug else None


def push(item_id, is_draft, value):
    """Set listing-url on one item. Never raises.

    A draft has no live record to patch, so it takes the staged endpoint and
    the founder's next publish carries it. A published item takes /live, which
    writes and publishes in one call — the same branch build_route_feed.py
    makes, for the same reason.
    """
    suffix = "" if is_draft else "/live"
    url = f"{API}/collections/{DIRECTORY_COLLECTION_ID}/items/{item_id}{suffix}"
    try:
        r = requests.patch(
            url,
            headers={**HDRS, "content-type": "application/json"},
            json={"fieldData": {LISTING_URL_FIELD: value}},
            timeout=30,
        )
    except requests.RequestException as exc:
        return "error", str(exc)
    if r.status_code in (401, 403):
        return "no-permission", (
            f"HTTP {r.status_code} — WEBFLOW_API_TOKEN cannot write CMS items. "
            "Give the token CMS write scope, or set WVB_SKIP_LISTING_URLS=1 "
            "to stop attempting the write.")
    if not r.ok:
        return "error", f"HTTP {r.status_code} {r.text[:200]}"
    return ("written-staged" if is_draft else "written-live"), value


def sync():
    if not TOKEN:
        sys.exit("WEBFLOW_API_TOKEN is not set.")

    staged = all_items(DIRECTORY_COLLECTION_ID, live=False)
    live_by_id = {
        it["id"]: (it.get("fieldData") or {}).get(LISTING_URL_FIELD)
        for it in all_items(DIRECTORY_COLLECTION_ID, live=True)
    }

    written, notes, findings = [], [], []
    unchanged = 0

    for it in staged:
        fd = it.get("fieldData") or {}
        slug = fd.get("slug")
        name = fd.get("name") or it["id"]
        is_draft = bool(it.get("isDraft"))

        if not slug:
            findings.append(f"{name}: no slug — cannot derive {LISTING_URL_FIELD}")
            continue

        want = want_for(slug)
        have_staged = fd.get(LISTING_URL_FIELD)
        have_live = live_by_id.get(it["id"])

        # A draft has no live record, so its absence from live_by_id is
        # expected and must not count as a disagreement.
        live_disagrees = (not is_draft) and have_live != want

        if have_staged == want and not live_disagrees:
            unchanged += 1
            continue

        # Say WHY, so a run that writes on unchanged inputs is distinguishable
        # from a run that had real work to do. Lesson from the nearby rail.
        if have_staged != want and live_disagrees:
            why = f"staged {have_staged!r}, live {have_live!r}"
        elif have_staged != want:
            why = f"staged {have_staged!r}"
        else:
            why = f"live {have_live!r} — staged was already right, unpublished"

        if SKIP:
            notes.append(f"{slug}: would set {want} ({why}) — "
                         "WVB_SKIP_LISTING_URLS=1")
            continue

        status, detail = push(it["id"], is_draft, want)
        written.append(f"{slug}: {status} — {detail} ({why})")
        if status == "error":
            # A card that goes nowhere is a real defect on a live page, so a
            # failed write is a FAIL. A token that cannot write is not — that
            # is a configuration state, and it is already loud.
            findings.append(f"{slug}: {LISTING_URL_FIELD} write failed — {detail}")
        elif status == "no-permission":
            notes.append(f"{slug}: {detail}")

    print(f"{LISTING_URL_FIELD} (CMS): {len(staged)} listing(s) checked, "
          f"{unchanged} already correct")
    for w in written:
        print("  " + w)
    for n in notes:
        print("  NOTE " + n)
    for f in findings:
        print("  FAIL " + f)
    if not findings:
        print("  ok no hard findings")


if __name__ == "__main__":
    sync()
