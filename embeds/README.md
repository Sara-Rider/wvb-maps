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
| `grid-lane-filter-v1.html` | Routes Template **and** Events Template | `6a4024b595fb0b707c58903f` / `6a40315929504b278760f847` | Routes: `90a47261-edd7-9c86-3b02-c58fe873ed5c` · Events: `515ef29d-00c1-4b3a-5a82-25f9e627bdb0` | **captured**, authored 2026-09-01 — one file, two pages |
| `event-nearby-events-v1.html` | Events Template | `6a40315929504b278760f847` | `4437fa9a-67d5-7755-9cf3-32ebb5ebd361` | **captured**, authored 2026-09-01 |
| `past-event-label-v2.html` | Events index **and** Events Template | `6a53ea8c11d198283b0c3388` / `6a40315929504b278760f847` | Index: `17783b95-d07d-2a44-7aa5-3547df39b5bb` · Template: `cacb5da0-d66e-52de-2156-1ffcf9bca672` | **captured**, v2 2026-09-01 — one file, two pages |
| `analytics-listing-v1.html` | **site-wide footer** — every page | *(not a page)* | registered script `wvb_listing_analytics` v1.1.0 | **captured**, authored 2026-09-01 — deployed minified, see below |
| `routes-index-map-v1.html` | Routes index (`/routes`) | `6a4323c3ffbb654b0544ce9a` | `488481e7-5954-f417-f990-fa3b4fad40a8` | **captured**, hash-verified 2026-08-24 |
| `directory-index-map-v4.html` | Directory index (`/directory`) | `6a4cf5c229093f504573d969` | `f88db4da-0e6c-5c8b-b739-06ae5db87a57` | *pending capture* |
| `events-index-map.html` | Events index (`/events`) | `6a53ea8c11d198283b0c3388` | `30662914-5465-51da-185a-d1e71824b322` | *pending capture* |
| `footer.html` | **component** "WVB Footer Code Embed" | component `8104788d-3819-39d7-3b8b-c6dd5c035850` | same id as component | **captured** 2026-09-01 — it is a single HTML embed, so its links are API-editable |
| `home-embed-1.html` | Home | `6a3fd40a0f5ec7334ab9f593` | `096857e1-28b8-a7ce-52ed-e83d021d1bf0` | *pending capture, contents unidentified* |
| `home-embed-2.html` | Home | `6a3fd40a0f5ec7334ab9f593` | `64c0dd02-fcb8-ad16-263a-14ff15541f0d` | *pending capture, contents unidentified* |

**Not tracked, deliberately:** the Password / 401 page carries three embeds
that are Webflow system internals, not authored code.

## Two files deployed twice

`grid-lane-filter-v1.html` and `past-event-label-v2.html` are each pasted onto
**two** pages. Both are page-agnostic — they find their targets by class and do
nothing when none are present — so both deployments take identical content.
**Edit one, edit both.**

`past-event-label` was a site-wide registered script at v1 and moved to page
embeds at v2. The reason is worth keeping: it needs to read `endDate` from
`events.geojson`, because no page renders an end date, and the fetch pushed it
past the 2,000-character cap on a registered inline script. It never did
anything outside the two events pages, so site-wide was over-scoped anyway.
The registered script `wvb_past_event_label` has been removed — **do not
re-register it.**

**`grid-lane-filter-v1.html` has a prerequisite the embed cannot enforce.** The filter binds to
`.route-biz-grid.is-nearby`. Those two classes must sit on the **Collection
List**, never on the Collection Item. Current state, both correct:

| page | element | classes |
| :--- | :--- | :--- |
| Routes Template | Collection List `a7ed15ab-…eb5a` (The Stops) | `route-biz-grid` |
| Routes Template | Collection List `290ebdcc-…d33b` (Along the Way) | `route-biz-grid` `is-nearby` |
| Events Template | Collection List `1fdf34bf-…3cd8` (Nearby) | `route-biz-grid` `is-nearby` |

In the Navigator the List and the Item sit adjacent and both read "Collection
List" until one of them is renamed by a class, so it is easy to select the
wrong one. Putting the classes on the **Item** makes every card its own grid
container and the cards collapse into narrow vertical strips — that happened on
Routes on 2026-09-01 and the fix was to clear the Item's classes, not to change
the CSS. If the cards ever go stringy, check which of the two carries the class
before touching anything else.

## The one script that is not pasted into the Designer

`analytics-listing-v1.html` is deployed as a **registered site script**
(`wvb_listing_analytics`), not into a Designer embed and **not** into the site's
freeform footer block. Three reasons:

1. **It must run on every page**, and it finds its targets by class rather than
   belonging to any one of them.
2. **Registered scripts are additive.** The freeform footer block holds the
   routes-index filter script; `set_site_freeform_code` replaces that block
   whole, so appending there would have put an unrelated working script at risk
   on every edit. A registered script attaches alongside it and touches nothing.
3. **Rollback is one call** — `remove_site_script` with `wvb_listing_analytics`.
   No captured blob to restore, nothing to retype.

**It is deployed minified**, because Webflow caps a registered inline script at
2,000 characters and the readable source is ~4,300. The file here is the
readable source and the record; the runtime is `terser -c -m --toplevel` of the
`<script>` body, verified to pass the same test as the source. **Re-minify from
this file — never edit the minified form.** Bump the version and re-register.

**The parameters it sends (`listing_slug`, `surface`, `context_path`, `lane`)
do nothing in GA4 reports until they are registered** as event-scoped Custom
Definitions. Registration is not retroactive for reporting.

## The footer is a component, not a page embed

`footer.html` is the single source for every page's footer. It is instanced on
Home, Directory index, Routes index, Routes Template, Directories Template,
Events, Events Template and Submit a Listing — eight pages, one definition.
Editing the component updates all eight; editing an instance does not.

**2026-09-01:** Privacy Policy and Terms of Use links added to the bottom bar,
both live. **About still points at `/`** — it was briefly pointed at `/about`
and reverted, because that page exists only as an empty draft and a footer link
to a 404 on every page is worse than a link home. Repoint it to `/about` when
that page has content.

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
