# `embeds/` — what is actually running in Webflow

Every file here is a copy of code that is **live in production**. Until this
folder existed, the only copy of each lived inside the Webflow Designer, which
has no history, no diff and no rollback — see Operating Handbook §22.

**The Designer is still the deploy target.** Editing a file here changes
nothing on the site. The flow is: edit the file, commit it, then push the same
content into the Designer embed and publish. The file is the record; the
Designer is the runtime.

**Never edit an embed in the Designer without updating the file.** The moment
those two diverge, this folder is worse than useless — it becomes a copy that
*looks* authoritative and isn't.

---

## Inventory

Element IDs are the part that cannot be reconstructed later. A file with no
deployment address is just orphaned code, so the address is recorded even for
embeds not yet captured.

| file | deployed on | page id | element id | status |
| :--- | :--- | :--- | :--- | :--- |
| `route-map-v5.html` | Routes Template | `6a4024b595fb0b707c58903f` | `9277e0dc-29cd-15cf-d2ea-1aaa748d86b3` | **captured**, hash-verified 2026-08-24 |
| `event-map-v1.html` | Events Template | `6a40315929504b278760f847` | `30424dc4-cf8d-893d-3159-825796e9475c` | **captured**, authored 2026-08-31 |
| `grid-lane-filter-v1.html` | Routes Template **and** Events Template | `6a4024b595fb0b707c58903f` / `6a40315929504b278760f847` | *Routes: not yet placed* · Events: `515ef29d-00c1-4b3a-5a82-25f9e627bdb0` | **captured**, authored 2026-09-01 — one file, two pages |
| `routes-index-map-v1.html` | Routes index (`/routes`) | `6a4323c3ffbb654b0544ce9a` | `488481e7-5954-f417-f990-fa3b4fad40a8` | **captured**, hash-verified 2026-08-24 |
| `directory-index-map-v4.html` | Directory index (`/directory`) | `6a4cf5c229093f504573d969` | `f88db4da-0e6c-5c8b-b739-06ae5db87a57` | *pending capture* |
| `events-index-map.html` | Events index (`/events`) | `6a53ea8c11d198283b0c3388` | `30662914-5465-51da-185a-d1e71824b322` | *pending capture* |
| `footer.html` | **component** "WVB Footer Code Embed" | component `8104788d-3819-39d7-3b8b-c6dd5c035850` | same id as component | *pending capture* |
| `home-embed-1.html` | Home | `6a3fd40a0f5ec7334ab9f593` | `096857e1-28b8-a7ce-52ed-e83d021d1bf0` | *pending capture, contents unidentified* |
| `home-embed-2.html` | Home | `6a3fd40a0f5ec7334ab9f593` | `64c0dd02-fcb8-ad16-263a-14ff15541f0d` | *pending capture, contents unidentified* |

**Not tracked, deliberately:** the Password / 401 page carries three embeds
that are Webflow system internals, not authored code.

## One file deployed twice

`grid-lane-filter-v1.html` is the first embed here that is pasted onto **two**
pages. It is written to be page-agnostic — it finds its grids by class and does
nothing if none are present — so both deployments take identical content. If you
edit it, update **both** Designer embeds, not one.

## The footer is a component, not a page embed

`footer.html` is the single source for every page's footer. It is instanced on
Home, Directory index, Routes index, Routes Template, Directories Template,
Events, Events Template and Submit a Listing — eight pages, one definition.
Editing the component updates all eight; editing an instance does not.

Two known placeholders inside it, both waiting on pages that do not exist yet:
**About** links to `/`, and there is **no Privacy link**.

## Versioning

The version lives in the file's own header comment (`v5`, `v4`, `v1`) and moves
when behaviour changes, not when a comment is reworded. Git carries the history;
the header exists so that code pasted into a Designer field can still say what
it is when it is a long way from this folder.

## Capturing an embed by hand

If you need to snapshot one and nobody is around to script it:

1. Open the embed in the Designer, select all, copy.
2. Paste into the matching file here.
3. **Diff it against the previous commit before committing.** A capture that
   silently loses a character is the failure mode this folder exists to prevent,
   and a diff of two versions of the same file makes it obvious.
