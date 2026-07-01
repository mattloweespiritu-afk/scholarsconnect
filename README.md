# ScholarsConnect

> A full-cycle scholarship management portal built for Philippine higher education institutions — connecting students with scholarship opportunities and giving administrators the tools to manage every stage of the process.

---

## Overview

ScholarsConnect is a two-portal web system that digitizes the entire scholarship lifecycle: from a student's first application submission through document verification, admin review, approval, stipend disbursement, annual renewal, and appeals. Both portals are live-connected to a shared Firebase backend with real-time updates across all admin and student views.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 · CSS3 · JavaScript (ES Modules) |
| Backend / Database | Firebase Firestore (NoSQL, real-time) |
| Authentication | Firebase Authentication (email/password) |
| File Storage | Firebase Storage + Firestore inline base64 (Blaze-free fallback) |
| Icons | Bootstrap Icons 1.x (self-hosted) |
| Typography | Roboto (Google Fonts) |
| Hosting | Static file server (Live Server / any HTTP server) |

No frameworks. No build step. No bundler. Runs directly in the browser.

---

## Portals

### Student Portal
Everything a student needs to apply for, track, and maintain their scholarship.

| Page | Purpose |
|---|---|
| `dashboard.html` | Live summary — active scholarship, application status, disbursement timeline, quick actions |
| `scholarships.html` | Browse all open scholarship programs with slots, deadlines, and eligibility |
| `application.html` | 4-step guided application form with document upload and duplicate prevention |
| `myapplication.html` | Track all submitted applications and their current status |
| `mydocuments.html` | View and manage all uploaded requirement documents |
| `myprofile.html` | Personal, academic, financial, and guardian profile management |
| `notifications.html` | Application updates, approvals, disbursement releases, and admin messages |
| `disbursement.html` | Stipend release history and upcoming payment schedule |
| `renewal.html` | Annual scholarship renewal with 3-step form and document upload |
| `appeal.html` | Formal appeal submission for rejected applications |

### Admin Portal
Full operational control over the scholarship program.

| Page | Purpose |
|---|---|
| `admindashboard.html` | Live statistics, quick navigation, and global student/application search |
| `adminapplications.html` | Complete application queue with status filtering and bulk management |
| `adminapplicationreview.html` | Deep-dive application review — approve, reject, request re-upload, add remarks |
| `adminscholarships.html` | Create and manage scholarship programs; Scholar Roster panel per scholarship |
| `adminstudents.html` | Student records directory with soft-remove and restore functionality |
| `adminrenewal.html` | Renewal submissions queue and approval workflow |
| `admindisbursement.html` | Stipend release management for approved scholars |
| `adminreport.html` | Scholarship analytics and demographic reporting |
| `adminauditlogs.html` | Full audit trail of admin actions — approvals, removals, resets, restores |
| `adminsettings.html` | System configuration and admin account management |
| `securityverificationadmin.html` | OTP-secured second-factor access gate for sensitive admin operations |

### Auth Pages
| Page | Purpose |
|---|---|
| `login.html` | Email/password login for both student and admin roles |
| `register.html` | New student registration |
| `forgotpassword.html` | Password reset via Firebase email link |

---

## Key Features

### Scholarship Application Flow
- Students select a scholarship, fill personal and academic details, upload required documents, and review before submitting
- Duplicate prevention fires at **scholarship selection** (before the form is filled) and again at **submit time** as a safety net
- Both `scholarshipId` and `scholarshipName` are checked so legacy applications are also caught
- Blocked statuses: `submitted`, `under_review`, `approved`, `active`, `needs_reupload`
- Duplicate attempts are logged to `auditLogs` automatically

### Scholar Roster Panel
- Each scholarship has a slide-in roster panel showing all approved/active scholars
- Real-time slot count — fills bar updates the moment an application is approved or cancelled
- Duplicate detection within the roster — same student appearing twice is flagged with a red **DUPLICATE** badge
- Admin can cancel a duplicate directly from the panel; the slot count drops in real-time

### Student Record Management
- Soft-delete system — "Remove" marks `removed: true` on the Firestore document; nothing is permanently deleted
- All active applications are suspended at removal with their previous status saved as `_previousStatus`
- **Restore** reverses the removal exactly: the user document is un-removed and every suspended application is reinstated to its original status, restoring slot counts automatically
- Full audit log written for every remove and restore action

### Admin Dashboard Search
- Global search across students, applications, and scholarships from a single input
- Empty-query state shows 8 quick-navigation tiles for every admin section
- Students lazy-loaded from Firestore on first search; applications and scholarships served from real-time cache

### Real-Time Data
- All Firestore subscriptions use `onSnapshot` — the UI updates live without any refresh
- Firestore offline persistence enabled — second and subsequent page loads are instant from IndexedDB cache
- Firebase SDK served locally (no CDN dependency) for fast and reliable loading

### Security
- `auth-guard.js` protects all 21 authenticated pages — unauthenticated users are redirected to login
- Role-based routing: students and admins are separated by Firestore role field
- Admin sensitive actions are behind a secondary OTP verification screen
- Audit log records every significant admin action with timestamp, admin identity, and affected records
- No credentials, OTP values, or security secrets exist in client-side code

### Document Handling
- Files ≤ 640 KB are stored as base64 in Firestore (no Firebase Storage required — Spark plan compatible)
- Files > 640 KB use Firebase Storage with upload progress tracking
- Documents can be replaced; version history is preserved via `replacedAt` timestamp

### Forgot Password / BFCache Fix
- `pageshow` event with `persisted` flag detected — the confirmation screen is never shown when a user navigates back to the forgot-password page

---

## Firestore Collections

| Collection | Description |
|---|---|
| `users` | Student and admin profiles — role, academic info, financial info, guardian info |
| `applications` | Scholarship applications — status lifecycle, document links, duplicate keys |
| `scholarships` | Scholarship programs — type, slots, deadline, requirements, status |
| `documents` | Uploaded requirement files — linked to both user and application |
| `renewals` | Annual renewal submissions with uploaded COR and grade report |
| `renewalFiles` | Base64-encoded renewal document storage (Firestore-native, no Storage) |
| `disbursements` | Stipend release records per scholar per period |
| `notifications` | In-app notifications for both student and admin recipients |
| `appeals` | Formal appeal submissions for rejected applications |
| `auditLogs` | Immutable admin action log — approvals, removals, resets, duplicates blocked |

---

## Project Structure

```
dist/
├── index.html                  Entry point
├── html/                       All application pages (26 pages)
├── css/                        Per-page stylesheets + shared admin-shared.css
├── Javascript/                 Per-page ES module scripts + shared utilities
│   ├── firebase.js             Firebase app init + Firestore persistence config
│   ├── firebase-sdk/           Self-hosted Firebase SDK bundles (no CDN)
│   ├── auth-guard.js           Route protection for all authenticated pages
│   ├── user-profile.js         Shared profile loader + logout handler
│   ├── app.js                  Admin UI initialization (non-module)
│   └── realtime-notifications.js  Live admin notification counts
├── css/
│   ├── style.css               Student portal base styles + design tokens
│   └── admin-shared.css        Admin portal layout (sidebar, topbar, panels)
├── fonts/                      Self-hosted Bootstrap Icons
└── image/                      Logos and static assets
```

---

## Running Locally

1. Open the project folder in VS Code
2. Install the **Live Server** extension
3. Add this to `.vscode/settings.json`:
   ```json
   {
     "liveServer.settings.host": "localhost"
   }
   ```
4. Right-click `index.html` → **Open with Live Server**
5. Navigate to `http://localhost:5500`

> **Important:** The server must run on `localhost` (not `127.0.0.1`). Firebase Authentication only authorizes the `localhost` origin.

---

## Firebase Setup

This project requires a Firebase project. Credentials are **never committed** — they live in a local file that is excluded by `.gitignore`.

### Steps

1. Go to the [Firebase Console](https://console.firebase.google.com) and create a project
2. Enable **Authentication** → Email/Password provider
3. Create a **Firestore Database** in production mode
4. Enable **Storage** (optional — required only for files > 640 KB)
5. Copy `Javascript/firebase-config.example.js` → `Javascript/firebase-config.js`
6. Paste your project's SDK config values into `firebase-config.js`

```js
// Javascript/firebase-config.js  (gitignored — never commit this file)
export const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

> `firebase-config.js` is listed in `.gitignore`. It will never be included in commits or pull requests.

### Firebase SDK
The Firebase SDK (`12.13.0`) is self-hosted under `Javascript/firebase-sdk/` — no CDN calls, no internet dependency at runtime.

**Persistence:** Firestore offline persistence is enabled via `persistentLocalCache` + `persistentSingleTabManager`. Data loads from IndexedDB on repeat visits instantly.

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `--maroon` | `#5D1A1A` | Primary brand, sidebar, headers |
| `--gold` | `#F0C040` | Accent, active nav items, highlights |
| `--red` | `#C0392B` | Actions, errors, delete buttons |
| `--green` | `#198754` | Success states, approved badges |
| `--page` | `#EFEFEF` | Page background |
| `--surface` | `#FFFFFF` | Card/panel background |
| `--border` | `#E2E2E2` | All borders and dividers |

Font: **Roboto** — weights 400 · 500 · 700 · 800 · 900

Card border-radius: **18px – 22px** throughout both portals.

---

