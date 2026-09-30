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
