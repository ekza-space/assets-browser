# Ekza Asset Library

A local and public 3D asset browser with English, 简体中文 and Russian interfaces.
Grid and focus views, live VRM animation, transparent previews, ratings, favorites,
search, license filters and attribution. The gallery uses the shared
[`@ekza/avatar-renderer`](https://github.com/ekza-space/ekza-avatar-renderer) runtime.

## Run locally

Requires Node.js 20+ and Python 3.10+. The SDK is pinned to a Git commit and builds
through its reviewed `prepare` script during installation.

```sh
npm ci
npm run dev
# http://localhost:4178
```

After building, `npm start` starts only the Python server. To use another dump:

```sh
python3 server.py --library /path/to/opensourceavatars --port 4178
```

The default source is `~/Yandex.Disk.localized/models/opensourceavatars`, or
`ASSETS_LIBRARY`. Models are read in place; the original source is never modified.
`AVATAR_RENDERER_PATH` can point to a local SDK checkout while building the runtime.

## Browse and curate

- 459 available VRMs, including VRM 0.x and 1.0, with transparent PNG previews.
- English by default; EN / 中文 / RU preference persists across reloads.
- Source collection names are provenance, **not our taxonomy**. All assets start
  unclassified (`classification: null`); future types can be assigned independently.
- Unavailable catalogue placeholders, including VIPE Heroes, are hidden. The
  original 4,274-record source manifest stays intact on disk.
- Ratings 1–5, independent likes, name/creator/tag search, license/rating filters.
- Orbit/pan/zoom, framing, auto rotation, wireframe, skeleton and expressions.
- Embedded animations take precedence. Otherwise the shared SDK supplies
  idle/walk/attack/cast/death, clearly identified as **SDK test motions**.
- Playback speed, pause and timeline. Transparent PNG snapshot download/save.
- JSON export includes reviews and attribution.

Keyboard: `1`–`5` rate, `0` clear, `L` like, arrows select, `/` search,
`Space` pause, `Escape` grid. Clicking a selected rating clears it.

## Storage and public mode

Local ratings live in `data/reviews.sqlite3`; thumbnails in `data/renders/`.
Both are ignored by Git. Back up `data/` with the server stopped, or export
reviews through the UI. Importing reviews through the UI is not implemented.

The public gallery is static. Model and thumbnail addresses resolve from pinned
IPFS CIDs; `modelUri` and `previewUri` retain canonical `ipfs://` addresses. Every
visitor's reviews stay in their own browser localStorage. The owner's SQLite DB,
local filesystem paths, credentials and Pinata inventory are never exported.

The public manifest preserves creator, license, source collection, original
record identity and content checksums. These are community assets, not implied
moderation approval or game admission in the Ekza Registry.

## Render and publish

With the local server running:

```sh
npx playwright install chromium    # once, if Chromium is not installed
npm run render                     # missing transparent previews only
npm run render -- --force           # regenerate all
npm run publish:ipfs                # requires PINATA_JWT in environment
npm run finalize:publication        # verify completeness, pin the public manifest
npm run verify:publication          # verify public gateway bytes across collections
npm run build:public               # produces dist/ for static hosting
```

`CHROMIUM_PATH` selects an existing browser; the scripts reuse the owner's
installed Chromium on this Mac. `ASSET_BROWSER_URL` overrides the render server.
`BROWSER_PROXY` optionally sets an HTTP proxy for browser checks of public IPFS
content (loopback servers bypass it).
Restart the local server after downloading new assets.

The uploader computes UnixFS CIDs and SHA-256 before uploading, snapshots existing
pins, reuses exact pinned content, and records durable receipts after each file.
Uploads are idempotent by content and resumable. New files use the existing Pinata
account; no plan or credential changes. Pinning is retained, with no auto-unpin.
Receipts and the private inventory stay in ignored `data/publication/`.
`catalog/manifest.json` is the reviewed public catalogue consumed by the build.

The public app is served under `/library/` on Hub, with a catalogue entry link.
`/studio-assets` remains the development integration and redirects to `/library/`
in production. Generated Hub artifacts identify this repository as their source;
edit the browser here and regenerate them.

## Verification

```sh
npm test                       # HTTP/SQLite/range/origin/path tests
npm run build                  # shared SDK bundle, rejects React in runtime graph
npm run test:ui                # isolated test SQLite on port 4179
npm run test:locales           # all languages, no missing-model placeholders
node scripts/check-public-mode.mjs # visitor-local ratings, no mutation API
node scripts/check-hosted.mjs   # real IPFS images and 3D; GALLERY_URL overrides URL
node scripts/check-hub.mjs     # local Hub running on port 7103
```

UI checks cover live animation, clips, timeline, ratings/likes after reload,
keyboard, filters, export, rapid model changes and mobile layout. Evidence is
written to ignored `test-results/`. The standalone Python API binds to loopback
and is only for local use; public hosting uses the static build.

## Attribution

[Open Source Avatars](https://www.opensourceavatars.com/),
[upstream registry](https://github.com/ToxSam/open-source-avatars).
Product reference: [ToxSam/osa-gallery](https://github.com/ToxSam/osa-gallery);
gallery code was not copied.

Creators include Polygonal-Mind, toxsam, NeonGlitch86 and vipe. Licenses belong to
individual records; the full upstream manifest includes CC-BY models and must not
be described as entirely CC0. Preview renders retain their model's license.
SDK test motions: [Universal Animation Library — Quaternius](https://quaternius.com/packs/universalanimationlibrary.html), CC0.

## Animate a library model

The inspector's **Open in Studio** action passes the selected catalogue key to Hub's `/studio-edit` route.
The paired Hub/Studio integration imports the verified IPFS model, lets the creator save an editable
`.ekzanim` project and export a VRM, then returns that export to Hub with the original author and licence.
Account upload, publication review and OMOBA submission are separate explicit steps. OMOBA currently uses
its own motions; authored clips remain in the project and original VRM.

For the local gallery on port 4178, the action expects Hub on port 7103 and Studio on port 3100. When served
inside Hub at `/library/`, it uses that Hub origin. Deploy the Studio receiver and Hub route together before
publishing the action. The manual download/upload path still works independently.
