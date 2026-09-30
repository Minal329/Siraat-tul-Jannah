# Decisions log

A short record of *why* things are the way they are. Add a new entry whenever a
choice would puzzle someone six months from now.

## 001 — Tech stack
React Native (Expo) for mobile, React.js for web, Node.js + Express API,
PostgreSQL, JWT + bcrypt auth, Zoom SDK for live classes with WhatsApp
(click-to-call, join group, group call) as the low-bandwidth fallback.

## 002 — Prisma (not Sequelize) as the ORM
**Why:** one readable `schema.prisma` file is the single source of truth, migrations
are generated automatically, and query results are type-checked.
**Alternative:** Sequelize is older and very common in tutorials, but models and
migrations are written separately and drift apart easily.
**Version:** pinned to Prisma 7.10.0 (stable). npm's `latest` tag pointed at an
8.0 release candidate on 2026-09-30, which we avoid for production.

## 003 — Inherited user tables
`users` holds login data; `students`, `teachers`, `admins` hold role-specific data
and link back with a unique `user_id`. Keeps logins in one place while letting each
role have its own columns.
**Trade-off:** `full_name` / `whatsapp_number` appear in each role table. The
alternative is moving them up into `users`; revisit if that duplication hurts.

## 004 — Enrollments are one-to-many with their own id
Supports several courses at once and re-enrolling in a new batch after completion.
"One active (PENDING/APPROVED) enrollment per course" is enforced twice:
in application code (friendly error message) and by a Postgres partial unique
index (guarantee even if code has a bug or two requests race).

## 005 — Batches are modelled as class groups
Instead of a separate `batches` table, a `class_groups` row is one teacher + one
batch of a course (`batch_label`, `start_date`, `end_date`, Zoom and WhatsApp
links). A new batch means creating new class groups. Simpler for now; a dedicated
`batches` table can be added later if batches need their own data.

## 006 — Money as whole rupees in Int
Floats lose precision (0.1 + 0.2 ≠ 0.3). Fees are whole PKR, so `Int` is exact.

## 007 — One folder per app, no npm workspaces (yet)
`backend/`, `web/`, `mobile/` each have their own `package.json`. Simpler to
understand, and Expo can be picky with workspaces. We can add workspaces later
if we start sharing code (e.g. a `shared/` types package).

## 008 — TypeScript for the backend
Prisma 7 generates its database client as TypeScript, and TypeScript catches
mistakes (a typo'd field name, a missing argument) before the code runs.
`tsx` runs it directly in development; `tsc` compiles to plain JavaScript in
`dist/` for production.
**Alternative:** plain JavaScript — less to learn up front, but we'd need Prisma's
older client generator and lose type checking on every database query.

## 009 — Express 5 with a standard response shape
Express 5 (stable) passes errors from `async` route handlers to the error handler
automatically; Express 4 needed a wrapper around every route. Every response is
either `{ data: … }` or `{ error: { code, message, details? } }`, so the web and
mobile apps handle all responses the same way. `code` is a stable string like
`ENROLLMENT_EXISTS` that the apps can check, and `message` is for humans.
**Alternative:** Fastify is faster and has validation built in, but Express has far
more tutorials and answers online, which matters more for us right now.

## 010 — API is versioned under /api/v1
Phones keep running old app versions for months. When a breaking change is
needed, it goes under `/api/v2` while `/api/v1` keeps serving older apps.

## 011 — GitHub Actions for CI
Every pull request (and every push to `main`) automatically installs the backend,
type-checks, runs the tests, builds, applies all migrations to a brand-new Postgres
database, and fails if `schema.prisma` was edited without a matching migration.
The result shows as ✅ or ❌ on the PR, so nothing depends on remembering to run checks.
**Alternative:** other hosted CI services (CircleCI, GitLab CI) work similarly, but
GitHub Actions is built into GitHub and free for this size of project.

## 012 — Login: short access token + rotating refresh token
Login returns a JWT **access token** (15 minutes) and a random **refresh token**
(30 days). Apps send the access token with every request; when it expires they
swap the refresh token for a fresh pair. Refresh tokens are stored only as SHA-256
hashes, change on every use ("rotation"), and replaying an old one logs that user
out everywhere (sign of theft). `requireAuth` also re-reads the user on every
request, so disabling an account or changing a role takes effect immediately.
**Alternative:** one long-lived JWT (e.g. 7 days) — simpler, but it can't be revoked:
logout and "disable this account" wouldn't work until it expired.
Tokens are returned in the JSON body (what the mobile app needs). For the web app
we'll decide in step 12 whether to move the refresh token into an httpOnly cookie.

## 013 — Password and brute-force rules
bcrypt with cost 12 (≈250 ms per hash). Passwords must be 8+ characters and at most
72 bytes, because bcrypt ignores anything past 72 bytes. Login failures are limited
to 10 per 15 minutes per IP *and* email: many Pakistani mobile users share a public IP
(carrier NAT), so a pure per-IP limit could lock out a whole neighbourhood.
Wrong password and unknown email return the identical error, so the login form
can't be used to find out who is registered.

## 014 — Tests use a real, separate database
Auth logic lives mostly in the database (unique emails, token rows), so its tests run
against a real Postgres database named `siraat_test`, migrated automatically and wiped
between tests. The helpers refuse to touch any database whose name doesn't end in `_test`.
Pure HTTP behaviour (e.g. the health check's 503 path) still uses a mocked database.
**Alternative:** mock the database everywhere — faster, but it would only test our
guesses about how Postgres behaves, not Postgres itself.

## 015 — Sample data and the first admin are separate tools
`npm run db:seed` fills an empty development database with sample people, courses,
enrollments and classes. It refuses to run in production, skips if any users
exist, and runs in one transaction so it never half-finishes. Placeholders are
marked `[SAMPLE]` and must be replaced with real details before launch.
`npm run create-admin` is the production-safe way to create real admins (starting
with the founder's account). The password comes from `ADMIN_PASSWORD` or is
generated, never from a command-line flag, because typed commands end up in shell history.
**Alternative:** one seed script that also creates the real admin — simpler, but
it mixes throwaway test accounts with a real one and makes it easy to ship a
known password to production.

## 016 — Courses: public catalog, admin area, never deleted
Anyone can browse **published** courses at `/courses` without logging in (the catalog is
the academy's shop window). Admins manage all courses at `/admin/courses`; every
staff-only feature will live under `/admin/...` so it's obvious which endpoints need
the strictest checks. Courses are **unpublished, never deleted**: deleting one would
erase students' enrollment and certificate history. Slugs (`/courses/tajweed-ul-quran`)
are made from the title automatically; titles with no Latin letters (e.g. Urdu script)
must be given a slug by hand.
**Alternative:** one `/courses` endpoint that shows extra data when an admin is logged
in — fewer URLs, but easier to leak draft courses or internal fields by mistake.

## 017 — Enrolling: two layers for the one-active-enrollment rule
`POST /enrollments` first checks for an existing PENDING/APPROVED enrollment and returns
a friendly `409 ENROLLMENT_EXISTS`. Two taps arriving at the same instant can both pass
that check, so the database's partial unique index stops the second one and we turn its
error into the same friendly message. A test fires 5 simultaneous requests and proves
exactly one succeeds; removing the second layer makes that test fail.
Students can cancel their own **pending** application (then re-apply); approved ones
need the academy. Someone else's enrollment answers `404`, never `403`, so IDs can't be probed.

## 018 — Payment screenshots: private, on disk for now, checked by content
Students upload a screenshot of their Easypaisa/JazzCash transfer; an admin verifies or
rejects it (with a reason the student sees). Verifying a payment does **not** approve the
enrollment — that's a separate admin decision (step 8).
- **Storage:** a folder on the server (`UPLOAD_DIR`) behind `lib/storage.ts`, the only file
  that knows where files live. **Alternative:** cloud storage (S3, Cloudflare R2, Cloudinary)
  from day one — sturdier and survives server moves, but needs an account and keys. Switching
  later means rewriting that one file; the folder must be backed up until then.
- **Privacy:** screenshots hold financial details, so they are never public. Files get random
  names, and `GET /payments/:id/proof` streams one only to the student who paid or an admin
  (everyone else gets 404), with `Cache-Control: private, no-store`.
- **Safety:** files are held in memory until ownership is checked, capped at 5 MB, and must
  really be JPEG/PNG/WebP — judged by their first bytes, not the name or browser-sent type.
  Storage keys are pattern-checked so a crafted path can't reach outside the uploads folder.
- **One payment waiting at a time** per enrollment keeps the admin queue clean; reviews use a
  conditional update so two admins clicking at once can't both review the same payment.

## 019 — Admin workflow: approval needs a verified payment, unless deliberate
Admins approve a PENDING enrollment **into a class group** in one step (a student never
sits "approved but groupless"). Approving without a verified payment returns
`409 PAYMENT_NOT_VERIFIED` unless the request says `approveWithoutPayment: true` — so
scholarships and cash payments are possible, but never by accident. Rejections need a
reason the student sees. Approved students can be moved to another group of the same
course; "complete" closes the enrollment, allowing a new batch later and (step 11) a certificate.
Group capacity is checked while holding a row lock on the group, because a plain
"count, then insert" lets two simultaneous approvals both take the last seat (a test
showed this happening in 3 of 5 runs without the lock).
**Alternative:** approve first, assign a group later — more flexible, but it creates
approved students with no class, WhatsApp group or teacher.

## 020 — Staff accounts and passwords
Admins create teachers from the dashboard; the teacher gets a strong temporary password,
shown once (response marked `Cache-Control: no-store`), and changes it with
`POST /auth/change-password`. Changing a password logs out every other device. Admins can
disable any account except their own (disabling logs it out everywhere).
A wrong current password returns **400**, not 401, because the apps treat 401 as
"session expired, log in again".
While testing this we found a flaw in decision 012: a second device refreshing with a
token revoked by a password change looked like theft and logged the user out everywhere.
Tokens now record `rotatedAt`, and only replaying a *rotated* token counts as theft.
