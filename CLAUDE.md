# CLAUDE.md — Siraat tul Jannah

Claude Code reads this file at the start of every session. It is the project's
standing brief: keep it short, true, and up to date.

## What this is
Online Quran academy LMS for **Siraat tul Jannah** (founder: Hafiza Aqsa Jamil).
Replaces WhatsApp-based class coordination. One codebase family:
- `backend/` — Node.js + Express 5 REST API in TypeScript, PostgreSQL via Prisma 7
- `web/` — React.js desktop website (not scaffolded yet)
- `mobile/` — React Native (Expo) app (not scaffolded yet)
- `docs/` — decisions log and build roadmap

Clickable prototype (source of truth for screens/UX):
https://claude.ai/artifact/7m7B8AWvEGj338MsGGGddY

## The owner is learning
The project owner is a coding beginner. When working here:
- Explain what you're doing and why, briefly, in plain language.
- Mention a realistic alternative when a choice matters.
- Prefer boring, well-documented tools over clever ones.

## Data model rules (see `backend/prisma/schema.prisma`)
- Base `users` table + one of `students` / `teachers` / `admins` (each has `user_id`).
- All primary keys are UUIDs. Tables snake_case plural, Prisma models PascalCase singular.
- `enrollments` has its own `id`. One student → many enrollments.
- **Only one PENDING/APPROVED enrollment per (student, course).** Enforced in the
  service layer AND by the partial unique index
  `enrollments_one_active_per_student_course` (hand-written in the init migration).
  Unlimited COMPLETED ones.
- Money = whole PKR in `Int` columns named `*_pkr`. Never floats.
- Payment receiving accounts live in `payment_accounts` (admin-editable), never hard-coded.

## Brand
Navy `#0B2A4A` (primary) · Navy 2 `#1B3A63` · Gold `#B48B48` (accent) ·
Ivory `#F5F0E4` (background) · Text `#14213A`.
Fonts: **Amiri** (headings/display) + **Work Sans** (body), via Google Fonts.
Logo: open book + pen in a gold sunburst circle badge.

## Backend layout (`backend/src/`)
- `app.ts` builds the Express app; `server.ts` starts it. Tests import `createApp()`.
- `config/env.ts` validates env vars with zod — read settings from `env`, never `process.env`.
- `lib/prisma.ts` — the single shared Prisma client.
- `routes/index.ts` mounts one router per feature under `/api/v1`.
- Features live in `modules/<feature>/`: `*.routes.ts` (HTTP: validate → call service → respond),
  `*.service.ts` (business logic, no HTTP), `*.schemas.ts` (zod request bodies).
- Auth: `requireAuth` then `requireRole("ADMIN")` from `middleware/requireAuth.ts`; handlers read
  `req.auth.userId` / `req.auth.role`. Access JWT 15 min + rotating refresh token (hashed in
  `refresh_tokens`). Public signup only creates STUDENTs. Never return `passwordHash` — use `toPublicUser`.
- Create accounts of any role with `createUserWithProfile` (`modules/users/users.service.ts`);
  pass a transaction client as the 2nd argument when inside `prisma.$transaction`.
- Endpoints so far: `/health`, `/auth/*`, `/courses` (public, published only), `/enrollments`
  (students: apply, `/mine`, `/:id/cancel`, `/:id/payments`), `/payment-accounts`, `/payments/:id/proof`,
  `/admin/courses`, `/admin/payment-accounts`, `/admin/payments`. Staff-only endpoints go under `/admin/...`.
- Identity helpers: `getStudentId` / `getAdminId` (`modules/users/users.service.ts`) turn `req.auth.userId`
  into the role profile's id.
- Uploads: `imageUpload("field")` + `requireImage(req.file)` (`middleware/imageUpload.ts`) — memory only,
  5 MB, type checked from the file's bytes. Save with `saveFile` / read with `locateFile` (`lib/storage.ts`,
  folder `UPLOAD_DIR`). Never serve uploads statically: stream them from a route that checks who is asking.
  `payments.proof_image_url` holds a storage key (e.g. `payments/<uuid>.png`), not a public URL.
- IDs in URLs: `parseId(req.params.id, "Course")` (`utils/parseId.ts`) → 404 for non-UUIDs.
- Public responses are built field by field (`toPublicCourse` etc.): never expose Zoom passcodes,
  WhatsApp group links or other students' data to people who shouldn't see them.
- Courses are never deleted, only unpublished (`isPublished: false`) — history must survive.
- One-off command-line tools live in `src/scripts/` (seed, create-admin) and export their core
  function so tests can call it.
- Errors: `throw new AppError(status, "CODE", "message")`; `middleware/errorHandler.ts`
  turns every error into `{ error: { code, message, details? } }`. Success = `{ data }`.
- Local imports use the `.ts` extension (ESM + `rewriteRelativeImportExtensions`).

## Commands (run inside `backend/`)
- `npm run dev` — start the API with auto-restart on http://localhost:4000/api/v1
- `npm test` — run tests (vitest + supertest). Needs Postgres running: DB tests use `siraat_test`
  (auto-migrated, wiped between tests; `tests/helpers/db.ts` has `resetDatabase` / `createUser`).
- `npm run typecheck` — TypeScript check, includes tests
- `npm run build` / `npm start` — compile to `dist/` and run the compiled server
- `npm run db:migrate` — create/apply a migration after editing the schema, **then**
- `npm run db:generate` — regenerate the Prisma client (Prisma 7 no longer does this on migrate)
- `npm run db:studio` — browse the database in a GUI
- `npm run db:seed` — fill an EMPTY dev database with [SAMPLE] data (all passwords `password123`;
  logins printed). `npm run db:reset` wipes the dev DB, re-migrates and re-seeds. Never in production.
- `npm run create-admin -- --email x@y.com --name "Full Name"` — real admin account (production-safe).
  Password from `ADMIN_PASSWORD` env var, else generated and printed once. Never pass passwords as flags.
- Local DB URL lives in `backend/.env` (copy from `.env.example`; never commit `.env`).

## Conventions
- Never commit secrets. New env vars go in `.env.example` with a placeholder.
- Schema changes always go through a Prisma migration — never edit the DB by hand.
- Every new endpoint gets tests in `backend/tests/`; run `npm test` and `npm run typecheck` before committing.
- CI (`.github/workflows/backend-ci.yml`) runs on every PR: install → prisma generate →
  typecheck → tests → build → migrate a fresh DB → fail if schema.prisma has no matching migration.
  A PR is only ready to merge when CI is green.
- Record significant decisions in `docs/decisions.md`.
