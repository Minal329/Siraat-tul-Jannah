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
- Local DB URL lives in `backend/.env` (copy from `.env.example`; never commit `.env`).

## Conventions
- Never commit secrets. New env vars go in `.env.example` with a placeholder.
- Schema changes always go through a Prisma migration — never edit the DB by hand.
- Every new endpoint gets tests in `backend/tests/`; run `npm test` and `npm run typecheck` before committing.
- CI (`.github/workflows/backend-ci.yml`) runs on every PR: install → prisma generate →
  typecheck → tests → build → migrate a fresh DB → fail if schema.prisma has no matching migration.
  A PR is only ready to merge when CI is green.
- Record significant decisions in `docs/decisions.md`.
