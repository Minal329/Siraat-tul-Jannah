# CLAUDE.md — Siraat tul Jannah

Claude Code reads this file at the start of every session. It is the project's
standing brief: keep it short, true, and up to date.

## What this is
Online Quran academy LMS for **Siraat tul Jannah** (founder: Hafiza Aqsa Jamil).
Replaces WhatsApp-based class coordination. **Mobile app only** — students, teachers and admins all
use the app; there is no website (decision 030). One codebase family:
- `backend/` — Node.js + Express 5 REST API in TypeScript, PostgreSQL via Prisma 7
- `mobile/` — Expo (React Native) app for students, teachers and admins (see `mobile/README.md`)
- `deploy/` — production: `docker-compose.yml` (db + migrate + api + Caddy in front of the API), `Caddyfile`, `backup.sh`
- `docs/` — decisions log, roadmap, `security.md` checklist, `deployment.md` guide

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
Fonts: **Amiri** (headings/display) + **Work Sans** (body), bundled via Fontsource (not the Google Fonts CDN).
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
  `/admin/courses`, `/admin/class-groups`, `/admin/enrollments` (approve/reject/move/complete),
  `/admin/payment-accounts`, `/admin/payments`, `/admin/teachers`, `/admin/users/:id/status`,
  `/auth/change-password`, `/teacher/*` (class groups, sessions, attendance — teachers see only
  their own groups, admins see all), `/enrollments/schedule`, `/enrollments/:id/attendance`,
  `/teacher/feedback` (send text/voice, list sent), `/feedback/mine`, `/feedback/:id/read`,
  `/feedback/:id/voice` (student, its teacher, or admin), `/lectures` (students), `/teacher/lectures`,
  `/admin/certificates` (issue),
  `/teacher/sessions/:id/start|live|end`, `/enrollments/:id/live` + `/live/join`,
  `/admin/class-groups/zoom-status`, `/admin/class-groups/:id/zoom-meeting`,
  `/admin/users/:id/reset-password` (students/teachers; temporary password shown once).
- Live classes: SCHEDULED → (start) LIVE → (end) COMPLETED, only via those endpoints (PATCH may only
  reschedule/cancel). Only one LIVE class per group — hand-written partial unique index
  `class_sessions_one_live_per_group`. While live the teacher can switch `livePlatform` ZOOM ⇄ WHATSAPP.
  Students' "Join" is stored in `session_joins` (first join only) — a hint for attendance, not attendance.
  A LIVE class older than 6 h is treated as over (`isLiveNow`). Zoom API is optional (`lib/zoom.ts`,
  `ZOOM_*` env vars); `zoomJoinLink(group)` is the link students get.
- Lecture videos are links to a video service (YouTube unlisted / Vimeo / Bunny) — never uploaded to
  our server. `toEmbedUrl` turns YouTube/Vimeo links into in-app player URLs.
- Certificates: numbers `STJ-<year>-<00001>-<4 random chars>`; the running number is assigned under a
  Postgres advisory lock. No PDF and no public verify page: the app draws the certificate
  (`mobile/src/components/CertificateCard.tsx`) and saves/shares it as a PNG (`lib/saveImage.ts`).
  Staff-only endpoints go under `/admin/...`, the teacher's area under `/teacher/...`.
- Teacher ownership: `loadGroupFor(auth, groupId)` in `sessions.service.ts` — another teacher's group
  answers 404. Reuse it for anything a teacher does to "their" class.
- Enrollment lifecycle: PENDING → APPROVED (into a class group) → COMPLETED; PENDING → REJECTED;
  student may cancel PENDING. Approving needs a VERIFIED payment unless `approveWithoutPayment: true`.
- Capacity checks lock the class group row (`SELECT … FOR UPDATE` inside `$transaction`) so
  simultaneous approvals can't overfill a group. Use the same pattern for any "last seat" check.
- Logins: the refresh token travels in the response body; the app keeps it in secure storage.
  `TRUST_PROXY` = number of proxies in front (Caddy = 1). `CORS_ORIGINS` only matters for the app's web
  preview (`http://localhost:8081` locally, empty in production; production refuses http:// origins).
  Security checklist: `docs/security.md` — re-read it for anything touching logins, files or money.
- Refresh tokens: `rotatedAt` is set only when swapped for a new one; only replaying a rotated
  token triggers "log out everywhere". Logout / password change / disabling just set `revokedAt`.
- Identity helpers: `getStudentId` / `getTeacherId` / `getAdminId` (`modules/users/users.service.ts`) turn `req.auth.userId`
  into the role profile's id.
- Uploads (`middleware/upload.ts`): `imageUpload("field")` + `requireImage(req.file)` (5 MB) or
  `audioUpload("field")` + `requireAudio(file)` (10 MB) — memory only, type checked from the file's bytes. Save with `saveFile` / read with `locateFile` (`lib/storage.ts`,
  folder `UPLOAD_DIR`). Never serve uploads statically: stream them from a route that checks who is asking.
  `payments.proof_image_url` and `feedback.voice_url` hold storage keys (e.g. `payments/<uuid>.png`),
  not public URLs. Stream files with `res.sendFile` (supports Range, needed by phone audio players).
- IDs in URLs: `parseId(req.params.id, "Course")` (`utils/parseId.ts`) → 404 for non-UUIDs.
- Public responses are built field by field (`toPublicCourse` etc.): never expose Zoom passcodes,
  WhatsApp group links or other students' data to people who shouldn't see them.
- Courses are never deleted, only unpublished (`isPublished: false`) — history must survive.
- One-off command-line tools live in `src/scripts/` (seed, create-admin) and export their core
  function so tests can call it.
- Errors: `throw new AppError(status, "CODE", "message")`; `middleware/errorHandler.ts`
  turns every error into `{ error: { code, message, details? } }`. Success = `{ data }`.
- Local imports use the `.ts` extension (ESM + `rewriteRelativeImportExtensions`).

## Mobile layout (`mobile/src/`)
- Expo SDK 57 + expo-router: every file in `app/` is a screen (`app/student/pay/[id].tsx` → `/student/pay/<id>`).
- `lib/api.ts`: every API call goes through `api()` — adds the token, renews an expired login once
  (single-flight), turns errors into `ApiError`; `friendlyMessage(err)` shows a field's own validation
  message. Refresh token in the phone's secure storage (expo-secure-store; localStorage only in the web preview).
- `lib/useAuth.ts` (`useAuth`, `homeFor`: STUDENT → `/student`, TEACHER → `/teacher`, ADMIN → `/admin`);
  `lib/hooks.ts` (`useLoad` reloads on focus, `useAction`, `useInterval`); `lib/types.ts` mirrors API responses.
- `components/ui.tsx` shared pieces (`Screen`, `Card`, `Button`, `Chip`, `Field`, `Loaded`…), `Icon.tsx` (prototype
  line icons via react-native-svg), `PrivateImage.tsx` (payment screenshots — sends the login token).
- Screens follow the prototype artboards (design canvas linked above); brand fonts via `@expo-google-fonts`.
- Admin area: `app/admin/` (dashboard + courses, groups, teachers, students, certificate); forms open in a
  `Sheet` (`components/Sheet.tsx`); temporary passwords via `components/TemporaryPassword.tsx` (shown once,
  shared through the phone's share sheet). Confirmations: `Alert.alert` on phones, `window.confirm` in the web preview.
- Screen tests use the fake backend in `src/test-helpers/fakeApi.ts` (set `responses`, check `writes()`).
- The web preview (`npx expo export --platform web`) is only for testing in a browser; the product is the phone app.
- Install packages with `EXPO_OFFLINE=1 npx expo install <pkg>` (picks SDK-matching versions).
- Commands (inside `mobile/`): `npm start`, `npm test` (jest-expo), `npm run typecheck`.

## Deployment (`deploy/`, guide in `docs/deployment.md`)
- Caddy gets HTTPS and proxies `/api/*` to the API (`backend/Dockerfile`, target `runtime`; target `build`
  runs `prisma migrate deploy`). Anything else answers "please use the mobile app".
- New API env vars must also be added to the `api` service in `deploy/docker-compose.yml` (and
  `deploy/.env.example` if the owner sets them).
- Admin on the server: `docker compose exec api node dist/src/scripts/create-admin.js --email … --name "…"`.
- Building images in the Claude sandbox needs `--network host` and the sandbox CA — never add that to the Dockerfiles.

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
  Prisma refuses `migrate reset` when run by an AI assistant — the owner runs it; don't bypass that.
- `npm run create-admin -- --email x@y.com --name "Full Name"` — real admin account (production-safe).
  Password from `ADMIN_PASSWORD` env var, else generated and printed once. Never pass passwords as flags.
- Local DB URL lives in `backend/.env` (copy from `.env.example`; never commit `.env`).

## Conventions
- Never commit secrets. New env vars go in `.env.example` with a placeholder.
- Schema changes always go through a Prisma migration — never edit the DB by hand.
- Every new endpoint gets tests in `backend/tests/`; run `npm test` and `npm run typecheck` before committing.
- Mobile CI: typecheck → tests → web export. Deploy check: validates `deploy/docker-compose.yml` and
  builds the API Docker image.
- `backend/tests/journey.test.ts` walks the whole academy flow through the API — keep it passing when
  changing any step of it.
- CI (`.github/workflows/backend-ci.yml`) runs on every PR: install → prisma generate →
  typecheck → tests → build → migrate a fresh DB → fail if schema.prisma has no matching migration.
  A PR is only ready to merge when CI is green.
- Record significant decisions in `docs/decisions.md`.
