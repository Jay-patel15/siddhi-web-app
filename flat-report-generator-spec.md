# Flat Progress Report Generator — Full Spec & Prompts (v2)

## 1. What this product does

A module for construction/real-estate sites where a field user picks a **Site → Flat**, fills in a **room-by-room status report** (with photos), can **re-edit it anytime** as work progresses, and an **Admin** can create/configure sites and see **cumulative progress** across all flats.

**This module will be merged into an existing Attendance Management project** — so it reuses that project's auth/users, and is added as a new section rather than a standalone app.

**Confirmed stack:**
- **Hosting**: Vercel
- **Backend/DB**: Supabase (Postgres + Auth + Row Level Security)
- **Photo storage**: Google Drive (via Google Drive API, not S3/Cloudinary)
- **Integration**: merged into the existing attendance management codebase

> Assumption: since no stack was specified for the existing attendance project, this spec assumes it's reasonably modern JS (React/Next.js). If it's actually built differently (e.g. plain PHP, Django, Flutter), flag that and I'll adjust the integration approach — the data model and feature list below stay the same either way.

---

## 2. User roles

| Role | Can do |
|---|---|
| **Admin** | Create/edit sites, define floors & BHK types, auto-generate flats, view all reports, view cumulative/aggregate progress dashboards, manage users |
| **Field User / Site Engineer** | Select site → select flat → fill report → upload photos → submit/update report |
| (Optional) **Viewer/Client** | Read-only access to progress dashboard |

---

## 3. Data model

### Site
- `id`, `name`, `address`, `description`
- `total_floors`
- `bhk_types[]` — e.g. `["1BHK", "2BHK", "3BHK"]`
- `flats_per_floor` (or custom count per floor)
- `created_at`, `created_by`

### Flat (auto-generated from Site config, editable individually)
- `id`, `site_id`
- `flat_number` (e.g. "301")
- `floor_number`
- `bhk_type`
- `description`
- `status` (not started / in progress / completed) — derived from report

### Report (one per flat, **editable anytime**, not one-time submission)
- `id`, `flat_id`
- `updated_at`, `updated_by`
- `report_history[]` — lightweight audit log: `{ field_changed, old_value, new_value, changed_by, changed_at }` per edit, so admins can see who changed what and when (important since multiple site engineers may visit the same flat over weeks)

**Room-wise section** (repeatable for Hall, Kitchen, Bedroom 1, Bedroom 2, Bedroom 3, Bathroom 1, Bathroom 2...):
- `room_type` (hall / bedroom / kitchen / bathroom)
- `status` (not started / in progress / completed)
- `light_points` (count)
- `fan_points` (count)
- `geyser_points` (count) — typically kitchen/bathroom only
- `photos[]` (multiple images per room)
- `remarks` (free text, optional)

**Electrical/civil stage tracking** (per flat, not per room):
- `slab_piping` — status + photo(s)
- `box_piping` — status + photo(s)
- `rope_pulling` — status + photo(s)
- `wiring` — status + photo(s)
- `final_handover` — status + photo(s) + handover date + client signature/name (optional)

Each stage status options: `Not Started / In Progress / Completed`

### Photo
- `id`, `report_id` (or room_id / stage_id)
- `drive_file_id` — Google Drive file ID
- `drive_view_url` — shareable link (`webViewLink`) for displaying/opening in UI
- `drive_thumbnail_url` — for grid previews
- `caption`, `uploaded_by`, `uploaded_at`

### User
- `id`, `name`, `email`, `role` (admin/field_user/viewer), `assigned_sites[]`

---

## 4. Core features

### A. Admin Panel
1. **Site management** — create/edit/delete sites; set floors, BHK types, flats per floor
2. **Auto-generate flats** — button that creates flat records based on floors × flats-per-floor × BHK mix (with ability to manually override individual flats after)
3. **User management** — add field users, assign them to specific sites
4. **Cumulative progress dashboard**:
   - Site-level % completion (weighted average of all flats)
   - Breakdown by stage (slab piping %, box piping %, rope pulling %, wiring %, handover %)
   - Breakdown by room type completion
   - Filter by floor / BHK type / date range
   - Flat-level drill-down (click a flat to see its full report + photos)
5. **Export** — PDF/Excel report per flat or per site (nice-to-have, phase 2)

### B. Field User Flow
1. Login → see list of assigned sites
2. Select Site → see grid/list of flats (with color-coded status: red/yellow/green)
3. Select Flat → report form opens:
   - Flat details (auto-filled: number, floor, BHK, description)
   - Room-by-room accordion/tabs: Hall, Kitchen, Bedroom(s), Bathroom(s)
     - Each room: status dropdown, light/fan/geyser point counters (+/- steppers), photo upload (multi), remarks
   - Stage tracker section: Slab Piping / Box Piping / Rope Pulling / Wiring / Final Handover — each with status + photo upload
4. Save draft / Submit
5. **Re-edit anytime**: revisiting a flat loads the existing report pre-filled; any field can be changed, and each change is appended to that report's history log (who changed what, when) — nothing is locked after submission, since site visits happen over weeks

### C. Progress Calculation Logic
- Flat completion % = weighted average of (room completions + stage completions)
- Suggested weights (adjustable in admin config):
  - Rooms: 40%
  - Stages (slab/box/rope/wiring/handover): 60%, evenly split or custom weights
- Site completion % = average of all flat completion %

---

## 5. Confirmed tech stack

- **Frontend**: whatever the existing Attendance Management app already uses (assumed React/Next.js) — this module is added as new routes/pages inside it, sharing the existing layout, nav, and login session
- **Backend/DB**: **Supabase** (Postgres + Auth + Row Level Security for role-based access) — if the attendance app already uses Supabase, reuse the same project/instance and just add new tables; if it uses a different backend, Supabase can still run standalone and you'd link users by shared email/ID
- **Photo storage**: **Google Drive API**
  - Use a Google **Service Account** (or OAuth if photos should live in the admin's personal Drive) with a dedicated shared Drive/folder
  - Recommended folder structure: `Site Name / Flat Number / Room-or-Stage / photo.jpg` — auto-create subfolders on first upload
  - Store `drive_file_id` + `webViewLink` + `thumbnailLink` in Supabase; don't store binary images in Postgres
  - Set files to "anyone with link can view" (or domain-restricted) so thumbnails render without extra auth calls
- **Hosting**: **Vercel**
- **Auth**: reuse existing Supabase Auth session from the attendance app; extend the `users` table with a `role` column (`admin` / `field_user` / `viewer`) if not already present
- **Editing/versioning**: every report field is editable at any time; changes are appended to `report_history` for auditability rather than blocking edits

---

## 6. Full prompt for your coder (Claude Code / Cursor / any AI dev tool)

```
I have an existing Attendance Management web app (hosted on Vercel, using
Supabase as the backend). Add a new module to this same project called
"Flat Progress Report Generator" for tracking construction progress across
real-estate sites, flats, and rooms. This is NOT a separate app — it should
share the existing project's auth session, layout/navigation shell, and
Supabase instance. Add it as new routes (e.g. /reports/...) alongside the
existing attendance routes.

ROLES: Reuse the existing users table. Add a `role` column if not already
present (`admin` / `field_user` / `viewer`). Admins get full access; field
users only see sites assigned to them; viewers get read-only access to the
dashboard.

DATA MODEL (new Supabase tables, Postgres):
- sites: id, name, address, description, total_floors, bhk_types (jsonb array),
  flats_per_floor, created_by, created_at
- flats: id, site_id (fk), flat_number, floor_number, bhk_type, description,
  computed status (not_started/in_progress/completed)
- reports: id, flat_id (fk), updated_by, updated_at
  -- one active/editable report per flat; NEVER locked after submission
- report_rooms: id, report_id (fk), room_type (hall/kitchen/bedroom/bathroom),
  room_label (e.g. "Bedroom 1"), status, light_points (int), fan_points (int),
  geyser_points (int), remarks (text)
- report_stages: id, report_id (fk), stage_type (slab_piping/box_piping/
  rope_pulling/wiring/final_handover), status, handover_date (nullable, only
  for final_handover)
- photos: id, report_id (fk), room_id or stage_id (nullable fk to whichever
  it belongs to), drive_file_id, drive_view_url, drive_thumbnail_url, caption,
  uploaded_by, uploaded_at
- report_history: id, report_id (fk), field_changed, old_value, new_value,
  changed_by, changed_at
  -- append a row here on every edit to any report/room/stage field, so
  admins can audit who changed what and when. Reports are always re-editable;
  this table is what preserves accountability instead of locking submissions.

Apply Supabase Row Level Security: field users can only read/write rows for
sites they're assigned to (via a site_assignments join table); admins bypass
RLS via a service role or admin policy.

PHOTO STORAGE — GOOGLE DRIVE (not Supabase Storage/S3):
- Use the Google Drive API v3 with a Service Account (share a root Drive
  folder with the service account email so it has write access)
- On upload, auto-create folder structure if it doesn't exist:
  /{Site Name}/{Flat Number}/{Room or Stage Name}/
- Upload the photo, set permission to "anyone with link can view" (or
  domain-restricted, per your preference), then store the returned
  file id, webViewLink, and thumbnailLink in the `photos` table
- Do this via a Next.js API route (server-side) so the service account
  credentials never reach the client
- Compress/resize images client-side before upload to keep Drive usage and
  upload time reasonable on mobile data

ADMIN FEATURES:
1. CRUD for Sites (floors + BHK type config)
2. "Auto-generate flats" action: creates flat rows for
   floors × flats_per_floor × bhk_types distribution; manually editable after
3. Dashboard: cumulative % progress per site, breakdown by stage and by room
   type, filterable by floor/BHK/date, drill-down into individual flats,
   and a per-report change-history view (pulled from report_history)
4. Assign field users to sites (site_assignments table)

FIELD USER FEATURES:
1. Login (existing session) → list of assigned sites → grid of flats
   (color-coded by status)
2. Click a flat → report form, pre-filled if a report already exists:
   - Room sections (tabs/accordion) with status, point counters (+/- steppers),
     multi-photo upload to Google Drive, remarks
   - Stage tracker section (5 fixed stages) with status + photo upload
   - Save/Update — always editable, no locking; every changed field appends
     a row to report_history behind the scenes

PROGRESS CALC:
- Flat % = weighted avg (rooms 40%, stages 60%, evenly split across 5 stages)
- Site % = average of flat %

TECH STACK: Next.js (React) — extend the existing attendance app's Next.js
project rather than starting fresh. Supabase JS client for DB + Auth +
RLS. Google Drive API (googleapis npm package) for photo storage, called
from server-side API routes only. Tailwind CSS matching the existing app's
design system. Mobile-first responsive design (field users are on phones
on-site). Deployed on the existing Vercel project (add Google service
account credentials + any new Supabase keys as Vercel environment variables).

Please start by: (1) writing the Supabase SQL migration for the new tables
+ RLS policies, (2) the Google Drive API integration as a server route/util,
(3) API routes for CRUD on sites/flats/reports, (4) the admin dashboard UI,
(5) the field-user flat/report UI — reusing the existing app's nav shell and
component library where possible.
```

---

## 7. Prompt for Google Stitch (UI/screen design)

Stitch generates UI screens from prompts — keep this one focused purely on visual/UX description, not backend logic. Since this merges into an existing app, tell Stitch to design it as an *addition*, not a standalone product:

```
Design a mobile-first web app UI for a "Flat Progress Report" module that
will be added inside an existing Attendance Management app (so it should
feel like a natural extension — assume a simple top or side nav bar with
an "Attendance" section and a new "Progress Reports" section).

Style: clean, professional, construction/real-estate industry feel. Use a
trustworthy blue/teal primary color with clear status colors (red = not
started, yellow = in progress, green = completed).

Screens needed:

1. Progress Reports Home (Admin) — top summary cards showing overall
   completion % across all sites, a list of Sites as cards (name, address,
   floor/BHK count, completion % progress bar), a "+ Add Site" button

2. Add/Edit Site form — fields: Site name, address, description, total
   floors (number stepper), BHK types (multi-select chips: 1BHK/2BHK/3BHK/
   4BHK), flats per floor (number stepper), "Generate Flats" button

3. Site Detail / Flat Grid — grid of flat cards color-coded by completion
   status (red/yellow/green), each showing flat number, floor, BHK type,
   small progress ring; filter chips at top for floor number and BHK type

4. Flat Report Form (mobile-optimized, scrollable, editable at any time —
   show a subtle "last updated by [name] on [date]" line near the top) —
   - Header: flat number, floor, BHK, site name
   - Collapsible room sections (Hall, Kitchen, Bedroom 1, Bedroom 2, Bathroom):
     each with a status dropdown/pill selector (Not Started/In Progress/Completed),
     three counter inputs with +/- buttons for Light Points, Fan Points,
     Geyser Points, a photo upload area (grid of thumbnails + "add photo" tile),
     a remarks text field
   - Stage Tracker section below rooms: 5 rows (Slab Piping, Box Piping,
     Rope Pulling, Wiring, Final Handover), each row has a status pill and a
     small camera icon button for photo upload
   - Sticky bottom bar: "Save Changes" button (label it as saving/updating,
     not "submit", since reports are living documents that get re-edited)

5. Progress Dashboard (Admin) — bar chart of completion % by stage across
   the site, donut chart of room-type completion, a filterable/sortable
   table of flats with their % complete, a small "recent edits" activity
   feed (who updated what flat and when), export button

Use card-based layouts, rounded corners, soft shadows, generous touch
targets (this will be used on phones by site engineers with gloves/dusty
hands), and a bottom tab bar for Field User navigation (Sites / My Reports /
Profile) that sits alongside the existing Attendance app's navigation.
```

---

## 8. Suggested build order

1. Supabase schema/migration (tables + RLS policies) added to the existing project
2. Google Drive API integration (service account, folder auto-create, upload route)
3. Admin: Site CRUD + auto-generate flats
4. Field user: flat list + report form, with edit/history logging (core value, build this well first)
5. Progress calculation + dashboard
6. Report change-history view, exports (phase 2)
