# Label Manager — custom label order for Trello

A free, self-hosted Trello Power-Up that lets every member of a board see and use labels in a
**custom, drag-and-drop order** instead of Trello's fixed color order.

Trello has never shipped label reordering — Atlassian staff confirmed it's "still being
considered" as recently as 2024–2026 (community threads
[1263529](https://community.atlassian.com/forums/Trello-questions/How-to-change-order-of-color-labels/qaq-p/1263529),
[2061355](https://community.atlassian.com/forums/Trello-questions/How-do-I-re-order-labels/qaq-p/2061355),
[2753906](https://community.atlassian.com/forums/Trello-questions/label-colour-and-label-order/qaq-p/2753906)).

## What a Power-Up can and cannot do here (read this first)

**Cannot:** change the order of Trello's *native* label UI — the chips on card fronts and the
built-in label picker. Power-Ups are sandboxed iframes attached to specific extension points; the
REST API's Label object has only `id`, `idBoard`, `name`, `color` — **no position field and no
reorder endpoint**. That's why this feature request has sat open since 2022: only Atlassian can
truly fix it.

**Can:**

1. **Store a custom order** on the board (shared with all members) and use it everywhere the
   Power-Up renders labels.
2. **Replace the picking workflow**: a card button opens *your* ordered, filterable label picker
   that toggles labels on the card via the REST API.
3. **Render the order on the card itself**, beside the native chips it cannot reorder:
   a **card-back section** (“Labels — your order”) lists that card's labels correctly ordered,
   and optional **card-front badges** do the same on the board view (off by default, since the
   native chips are already there — enable in settings).
4. **Push the order into Trello's native UI with two (optional) tricks:**
   - **Number prefixes** — renames labels `1· High`, `2· Medium`, … so name-sorting reproduces
     your order *within each color group*. (The within-color tie-break is community-observed,
     not officially documented — verify on your board.)
   - **Recolor to match** — reassigns colors following Trello's fixed 30-slot palette sequence so
     your first 30 labels appear in exactly your order **in Trello's own UI**. Previous colors are
     backed up on the board for one-click undo. This is the only mechanism that changes native
     ordering, at the cost of repurposing color semantics.

Trello natively sorts labels by color in this fixed sequence — hue by hue (green, yellow, orange,
red, purple, blue, sky, lime, pink, black), each hue cycling subtle → normal → bold — then
(observed) by name within a color, with colorless labels last.

## Features

- Board button **“Label Order”** → drag-and-drop manager (also ▲/▼ buttons), autosaves for the
  whole board, plus label create / rename / recolor / delete.
- Card button **“Labels (your order)”** → ordered picker with filter and one-click toggling.
- **Sort presets**: restore Trello's native order or A→Z.
- **Prefix sync** and **recolor sync** (with undo) as described above.
- Settings popup: authorization status, disconnect, reset order.
- No backend, no analytics, no third-party services: static files + Trello's own storage
  (`pluginData`) + the member's own REST token, which never leaves their browser.

## Repository layout

```
index.html            Power-Up connector (what Trello loads; registers capabilities)
manager.html/.js      Board-button modal: reorder + label CRUD + sync tools
picker.html/.js       Card-button popup: ordered label toggling
settings.html/.js     Settings popup: auth status, reset order
card-section.html/.js Card-back section: this card's labels in your custom order
js/config.js          ← put your Power-Up API key here
js/labels.js          30-color palette + Trello's native sort comparator
js/order.js           Order codec/persistence (8-char id suffixes; 8 KB-safe truncation)
js/api.js             REST helper (auth, label CRUD, card label toggling)
js/boot.js            Loads the real client library, or the mock with ?mock=1
css/powerup.css       Styles for all iframes
icons/                Board/card button icons
dev/index.html        Local dev harness — full mock Trello, no account needed
dev/mock-trello.js    Mock client library + mock REST API
dev/test-order.js     Unit tests for the order codec (node dev/test-order.js)
```

## Local development

```
npx http-server -p 8321 -c-1 .
# then open http://localhost:8321/dev/index.html
```

The harness fakes a board (16 labels, a card, pluginData store, REST endpoints) and shows
Trello's native order next to your custom order, with a live state inspector. Everything works
there: drag, rename, recolor, create, delete, prefix/recolor sync, auth flows, simulated API
failures. Run codec tests with `node dev/test-order.js`.

## Deploying for real Trello use

A Power-Up is just static files served over HTTPS from an origin that allows being iframed by
`https://trello.com`. GitHub Pages, Netlify, Cloudflare Pages, and Vercel all qualify.

1. **Host these files.** E.g. GitHub Pages: push this folder to a repo → Settings → Pages →
   deploy from branch root. Note your origin, e.g. `https://<you>.github.io/<repo>/`.
2. **Create the Power-Up** at <https://trello.com/power-ups/admin> → **New**:
   - Workspace: yours (the Power-Up is private to that workspace unless you later publish it).
   - **Iframe connector URL**: your hosted `index.html`, e.g.
     `https://<you>.github.io/<repo>/index.html`.
3. **Capabilities tab** — enable: `board-buttons`, `card-buttons`, `card-back-section`,
   `card-badges`, `show-settings`, `authorization-status`, `show-authorization`. A capability
   left unticked here simply never renders, even though the code registers it.
4. **API Key tab** → *Generate a new API Key*.
   - Copy the key into `js/config.js` → `APP_KEY`, and redeploy.
   - In **Allowed Origins**, add your hosting origin (e.g. `https://<you>.github.io`). Without
     this the authorize handshake cannot return the token.
   - The API key is a public identifier — committing it is normal for client-side Power-Ups. The
     secret is the per-member token Trello issues at authorization time; it stays in each
     member's browser.
5. **Enable it on a board**: board → **Power-Ups** → the **Custom** category in the left sidebar
   (or just search the directory for “Label Manager”) → Add.

   The board **must be in the same workspace you selected when creating the listing** — custom
   listings are scoped to one workspace, and the “Custom” category does not appear at all on
   boards outside it (or on personal boards that belong to no workspace). To use it from several
   workspaces, create one listing per workspace, all pointing at the same connector URL.
6. Click the **Label Order** board button, drag labels, done. The first time someone uses a
   feature that writes through the API (toggling from the picker, renaming, etc.) they'll be
   asked to click **Allow** once. Reordering itself needs no authorization.

## Serving several workspaces from one deployment

Custom listings are scoped to one workspace and **each listing gets its own API key**, so using
the Power-Up in a second workspace means a second listing. You do not need a second copy of these
files: point each listing's iframe connector URL at the same `index.html` and pass that listing's
key in the URL —

```
Listing A (your workspace):    https://you.example.com/index.html
Listing B (client workspace):  https://you.example.com/index.html?lmKey=<listing B's API key>
```

`?lmKey=` overrides `APP_KEY` from `js/config.js` and is carried onto the popup/modal iframes
automatically. Add the deployment origin to **Allowed Origins** for *each* key.

Note that the custom order is stored per board, so the two workspaces share code but never share
data.

## Troubleshooting

**A workspace is missing from the dropdown in the admin portal.** Only workspaces where you are a
**Workspace admin** are offered — being admin on that workspace's *boards* is not the same thing,
and workspace **guests** (invited to individual boards rather than to the workspace) never see it.
Check your role under the workspace's **Members** page; if you can't see the workspace's
**Settings** tab, you aren't a workspace admin. Enterprise-owned workspaces can additionally gate
this above the workspace level. After a role change, re-login before rechecking — the dropdown is
built at page load.

**The card's labels still show in Trello's color order.** Expected — the chips on the card front
and the “Labels” row on the card back are native Trello UI that no Power-Up can reorder. Your
order appears in the **Labels — your order** section further down the card back, in the card
button's picker, and (if enabled) in card-front badges. To move the *native* elements you must
change colors, via **Recolor to match order**.

**The card-back section or badges don't appear at all.** `card-back-section` / `card-badges` are
probably unticked on the listing's Capabilities tab in the admin portal.

**No “Custom” category in the board's Power-Ups directory.** There is no “Made by you” section —
it's called **Custom**, and it only renders when at least one custom listing exists *for that
board's workspace*. Confirm the workspace shown in the admin portal matches the workspace in the
board header. Boards in another workspace, or in none at all, will never show it. Fix by moving
the board or by adding a second listing in that workspace (same connector URL).

**Board button never appears, but the Power-Up is enabled.** The connector URL is wrong or not
reachable — open it directly in a browser; it must load over HTTPS and return the connector page,
not a 404. Also confirm `board-buttons` is ticked on the listing's Capabilities tab.

**The “Allow…” popup opens and immediately does nothing.** Your hosting origin is missing from
**Allowed Origins** on the API Key tab. Add the scheme + host only (e.g.
`https://you.github.io`), no path.

**Everything loads but label edits fail with 401.** The key in `js/config.js` doesn't match the
listing's API key, or the member's token was revoked — open the Power-Up's settings popup and
reconnect.

**Changes to the code don't show up.** Trello and GitHub Pages both cache aggressively; hard
refresh (Ctrl+F5), and remember Pages can take a minute to publish.

## Limitations and honest notes

- **Native UI stays native** unless you use the sync tricks: card-front chips and Trello's
  built-in picker keep Trello's color order (that's a platform restriction, not a bug here).
- **Recolor sync** covers the first 30 labels (the palette has 30 slots) and overwrites label
  colors; colorless labels gain a color, which also makes them start appearing on card fronts
  (colorless labels normally only show on the card back). Undo restores the backup.
- **Prefix sync** relies on the community-observed name tie-break within a color; Atlassian has
  never documented it. It also really renames labels — Butler rules or filters that match label
  names need updating.
- **Big boards**: Trello allows ~950–1000 labels per board. Board-level Power-Up storage is
  8 KB, so the custom order is kept for roughly the first 790 labels (you'll see a notice if
  truncation ever happens; drag-ordering hundreds of labels is not a realistic workflow anyway).
  On boards with more than ~50 labels, authorize the Power-Up so the manager can fetch the full
  list via REST (up to 1000; the client-library fallback may return fewer).
- **Concurrent edits**: last save wins for the whole order (fine in practice; orders change
  rarely).
- The label color hexes in `js/labels.js` approximate Trello's current palette for the Power-Up's
  own UI; Trello renders its own chips natively, so drift never affects real boards.
- **Prior art**: a paid Power-Up, “Reorder(able) Labels” (2025), exists but in practice does not
  let you dictate an arbitrary order — it works from Trello's native color sequence and has you
  remap labels onto those color slots to force an order, forfeiting your color choices (i.e., an
  assisted version of the recolor workaround). “Board Assistant” bundles its own label windows.
  This project keeps **order and color independent**: the drag-and-drop order is stored on the
  board and used by the picker as-is, and recolor/prefix native-sync are strictly optional.

## Sources

- Feature status: Atlassian community threads [865538](https://community.atlassian.com/forums/Trello-questions/Is-there-a-way-to-change-order-of-colors/qaq-p/865538), [1263529](https://community.atlassian.com/forums/Trello-questions/How-to-change-order-of-color-labels/qaq-p/1263529), [2061355](https://community.atlassian.com/forums/Trello-questions/How-do-I-re-order-labels/qaq-p/2061355), [2753906](https://community.atlassian.com/forums/Trello-questions/label-colour-and-label-order/qaq-p/2753906), [3236170](https://community.atlassian.com/forums/Trello-questions/Is-there-a-way-to-organise-the-order-in-which-the-labels-appear/qaq-p/3236170)
- Label API (no position field): [REST API — Labels](https://developer.atlassian.com/cloud/trello/rest/api-group-labels/), [OpenAPI spec](https://developer.atlassian.com/cloud/trello/swagger.v3.json)
- Limits: [REST API limits](https://developer.atlassian.com/cloud/trello/guides/rest-api/limits/) (`labels.perBoard: disableAt 950`), [t.set() size update — 8192 for board scope](https://community.developer.atlassian.com/t/update-t-set-data-size-limits/32879), [Getting & setting data](https://developer.atlassian.com/cloud/trello/power-ups/client-library/getting-and-setting-data/)
- 30-color palette values: [New Label Colors?](https://community.developer.atlassian.com/t/new-label-colors/61417), [garethjmsaunders/trello-label-colours](https://github.com/garethjmsaunders/trello-label-colours)
- Platform: [Power-Up client library](https://developer.atlassian.com/cloud/trello/power-ups/client-library/), [REST API client](https://developer.atlassian.com/cloud/trello/power-ups/rest-api-client/), [Capabilities](https://developer.atlassian.com/cloud/trello/power-ups/capabilities/)
