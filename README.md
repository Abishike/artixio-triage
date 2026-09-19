# Regulatory Intelligence Triage Pipeline

A mini decision-layer app for a compliance officer to view, triage, and manage
simulated regulatory updates. Built for the Artixio technical assignment.

- **Backend**: Node.js + Express + Prisma (PostgreSQL)
- **Frontend**: React (Vite) + TanStack Table + TanStack Query
- **Data**: Fully synthetic, seeded, and intentionally messy (see "Messy data" below)

---

## 1. Prerequisites

- Node.js 18+
- A running PostgreSQL instance (local install, or Docker — either works)

## 2. Setup (should take under 5 minutes)

### a. Database

If you don't already have Postgres running locally, the fastest path is Docker:

```bash
docker run --name artixio-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=artixio_triage -p 5432:5432 -d postgres:16
```

### b. Backend

```bash
cd backend
cp .env.example .env        # defaults already point at the Docker command above
npm install
npx prisma migrate dev --name init   # creates tables from prisma/schema.prisma
npm run seed                          # populates mock + messy data
npm run dev                           # starts API on http://localhost:4000
```

### c. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev                           # starts UI on http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to the
backend on port 4000 (see `frontend/vite.config.ts`), so no CORS
configuration is needed in development.

---

## 3. Database schema

```
RegulatoryAuthority (1) ──< (many) ComplianceDirective (1) ──< (many) ActionItem
```

- **RegulatoryAuthority** — the body issuing regulation (FDA, EMA, MHRA, PMDA).
  One authority issues many directives.
- **ComplianceDirective** — a single regulatory update/rule (title, reference
  code, effective date, raw status as received from the source feed).
- **ActionItem** — a concrete task a compliance officer must complete in
  response to a directive (description, assignee, priority, due date,
  status). Many action items belong to one directive.

**Why status is stored as a raw string, not a native enum:** the whole point
of this pipeline is that source feeds send inconsistent values —
`"Pending "`, `"withdrawn!!"`, `"n/a"`, `""`. A Postgres enum would reject
those at insert time, which defeats the exercise. Instead, `rawStatus` is
stored verbatim and a **read-time normalization layer**
(`backend/src/validation.ts`) maps it to a clean `PENDING | IN_PROGRESS |
RESOLVED | BLOCKED` (or `ENACTED | PROPOSED | WITHDRAWN | UNKNOWN` for
directives) value on every API response. This also means improving the
mapping logic later is just a code change, not a migration + backfill.

No `flagged` column is persisted either, for the same reason: whether a
record is flagged depends on several inputs at once (status, missing dates,
and — for action items — the *parent directive's* status), so it's
recomputed on every read rather than risking staleness.

---

## 4. The "messy data" and how it's handled

Seeded in `backend/prisma/seed.ts`:

| Case | Example | Handling |
|---|---|---|
| Missing critical date | `effectiveDate: null` on the EMA pharmacovigilance directive; several missing `dueDate`s | Flagged with a specific reason (`"Effective/due date is missing."`); rendered in the UI as an italic em-dash rather than a crash |
| Conflicting status codes | A `WITHDRAWN`/`UNKNOWN` directive whose action items are still `IN_PROGRESS`/`PENDING` | `detectStatusConflict()` in `validation.ts` compares the normalized parent-directive status against the normalized action-item status and adds an explicit flag reason |
| Malformed / garbage status strings | `"withdrawn!!"`, `"n/a"`, `""`, `"blocked??"` | `normalizeDirectiveStatus` / `normalizeActionItemStatus` strip punctuation and case before matching; anything unrecognized falls back to a safe default (`UNKNOWN` / `PENDING`) **and is flagged**, rather than throwing |
| Malformed text | HTML tags and stray whitespace in titles/summaries (`"<b>Accelerated Approval</b> Pathway..."`) | `sanitizeText()` strips tags and collapses whitespace before the text ever reaches the frontend |
| Duplicate reference codes | Two directives both using `EMA-2026-0143` | Schema does **not** enforce uniqueness on `referenceCode` (this is realistic — source systems are inconsistent); both rows still render correctly in the UI since the app keys off the internal `id`, not the human-facing reference code |
| Overdue, unresolved items | Due dates in the past with a non-`RESOLVED` status | Computed and flagged at read time, shown in red in the UI |

All of this happens inside `GET /api/action-items` and `GET /api/directives`,
which **never throw on a bad row** — a single malformed record degrades to
"flagged with a reason," never a 500 or a blank screen.

---

## 5. API

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/directives` | All directives, normalized + flagged |
| `GET` | `/api/action-items` | Filterable by `status`, `priority`, `flagged`, `authorityId`, `search`; paginated |
| `PATCH` | `/api/action-items/:id` | Update `status` / `assignee` / `priority` / `dueDate`; body validated with Zod, rejected with `400` + details on bad input |

---

## 6. Frontend

Single page, dense triage table (TanStack Table) backed by TanStack Query.
Deliberately avoids the "big rounded metric cards" dashboard look in favor of
a compact, scannable data-terminal style, since the intended user is a
compliance officer processing dozens of records quickly, not glancing at a
summary. Status can be changed inline via a dropdown in each row (calls the
`PATCH` endpoint and refetches). Flagged rows are tinted and show a ⚠ badge
with the specific reason(s) on hover.

---

## 7. Loom video walkthrough

Not included in this repo — record a ≤5 minute screen walkthrough covering:

1. **The schema** — why the three entities are related this way, and why
   status is a raw string normalized at read time (see section 3 above,
   it's already written out for you to talk through).
2. **The edge cases** — pull up a flagged row in the UI, hover the ⚠ icon,
   and show the actual reason string coming from `validation.ts`.
3. **The AI workflow** — name one specific thing an AI coding tool got
   wrong while you were building this and how you caught/fixed it. This
   has to be a real moment from your own build session — it's asking about
   your process, not the code itself.
