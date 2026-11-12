# VALTORIX INFOTECH — website

The public marketing site for **VALTORIX INFOTECH**, a software studio in Hyderabad building
business websites, web applications, custom business software and AI automation.

Static HTML, CSS and JavaScript with no framework and no build step, plus one Vercel serverless
function that delivers the contact and project-request forms by email.

---

## Quick start

```bash
npm install          # only needed for the test suites
npm run dev          # serves the site on http://localhost:8099
```

The site itself needs nothing installed — it is plain files. `npm run dev` starts the small
Node static server in `scripts/serve.js` (Python's `http.server` is single-threaded and stalls
when a browser opens many parallel connections).

---

## What is here

```
index.html            Home
about-us.html         About the studio
services.html         The four practices
solutions.html        Solutions by stage and industry
projects.html         Selected work
contact.html          Contact form and details
start-a-project.html  The four-step project request form
privacy-policy.html   Privacy Policy
terms.html            Terms of Service
404.html              Branded not-found page

styles.css            The design system (one file, ~2 200 lines)
app.js                Shared behaviour for every page
api/send.js           Vercel serverless function: forms -> email

stage3d.js            The WebGL renderer for the persistent 3D stage
stage3d-geometry.js   Generated buffers (mark, slabs, grid, motes)
stage3d-init.js       Lazy bootstrap and the fallbacks

images/brand/         The traced logo asset set
scripts/
├── lint.js           The project lint gate
├── qa/_lib.js        Shared browser launch + reporting
├── qa-html.js        HTML validation (html-validate) + the document rules
├── qa-unit.py        Unit tests for the brand and 3D generators
├── qa-api.js         The mail endpoint: contract, limits, abuse, delivery
├── qa-security.js    Secrets, headers, injection, dependencies
├── qa-assets.js      Weight, WebP coverage, orphans, cache policy
├── build_brand.py    Traced logo -> the asset set
├── build_stage3d.py  Traced logo -> the 3D buffers
└── ...               the generators and the test suites
```

### Conventions

- **No inline styles.** Every visual value lives in `styles.css`; the markup carries intent
  (`mt-md`, `card--ink`) rather than presentation.
- **ES6 only.** `const` / `let` throughout, no `var`.
- **One canvas per page.** The 3D stage is a single fixed WebGL context behind the content.
- **The lint is the gate.** `npm run lint` fails on duplicate ids, missing labels, dead CSS,
  trailing commas in selectors, loose equality and `var`.

---

## How it works

### The 3D stage

Every page runs **one** fixed WebGL canvas behind the content. The page scrolls normally; scroll
position drives a camera forward through a world containing the extruded VALTORIX mark, floating
module panels, a blueprint floor grid and depth motes. The world moves through six authored
chapters — one per homepage section.

- `stage3d.js` is a hand-written renderer (no Three.js): 4 draw calls, ~500 triangles, ~21 KB
  gzipped, zero dependencies and no CDN.
- `scripts/build_stage3d.py` generates the geometry from `scripts/brand-data.json`, which is the
  traced polygon data of the real logo.
- WebGL is never the LCP element — the copy paints first and the canvas fades in over a static
  poster.
- `prefers-reduced-motion`, a missing WebGL context and a software renderer all fall back to the
  ordinary page with no layout shift.

Full detail: [`docs/3D_STAGE_IMPLEMENTATION.md`](../docs/3D_STAGE_IMPLEMENTATION.md).

### The forms

`contact.html` and `start-a-project.html` post to `POST /api/send`:

```json
{ "subject": "...", "replyTo": "...", "fields": { "Name": "...", ... } }
```

and get `200 { "ok": true }` immediately; the mail is sent in the background. The owner receives a
notification and the visitor gets an auto-reply. If the request cannot be sent the browser shows a
pre-filled WhatsApp fallback.

Both forms also work **without JavaScript**: they carry `method="post" action="/api/send"`, and the
endpoint accepts a plain urlencoded body as well as the JSON above.

**Required environment variables** (set them in the Vercel project):

| Variable | Purpose |
|----------|---------|
| `GMAIL_USER` | The Gmail address used as the SMTP sender |
| `GMAIL_APP_PASSWORD` | The Google app password for that account |
| `SITE_URL` *(optional)* | The public origin used in emails. Defaults to `https://valtorixinfotech-1446.vercel.app` |

---

## Working on the brand

The logo is **generated**, not hand-drawn. `scripts/brand-data.json` holds the traced polygons of
the supplied artwork; everything else is built from it.

```bash
python scripts/build_brand.py      # images/brand/*: SVG + PNG lockups, favicons, og-image
python scripts/build_stage3d.py    # stage3d-geometry.js: the 3D buffers
python scripts/build_webp.py       # WebP variants of every photograph
python scripts/use_webp.py         # <picture> elements for the WebP variants
python scripts/optimize-images.py  # re-encode the photographs
```

Re-run `extract_brand.py` only if the master artwork changes (it needs the source JPEGs).

---

## Testing

```bash
npm run qa                 # lint + every suite below
npm run lint               # the project lint gate
npm run qa:html             # HTML validation and the document rules
npm run qa:unit             # unit tests for the brand and 3D generators
npm run qa:api              # the mail endpoint: contract, limits, abuse, delivery
npm run qa:security         # secrets, headers, injection, dependencies
npm run qa:assets           # weight, WebP coverage, orphans, cache policy
npm run qa:site             # links, 404, content, forms, keyboard, Core Web Vitals, SEO data
npm run qa:responsive        # 25 viewports, reflow, 400% zoom, JavaScript disabled, tap targets
npm run qa:3d              # the 3D stage: chapters, camera, fallbacks, layout
npm run qa:functions       # 36 behavioural assertions
npm run qa:screenshots     # visual + asset audit, 10 pages x 2 viewports
npm run qa:crossbrowser    # Chromium, Firefox and WebKit
npm run qa:lighthouse      # accessibility / best practices / SEO gate
npm run qa:audit          # npm audit at the high threshold
```

The suites need the browsers once:

```bash
npx playwright install --with-deps chromium firefox webkit
```

`qa:unit` needs Python with Pillow and NumPy (the generators use them):

```bash
pip install pillow numpy
```

All of this also runs in CI on every push and pull request — see
[`.github/workflows/qa.yml`](.github/workflows/qa.yml).

### What the suites cover

| Suite | What it proves |
|-------|----------------|
| `lint` | ES6 everywhere, no `var`, no duplicate ids, one `h1` per page, title / description / canonical present, every `<img>` has alt and dimensions, every control has a label, no dead CSS, no trailing comma in a selector list, no loose equality, no inline styles |
| `qa-html` | The pages pass html-validate: valid nesting, one of each landmark and each named, the heading ladder has no skipped level, every `aria-labelledby` / `for` / `#anchor` resolves, the structured data parses, the forms declare their method and action |
| `qa-unit` | The geometry maths: the signed area, ear clipping, the inset, the edge normals, the mesh bookkeeping, the box faces, and the generated buffers — plus the brand: the SVG path, the rasteriser, the even-odd knockout, and the icon sizes |
| `qa-api` | The endpoint contract: the method, the payload shapes, the field and value caps, the honeypot, the rate limit, the escaping, and that the owner notification and the visitor auto-reply are actually built — with nodemailer mocked, so no test ever opens a socket |
| `qa-security` | No credentials committed, the security headers are set, no unescaped markup in the client, every `target="_blank"` has `rel="noopener"`, no plain-http resource, no unknown third party, the endpoint escapes and never trusts the visitor, the mail library is on a supported major, every dependency is pinned |
| `qa-assets` | Every referenced file exists, nothing ships unreferenced, every photograph has a WebP with a raster fallback, every content image is lazy, the render-blocking path is small, the cache policy is right and nothing unversioned is frozen |
| `qa-site` | Every link resolves, a junk URL shows the branded 404, no duplicate ids, forms validate and recover, Enter semantics, no double submit, the button locks in flight, data survives a validation error, the keyboard can complete every flow, Core Web Vitals are inside budget, the sitemap and structured data are valid |
| `qa-responsive` | 25 viewports including just-below / at / just-above every breakpoint, landscape, 400% browser zoom, 320px reflow, JavaScript disabled, 24×24 tap targets, a 12px type floor, 16px inputs so iOS does not zoom |
| `qa-3d` | One canvas per page, the six chapters wired, the camera travelling forward, cards staying solid over the scene, and all four fallbacks |
| `qa-crossbrowser` | The same behaviour in Chromium, Firefox and WebKit (Safari's engine) |
| `qa-lighthouse` | Accessibility, best practices and SEO at 100 on all ten pages |

### Two traps the harnesses deliberately avoid

- **`scrollWidth` is not proof of no overflow.** A clipping ancestor pins it to `clientWidth`, so
  "no horizontal overflow" can be a false pass. The harness asks whether the user can *actually*
  scroll sideways, and which elements' boxes escape the viewport.
- **Browser zoom is not `zoom: 4`.** Chrome shrinks the *layout* viewport, so media queries
  re-evaluate. 400% zoom is emulated as a 320×256 CSS px layout at device scale factor 4.

---

## Deploying

The repo deploys to Vercel as a static site plus one function.

- `vercel.json` sets `cleanUrls`, the cache and security headers, and a permanent redirect from
  the old `/strat-project` path.
- `.vercelignore` keeps the QA suites and the generator scripts out of what Vercel publishes.
- Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the project settings before going live, then send
  a live test message from both forms to confirm the owner mail and the auto-reply arrive.
- If the site moves to a custom domain, update the canonical URLs, the sitemap, the Open Graph
  tags and the `SITE_URL` variable.

**The full step-by-step — the invite, the push, the verification and the custom-domain
migration — is in [`docs/GOING_LIVE.md`](docs/GOING_LIVE.md).**

---

## Known follow-ups

- The four social links in the footer point at the platforms' home pages, not real profiles.
- `SiteTrack` and `Vayomi Clothing` are described but not shown with their own screenshots — the
  real product images would improve the case study.
- The photography is generic stock. Real studio and product photography is the weakest remaining
  part of the site.
