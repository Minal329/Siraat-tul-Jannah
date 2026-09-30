# Siraat tul Jannah

Islamic online learning platform (mobile app + website) for **Siraat tul Jannah
Quran Academy** — course enrollment, payments, live classes, attendance, feedback,
recorded lectures and certificates in one place.

| Folder     | What it is                                   | Status            |
|------------|----------------------------------------------|-------------------|
| `backend/` | Node.js + Express API, PostgreSQL via Prisma | API: auth, courses, enrollment, payments |
| `web/`     | React.js website                             | Not started       |
| `mobile/`  | React Native (Expo) app                      | Not started       |
| `docs/`    | Decisions log and build roadmap              | —                 |

## Running the backend locally
Requires Node.js 20.19+ and PostgreSQL 14+.

```bash
cd backend
cp .env.example .env        # then set DATABASE_URL and JWT_SECRET (instructions inside)
npm install
npm run db:migrate          # creates all tables
npm run db:generate         # generates the database client code
npm run db:seed             # adds sample data; logins are printed (password: password123)
npm run dev                 # start the API
# then open http://localhost:4000/api/v1/health
npm test                    # run the automated tests (uses a separate siraat_test database)
```

To create a real admin account (safe on the live server):

```bash
ADMIN_PASSWORD='choose-a-strong-password' npm run create-admin -- --email you@example.com --name "Your Name"
# leave out ADMIN_PASSWORD and a strong password is generated and shown once
```

See `docs/roadmap.md` for what's next and `docs/decisions.md` for why things are built this way.
