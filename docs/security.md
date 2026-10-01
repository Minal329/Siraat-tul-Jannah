# Security review (roadmap step 15)

What was checked before launch, what was fixed, and what to keep an eye on.
Re-read this list whenever a feature touches logins, files, money or children's data.

## Logins and accounts
| Check | Status |
|---|---|
| Passwords hashed with bcrypt (12 rounds; at least 10 enforced in production) | ✅ |
| Passwords over 72 bytes rejected (bcrypt would silently cut them) | ✅ |
| Wrong email and wrong password give the same message and take the same time | ✅ |
| Login limited to 10 failed tries per 15 min per address *and* email (carrier NAT-friendly) | ✅ |
| Access tokens: 15 min, HS256 pinned, issuer checked | ✅ |
| Refresh tokens: random 256-bit, stored hashed, rotated on every use; replaying an old one logs out everywhere | ✅ |
| Disabled account / changed role takes effect on the next request | ✅ |
| **Website refresh token moved to an httpOnly, SameSite=Strict cookie** (was localStorage) | ✅ fixed in step 15 |
| Cookie only read when the request has the `X-Auth-Transport: cookie` header (blocks cross-site requests) | ✅ fixed in step 15 |
| **Forgotten password: admin issues a temporary password**; old sessions logged out | ✅ added in step 15 |
| **Change-password screen** on the website and app (teachers' temporary passwords can be replaced) | ✅ added in step 15 |
| Public signup can only create students | ✅ |

## Data access
| Check | Status |
|---|---|
| Every staff endpoint behind `requireRole`; teachers only see their own groups (404 otherwise) | ✅ |
| Students only see their own enrollments, payments, feedback, certificates | ✅ (tests) |
| Zoom passcodes / WhatsApp links only for students *approved into that group* | ✅ |
| Public responses built field by field (no accidental columns) | ✅ |
| IDs in URLs validated as UUIDs | ✅ |
| All SQL through Prisma (parameterised); the few raw queries use tagged templates | ✅ |

## Files
| Check | Status |
|---|---|
| Uploads kept in memory, size-limited (5 MB images, 10 MB audio), type checked from the file's bytes | ✅ |
| Stored under random names, never served as public files — streamed after an ownership check | ✅ |
| Storage keys checked against a strict pattern (no `../` tricks) | ✅ |

## Server and network
| Check | Status |
|---|---|
| Security headers (helmet: HSTS, nosniff, frame-ancestors…); `X-Powered-By` removed | ✅ |
| Website security headers incl. a Content-Security-Policy — set by Caddy (`deploy/Caddyfile`) | ✅ added in step 15 |
| JSON bodies limited to 1 MB | ✅ |
| Errors never send stack traces or SQL to users | ✅ |
| **`TRUST_PROXY`** so rate limits see real visitors behind Caddy | ✅ fixed in step 15 |
| **Production refuses to start** with http:// addresses or weak bcrypt settings | ✅ added in step 15 |
| Sample data script refuses to run in production | ✅ |
| HTTPS everywhere — Caddy gets and renews certificates automatically | ✅ (deployment) |
| Secrets only in environment variables, never in git | ✅ |

## Known, accepted for now
- **`npm audit` (backend): 4 "high" advisories, all inside the Prisma *command-line tool*** — a MySQL
  driver it bundles (we use PostgreSQL; never loaded) and a config helper that only reads our own files.
  The only offered fix downgrades Prisma a major version. Re-check when Prisma releases an update.
- **`npm audit` (mobile): moderate advisories in Expo's development tools** — not shipped in the app.
- **Students see each teacher's name, not their contact details** — intended.
- **No two-factor login for admins yet.** Worth adding if more staff get admin accounts.
- **No email** (password reset by email, notifications): the academy uses WhatsApp; an admin resets passwords.

## Before going live — owner's checklist
1. Generate a new `JWT_SECRET` for the server (instructions in `backend/.env.example`). Never reuse the dev one.
2. Use a strong, unique password for the first admin (`npm run create-admin`), and for the database.
3. Turn on automatic database backups and copy the `uploads` folder too (see `docs/deployment.md`).
4. Only give admin accounts to people who need them; disable accounts of staff who leave.
5. Keep the server updated (`docker compose pull && docker compose up -d` monthly) and run `npm audit`.
