# Web app (React)

The Siraat tul Jannah website for students, teachers and admins — the nine screens
from the prototype, wired to the backend API.

```bash
cd web
npm install
npm run dev        # http://localhost:5173 (the backend must be running on :4000)
npm test           # unit tests (Vitest + Testing Library)
npm run lint       # oxlint
npm run build      # production build in dist/
```

Set `VITE_API_URL` if the API isn't at `http://localhost:4000/api/v1`.
Sample logins come from the backend seed (`npm run db:seed` in `backend/`, password `password123`).

| Address | Screen | Who |
|---|---|---|
| `/login`, `/signup` | Login / Sign Up | everyone (sign-up creates students) |
| `/courses` | Course Catalog | everyone |
| `/student` | Student Dashboard | students |
| `/student/pay/:enrollmentId` | Enroll & Payment | students |
| `/student/live/:enrollmentId` | Live Class (Zoom / WhatsApp) | students |
| `/student/lectures` | Recorded Lectures | students |
| `/student/feedback` | Feedback (text + voice notes) | students |
| `/student/certificates/:number` | Certificate | students |
| `/verify/:number` | Verify a certificate | everyone |
| `/teacher`, `/teacher/lectures` | Teacher Dashboard, share lectures | teachers, admins |
| `/admin` | Admin Dashboard | admins |
