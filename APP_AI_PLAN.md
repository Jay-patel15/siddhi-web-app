# Plan: SE-WEB → App (Admin + Employee) + AI Payment Screenshot Reading

**Status:** proposal, nothing implemented yet.
**Date:** 2026-09-12

---

## 0. TL;DR of the approach

| Want | Chosen path | Why not the other thing |
| :--- | :--- | :--- |
| "App for both emp and admin" | **One PWA, role-aware after login** | Two separate apps means splitting the origin into `/admin/` and `/emp/` scopes — breaks every relative asset path and the legacy redirects in `server.js` for a cosmetic gain |
| "Convert into app" | **PWA** (manifest + service worker, ~80 lines) | React Native / Flutter = rewriting 8,200 lines of working vanilla JS for zero new capability |
| "Share screenshot to the app" | **Web Share Target API** (a manifest entry), admin-only | Already half-built: the payment form takes a screenshot file today. Share target just adds the OS share-sheet entry |
| "AI reads payments" | **NVIDIA NIM vision model, server-side, returns a _draft_** | Auto-writing money rows from OCR output is how you silently corrupt a payroll ledger |
| "Updates the amounts" | **Nothing to build** — insert a `payments` row and the existing carry-forward math recomputes | The formulas in `PROJECT_CALCULATIONS.md` sections 6 and 7 already derive Remaining Due from payments |

Two decisions carry this plan:

1. **AI proposes, human confirms, existing code writes.**
2. **Roles are enforced on the server, not in the browser.** Shipping an installable app to every worker's phone makes the current client-side-only role check untenable — see section 4, which is now the largest piece of work.

---

## 1. What already exists (do not rebuild)

Verified by reading the repo:

- `server.js` — Express, serves `frontend/` statically, mounts 11 API routers. Deploys to Vercel serverless.
- `frontend/login.html` — **already has an admin/employee toggle**, and at lines 93-97 **already auto-redirects a returning user to the right portal by role** (admin → `sections/dashboard.html`, employee → `employee-portal.html`) with session-age checks. The PWA gets role-aware launch for free.
- `frontend/employee-portal.html` (3,404 lines) — employee side. Check-in/check-out, attendance photo upload, own salary summary.
- `frontend/js/app.js` (4,790 lines) + `frontend/sections/*.html` — admin side.
- `backend/routes/payments.js` — **already accepts a screenshot** via `upload.single('screenshot')`, pushes it to Supabase Storage, saves the public URL on `payments.screenshot`.
- `frontend/js/app.js:3141-3160` — already compresses the image client-side and POSTs `FormData` to `/api/payments`.
- `backend/middleware/upload.js` — multer memory storage. Reusable as-is for the AI route.
- `schema.sql:97-106` — `payments` table with a `screenshot TEXT` column.
- Payroll math — `backend/routes/payroll.js` + `frontend/js/app.js:1072-1081`. **Untouched by this plan.**

So the AI feature is one new route plus a confirm dialog, and the app feature is three new static files. The role work is the part that needs real attention.

---

## 2. Phase 1 — One installable app, two roles

### Why one app and not two

`login.html` already routes by role on launch, so a single install serves both audiences with no new routing code. Two installable PWAs on one origin would need distinct `scope` values, which means physically moving `employee-portal.html` and `sections/*` into `/emp/` and `/admin/` directories — breaking relative asset paths, the `legacyPages` redirect list in `server.js:57-61`, and every hardcoded link in 8,200 lines of frontend.

If two separate home-screen entries later become a hard requirement (for example, two Play Store listings), Capacitor can build two targets from the same codebase with different `start_url`s. Not now.

### Cheap win: remember the role choice

An installed app that asks "are you admin or employee?" every launch feels like a website. The redirect logic at `login.html:93-97` already handles returning sessions; extend it so the last-used role pre-selects the toggle on a cold launch. ~5 lines, and the app opens where the user expects.

### Session lifetime needs a rethink for app use

Current expiry: **admin 12h, employee 1h** (`login.html:93-97`). A 1-hour employee session means re-logging in every shift — tolerable on a website, irritating on a home-screen app. Raise the employee session to roughly a shift length (8-12h) when tokens land in Phase 4, so this is one value change rather than a redesign.

### Files to add

**`frontend/manifest.json`**

```json
{
  "name": "Siddhi Electricals Payroll",
  "short_name": "SE Payroll",
  "start_url": "/login.html",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a73e8",
  "icons": [
    { "src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "files": [{ "name": "screenshot", "accept": ["image/png", "image/jpeg", "image/webp"] }]
    }
  }
}
```

**`frontend/sw.js`** — two jobs only:

1. Cache the app shell — `login.html`, `employee-portal.html`, `css/*`, `js/app.js`, `assets/*`. Cache **both** portals' shells, since one install serves both roles.
2. Intercept the share-target POST (see Phase 3).

Do **not** cache `/api/*` responses — payroll data must be live.

**In `login.html`, `employee-portal.html`, and each `sections/*.html`** `<head>`:

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#1a73e8">
```

Plus one registration line: `navigator.serviceWorker?.register('/sw.js')`.

### Server change

`server.js` already serves `frontend/` statically, so `manifest.json` and `sw.js` are served automatically. One addition — the share-target route must not 404 on a cold start before the service worker is active:

```js
app.post('/share-target', (req, res) => res.redirect(303, '/sections/payments.html?shared=pending'));
```

### Icons

Need real 192px and 512px PNGs. `assets/favicon.png` is likely too small — check its dimensions and regenerate from `assets/logo-vertical.jpg` if so.

### Deliverable

One app installable from Chrome on Android ("Add to Home screen"), own icon, no browser chrome, opens offline to the login shell, and lands each user in their own portal.

**Skipped:** Play Store listing, push notifications, background sync. Add when someone actually asks.

---

## 3. Phase 2 — What each role gets from the app

### Employee app

The wins here are mobile-native, not new screens:

- **Camera-first attendance photo.** Add `capture="environment"` to the photo input so tapping it opens the camera directly instead of a file browser. One attribute, and it is the single biggest daily-use improvement for a worker on site.
- Installable icon, no URL bar, offline shell so the portal opens on bad site WiFi.
- Own salary summary / attendance / advances / payments — already built, now served securely (section 4).

**Not** giving employees the share target. Nobody asked for it, and payments are recorded by admin. If an employee shares an image into the app, show "Payments are recorded by the office" and stop. Do not build a second parallel flow speculatively.

### Admin app

- Share-sheet payment capture (Phase 3) plus AI extraction (Phase 5).
- Camera/file fallback for the same, via the existing `#pay-screenshot` input.
- Everything the admin dashboard does today.

---

## 4. Phase 3 — Role enforcement on the server (the real work)

This section exists because of what is currently true, all of it verified in the code:

- `frontend/employee-portal.html:2254-2259` fetches **`/api/employees`, `/api/attendance`, `/api/advances`, `/api/debit-notes`, `/api/payments`** — the complete, unfiltered tables for *every* employee — then filters client-side to display one person's data.
- `GET /api/employees` returns `dbService.getAllEmployees()`, which is `supabase.from('employees').select('*')` (`supabase-db.js:95`) with no field filtering. That payload includes every employee's `salary`, `contact`, and **plaintext `password`**.
- The admin guard is `session.role !== 'admin'` read from `localStorage` (`app.js:156`). An employee can edit one localStorage value and load the admin UI.
- No `/api/*` route checks authentication at all, so that fabricated admin session works end to end — including `DELETE /api/factory-reset`.

**Any employee today can read every colleague's salary and password.** Putting this on every worker's phone as an installed app is what turns a latent exposure into a certainty, so this has to land with the app, not after it.

### 4a. Issue a real token on login

`POST /api/login` currently returns `{success, role, name, id}` and nothing more. Change it to also return a signed token carrying `{role, empId}`. Any signing approach is fine (`jsonwebtoken`, or Node's built-in `crypto.createHmac` over a compact payload — no dependency needed).

### 4b. One middleware, mounted once

```js
// backend/middleware/auth.js
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const claims = verify(token);              // null if bad/expired signature
  if (!claims) return res.status(401).json({ error: 'Not signed in' });
  req.auth = claims;                          // { role, empId }
  next();
}
const requireAdmin = (req, res, next) =>
  req.auth?.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });
```

Mounted at the router level in `server.js`, so a new route cannot forget it:

```js
app.use('/api', authRoutes);                                   // login stays public
app.use('/api/employees',  auth, requireAdmin, employeeRoutes);
app.use('/api/payroll',    auth, requireAdmin, payrollRoutes);
// ...
```

### 4c. Route-by-route access table

| Route | Admin | Employee | Note |
| :--- | :--- | :--- | :--- |
| `POST /api/login` | public | public | rate-limit it |
| `GET /api/employees` | full | **denied** | leaks salaries + passwords |
| `POST/PUT/DELETE /api/employees` | yes | denied | |
| `GET /api/attendance` (all) | yes | denied | |
| `POST/PUT /api/attendance` | yes | **own only** | `empId` from token, never from body |
| `POST /api/attendance/upload-photo` | yes | own only | |
| `GET /api/advances`, `/api/debit-notes`, `/api/payments` | yes | denied | own data via `/api/me/summary` |
| `POST/PUT/DELETE` on those | yes | denied | |
| `GET /api/settings` | yes | read-only | needs `standardHours` / `slabHours` |
| `PUT /api/settings` | yes | denied | |
| `GET /api/payroll`, `/api/uploads` | yes | denied | |
| `POST /api/ai/parse-payment` | yes | denied | |
| `DELETE /api/factory-reset` | yes + password | denied | |

The critical line: for employee writes, **take `empId` from the verified token, never from the request body.** Otherwise an employee posts attendance as someone else.

### 4d. Replace six leaky fetches with one scoped endpoint

Rather than filtering five existing routes, add one endpoint that returns exactly what the employee portal needs, already scoped server-side to `req.auth.empId`:

```
GET /api/me/summary
  → { employee, attendance[], advances[], debitNotes[], payments[], settings }
```

This is better on every axis that matters here:

- **Closes the leak** — an employee's response contains only their own rows, and the `password` field is stripped before it is sent.
- **Six round trips become one** — a real speed win on site WiFi, which is the whole point of the app.
- **Deletes client code** — `employee-portal.html:2254-2259` and its client-side filtering collapse into a single fetch.

The five admin routes then simply get `requireAdmin` and need no per-role filtering logic at all.

---

## 5. Phase 4 — Share a screenshot into the app (admin)

The flow that makes it feel native: pay a worker in PhonePe/GPay, tap Share on the receipt, pick "SE Payroll", and the payment is drafted.

### How the share target works

Android posts a `multipart/form-data` request to `/share-target`. A POST body cannot be read by the landing page directly, so the service worker intercepts it:

```js
// sw.js
self.addEventListener('fetch', (e) => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname === '/share-target') {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('screenshot');
      if (file) {
        const cache = await caches.open('shared-inbox');
        await cache.put('/__shared__', new Response(file, {
          headers: { 'Content-Type': file.type }
        }));
      }
      return Response.redirect('/sections/payments.html?shared=1', 303);
    })());
    return;
  }
});
```

The payments page then checks `?shared=1`, pulls the blob from `caches.open('shared-inbox')`, deletes it from the cache, and drops it into the AI-parse flow.

**Role check on arrival:** the landing page must confirm the session is admin before doing anything with the shared file. An employee who shares an image gets the "recorded by the office" message, and the blob is discarded from the cache.

### Fallbacks (required, not optional)

- **iOS / Safari: Web Share Target is not supported.** iPhone users get no share-sheet entry and use the in-app camera/file button instead.
- **Desktop:** same file button.
- Both covered by the existing `#pay-screenshot` input, which just needs `capture`:

  ```html
  <input type="file" accept="image/*" capture="environment">
  ```

### If iOS share-sheet support becomes a hard requirement

Wrap the *same* PWA in **Capacitor** and add a native iOS Share Extension. Same codebase, one extra build target. Do this only when an iPhone user complains — not upfront.

---

## 6. Phase 5 — AI reading of the payment screenshot (NVIDIA)

### Provider details (verified Sept 2026)

- Base URL: `https://integrate.api.nvidia.com/v1` — **OpenAI-compatible**, so use the `openai` npm package and just swap `baseURL`.
- Free tier: API key from build.nvidia.com, one-time phone verification, no card.
- **Rate limit: ~40 requests/min per key, shared across all models.** Fine here (a few payments a day).
- Two options for reading the image:
  - **Vision-language model** via `/chat/completions` (e.g. a Llama vision instruct model) — understands layout, can return structured JSON. **Use this.**
  - Dedicated `/v1/ocr` endpoint — returns raw text plus bounding boxes, with its own non-OpenAI schema. More work: you would have to parse rupee symbols and dates out of loose text yourself.
- Images go as a base64 data URI: `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}`. JPEG preferred.
- A `403` means that model family needs a one-time registration click on its build.nvidia.com page.
- **Licensing caveat to review before production:** the free tier is framed for development/testing/research, and self-hosted NIM production deployment wants an NVIDIA AI Enterprise license. Read the current terms for the *hosted* endpoint before running real payroll through it.

### New file: `backend/routes/ai.js`

`POST /api/ai/parse-payment` — admin only, accepts the image, returns a **draft**. Writes nothing.

```js
const OpenAI = require('openai');
const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1'
});

router.post('/parse-payment', upload.single('screenshot'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });

  const b64 = req.file.buffer.toString('base64');
  const r = await nvidia.chat.completions.create({
    model: 'meta/llama-3.2-90b-vision-instruct',
    max_tokens: 300,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${b64}` } }
      ]
    }]
  });

  const draft = validateDraft(r.choices[0].message.content);  // throws on junk
  res.json(draft);
});
```

### The prompt

Strict, JSON-only, explicit nulls:

> You are reading an Indian payment app screenshot (PhonePe / GPay / Paytm / bank transfer / UPI).
> Return ONLY a JSON object, no prose, no markdown fence:
> `{"amount": number|null, "date": "YYYY-MM-DD"|null, "mode": "UPI"|"Cash"|"Bank Transfer"|null, "refNo": string|null, "payeeName": string|null, "confidence": 0.0-1.0}`
> `amount` is the rupee amount transferred, digits only, no currency symbol or commas.
> `refNo` is the UTR / transaction ID / order ID.
> `payeeName` is who received the money.
> Use null for anything not clearly legible. Do not guess. Set confidence low if the image is unclear.

`temperature: 0` — this is extraction, not creativity.

### `validateDraft()` — the trust boundary. Non-negotiable.

The model output is untrusted text. Every one of these checks earns its place:

```js
function validateDraft(raw) {
  // strip the ```json fence the model adds anyway
  const txt = raw.trim().replace(/^```(?:json)?|```$/g, '').trim();
  let d;
  try { d = JSON.parse(txt); }
  catch { throw new Error('AI returned non-JSON'); }

  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    throw new Error('AI returned an implausible amount');
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null;

  return {
    amount: Math.round(amount * 100) / 100,
    date,
    mode: ['UPI', 'Cash', 'Bank Transfer'].includes(d.mode) ? d.mode : null,
    refNo: typeof d.refNo === 'string' ? d.refNo.slice(0, 64) : null,
    payeeName: typeof d.payeeName === 'string' ? d.payeeName.slice(0, 100) : null,
    confidence: Number.isFinite(+d.confidence) ? +d.confidence : 0,
    needsReview: !date || !d.refNo || (+d.confidence || 0) < 0.8
  };
}
```

Note the upper bound on amount and the `needsReview` flag. A vision model misreading `1,500` as `1500000` is a realistic failure; the ledger must not absorb it quietly.

### Employee matching — do not auto-assign

`payeeName` from a UPI receipt is often a bank-registered name that differs from the payroll name ("JAY K PATEL" vs "Jay Patel"). Plan:

1. Normalise (lowercase, strip punctuation and titles) and compare against `employees.name` and `employees.customId`.
2. **Exactly one** strong match — pre-select it in the dropdown, still visible and changeable.
3. Zero or multiple matches — leave the dropdown empty, admin picks.

Never insert a payment against a guessed employee.

### Duplicate guard — this is what "tracking" actually means

The same screenshot shared twice must not double-count. Before insert, check the extracted `refNo` against existing payments. If it exists, show "This transaction (UTR xxx) is already recorded on <date>" and refuse to create a second row.

This is the highest-value safety check in the feature. Without it, share-to-app makes double-entry *easier* than the current manual form.

---

## 7. Phase 6 — Schema additions

Append to `schema.sql` (additive, no migration of existing rows needed):

```sql
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ref_no        TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ai_extracted  BOOLEAN DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC;

CREATE INDEX IF NOT EXISTS idx_payments_ref_no ON public.payments(ref_no);
```

`ref_no` powers the duplicate check. `ai_extracted` and `ai_confidence` let you audit later which rows a machine drafted — you will want this the first time a number looks wrong.

Deliberately **not** adding a `status` / pending-approval column: the draft lives in the browser until the admin hits Save, so an unconfirmed payment never reaches the database at all. Simpler, and nothing can leak into payroll half-approved.

---

## 8. Phase 7 — Admin UI flow for AI capture

Single new confirm step, reusing the existing payment modal:

```
screenshot arrives (share sheet | camera | file picker)
        |
POST /api/ai/parse-payment          [spinner: "Reading receipt..."]
        |
prefill the EXISTING payment modal:
   amount / date / mode / ref no / employee (if confidently matched)
   warning banner if needsReview - "Check these values against the screenshot"
   the screenshot shown side by side with the fields
        |
admin edits anything wrong, picks employee, hits Save
        |
existing POST /api/payments  (unchanged - uploads image, inserts row)
        |
existing payroll math recomputes Remaining Due automatically
        |
employee sees the updated balance in their app via /api/me/summary
```

Every AI-filled field stays editable, and the screenshot stays on screen next to the numbers so verification takes one glance.

---

## 9. Remaining security items

Beyond the role enforcement in section 4:

1. **A real admin password is hardcoded as a fallback in `backend/routes/auth.js`** (lines 6-7 and 49) and is committed to git history.
   Fix: remove the fallback, require the env var, and **rotate that password**. It must be treated as public now. Urgent regardless of this project.

2. **Employee passwords are stored and compared in plaintext** (`auth.js:31`).
   Fix: hash them (bcrypt or argon2) and compare hashes. This also means `select('*')` stops being a password leak even if a route regresses.

3. **Supabase RLS is `USING (true)` on every table** (`schema.sql:169-187`) — fully public read/write. Anyone with the project URL and anon key bypasses the Express API entirely, which makes section 4's work moot on its own.
   Fix: with a service key already on the server, tighten these to deny anonymous access.

4. **`NVIDIA_API_KEY` must stay server-side only.** Never call NVIDIA from client code. It goes in `.env` (already gitignored) and in Vercel env vars.

5. **Rate-limit `POST /api/login`.** Employee credentials are name + short password, and the app puts that endpoint on every phone.

---

## 10. Deployment notes (Vercel)

- **Function timeout.** A vision-model call can take 5-15s. Vercel's default serverless timeout will cut that off. Set `maxDuration` in `vercel.json` and handle the timeout in the UI with a "Try again / enter manually" fallback.
- **Request body limit.** Vercel caps request bodies around 4.5MB. The frontend already compresses screenshots before upload (`app.js:3160`), so this should be fine — but the AI route must reject oversized files with a clear message rather than dying.
- **Service worker caching.** `sw.js` must be served with `Cache-Control: no-store`, otherwise a stale service worker pins an old app shell on every installed phone — including employees' phones, which you cannot easily force-refresh. `server.js` already does this for `.html`; extend the same rule to `sw.js` and `manifest.json`.
- New env vars: `NVIDIA_API_KEY`, and a signing secret for tokens.

---

## 11. Build order

Security first, because every later step widens exposure.

| # | Step | Depends on | Rough size |
| :- | :--- | :--- | :--- |
| 1 | Remove hardcoded admin password + rotate it | — | 10 min |
| 2 | Token on login + `auth` / `requireAdmin` middleware | — | ~70 lines |
| 3 | Apply the section 4c access table at router mounts | 2 | ~15 lines |
| 4 | `GET /api/me/summary`; rewire employee portal to it | 3 | ~80 lines, deletes more |
| 5 | Hash employee passwords; strip `password` from all responses | 2 | ~40 lines |
| 6 | Tighten Supabase RLS | 2 | SQL only |
| 7 | `manifest.json`, `sw.js`, head tags, icons (both portals) | — | ~80 lines |
| 8 | `capture="environment"` on attendance + payment photo inputs | 7 | 2 attributes |
| 9 | Employee session length + role-remembering launch | 2, 7 | ~10 lines |
| 10 | Schema: `ref_no`, `ai_extracted`, `ai_confidence` | — | 4 lines SQL |
| 11 | `backend/routes/ai.js` + `validateDraft` + duplicate check | 10 | ~120 lines |
| 12 | Prefill UI in existing payment modal | 11 | ~80 lines |
| 13 | Share-target SW interception + admin-gated pickup | 7, 12 | ~40 lines |

Steps 1-6 are shippable on their own and worth deploying before any app work. Steps 7-9 deliver the employee app. Steps 10-13 deliver the AI capture.

---

## 12. Tests worth writing (and only these)

- `validateDraft()` against: valid JSON, a json-fenced response, prose instead of JSON, `amount: "1,500"`, `amount: -5`, `amount: 99999999`, missing date. Pure function, no mocks, no network — an assert-based self-check is enough.
- Duplicate `ref_no` rejection.
- **An employee token cannot reach an admin route**, and `/api/me/summary` returns no other employee's rows. This is the one that protects real data.

Money paths and the role boundary are exactly where a test earns its keep. No test framework needed.

---

## 13. Explicitly out of scope

- React Native / Flutter rewrite — revisit only if the PWA proves insufficient.
- Two separate installable apps — one role-aware install first; Capacitor can split later if genuinely needed.
- Play Store / App Store listing.
- Employee-side share target, employee-initiated payment entry, or employees editing their own attendance history.
- Auto-reading SMS or bank statements — a much larger permission and reliability problem.
- Fully autonomous payment entry with no human confirm — **not recommended at any point.** OCR on payment receipts will be wrong occasionally, and this is a payroll ledger.
- Push notifications, offline write queue, background sync.
