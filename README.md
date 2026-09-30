# Siraat tul Jannah

Islamic online learning platform (mobile app + website) for **Siraat tul Jannah
Quran Academy** — course enrollment, payments, live classes, attendance, feedback,
recorded lectures and certificates in one place.

| Folder     | What it is                                   | Status            |
|------------|----------------------------------------------|-------------------|
| `backend/` | Node.js + Express API, PostgreSQL via Prisma | Schema + API skeleton |
| `web/`     | React.js website                             | Not started       |
| `mobile/`  | React Native (Expo) app                      | Not started       |
| `docs/`    | Decisions log and build roadmap              | —                 |

## Running the backend locally
Requires Node.js 20.19+ and PostgreSQL 14+.

```bash
cd backend
cp .env.example .env        # then edit DATABASE_URL with your Postgres login
npm install
npm run db:migrate          # creates all tables
npm run dev                 # start the API
# then open http://localhost:4000/api/v1/health
npm test                    # run the automated tests
```

See `docs/roadmap.md` for what's next and `docs/decisions.md` for why things are built this way.
