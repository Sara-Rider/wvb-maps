# wvb-maps

The data and code behind the maps, rails and embeds on
**westvirginiabikersride.com**.

Nothing here is the website. Webflow is the website. This repo holds the
**feeds** the site reads at runtime, and the **copies** of code that is pasted
into Webflow.

---

## Do I need to run anything?

**Almost never.** Here is the whole answer:

| If you just… | Do you run anything? |
| :--- | :--- |
| Approved an event in Airtable | **No.** It publishes itself, and the map catches up within a day |
| Published a directory listing | **No.** The directory feed refreshes weekly on its own |
| Changed a route's GPX or stops | **Yes** — *Rebuild route map feeds* |
| Fixed a wrong coordinate and want the pin right *now* | **Yes** — *Refresh events feed* |
| Added a new directory listing and want its card image | **Yes** — *Render directory map thumbnail* |
| Got an email about a **Health check** issue | Read the issue. It says what is wrong and what to run |

If you are unsure, running a workflow is safe. They rebuild from the live site
and commit only when something actually changed. **You cannot break the site by
running one twice.**

---

## The workflows, in plain language

Find them under the **Actions** tab. Any of them can be run by hand with the
**Run workflow** button.

| Workflow | What it does | Runs by itself |
| :--- | :--- | :--- |
| **Refresh events feed** | Rebuilds the events map pins and the related-events sections from published Webflow events | daily |
| **Build event nearby feeds** | Works out which directory listings sit near each event | no — manual |
| **Refresh directory proximity feed** | Rebuilds the directory map and the "near this route" rails | weekly, Mondays |
| **Rebuild route map feeds** | Rebuilds route lines, stops and the listing links on route pages | no — manual |
| **Render directory map thumbnail** | Draws the little map image on one directory card | no — manual |
| **Render directory map thumbnails (BATCH)** | Same, for all of them at once | no — manual |
| **Health check** | Looks for stale feeds and bad data, and emails you only if something is wrong | weekly, Mondays |

**The manual ones are manual on purpose.** They cost nothing to run, but they
only matter after *you* changed something — a route, a listing photo. Nothing
schedules itself around work only you know you did.

---

## How you find out something is wrong

**The Health check emails you.** It runs every Monday, and if it finds a
problem it opens an issue on this repo — which GitHub emails you about. If
nothing is wrong it stays completely silent.

It catches the failures that do not look like failures:

- a feed that no longer matches the live site, so the map shows old data
- two events on the same coordinate, which is the fingerprint of a geocoder
  that gave up and dropped a pin in the middle of the state
- published events with no coordinate at all
- a builder script that failed

**Silence means healthy.** If you never hear from it, that is the system
working, not the check being broken.

> This was written after a real one. A corrected coordinate was published to
> Webflow and the site kept showing the old pin for two weeks, because the feed
> had no scheduled rebuild. Nothing errored. Nothing looked wrong. The check
> that would have caught it had already been written — it just had nothing
> running it.

---

## Does any of this cost money?

**No.** This repository is public, and GitHub Actions is free with no minute
limit on public repositories. Running a workflow more often costs nothing but
a few seconds of somebody else's computer.

The one thing worth watching is **noise, not money**: a workflow that runs
every hour buries a real failure in a wall of green ticks. That is the reason
these are daily and weekly rather than constant.

**One quirk to know:** GitHub pauses scheduled workflows in a public repo after
**60 days with no commits**. If you go two months without touching the repo,
the schedules stop silently and GitHub emails you offering to switch them back
on. Any commit re-arms them.

---

## What is in here

| Path | What it is |
| :--- | :--- |
| `events.geojson` | Every published event, with its pin. Read by the events map, the related-events strips and the past-event labeller |
| `directory.geojson` | Every published directory listing |
| `routes-index.geojson` | The routes overview map |
| `events/` | One file per event — the businesses near it |
| `routes/`, `gpx/` | Route lines and their source tracks |
| `renders/` | Generated card images |
| `embeds/` | **Copies of the code pasted into Webflow.** See `embeds/README.md` — that folder has rules of its own |
| `scripts/` | The builders the workflows run |

**Do not hand-edit anything ending in `.geojson`.** They are regenerated from
the live site, so an edit here is overwritten on the next run and lost without
a trace. Fix the data in Webflow or Airtable and let the feed rebuild.

---

## The one rule that matters

**Webflow and Airtable are the truth. Everything here is a copy.**

When a feed and the site disagree, the site is right and the feed is stale —
rebuild it. The only exception is `embeds/`, which is the reverse: those files
are the record, and the Webflow Designer is the runtime that has no history.
