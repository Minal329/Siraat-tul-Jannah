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
