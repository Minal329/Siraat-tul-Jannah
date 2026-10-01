# Mobile app (Expo)

Android and iPhone app for **students, teachers and admins** of Siraat tul Jannah — there is no website.

| Screen | File |
|---|---|
| Login / Sign up | `src/app/login.tsx` |
| Course catalog | `src/app/courses.tsx` |
| Student dashboard | `src/app/student/index.tsx` |
| Enroll & payment (screenshot from gallery) | `src/app/student/pay/[id].tsx` |
| Live class (Zoom / WhatsApp) | `src/app/student/live/[id].tsx` |
| Recorded lectures | `src/app/student/lectures.tsx` |
| Feedback (text + voice notes) | `src/app/student/feedback.tsx` |
| Certificate — drawn in the app, **Save Image** (PNG to photos) / **Share** | `src/app/student/certificate/[number].tsx` |
| Teacher dashboard (schedule, attendance, feedback, voice recording) | `src/app/teacher/index.tsx` |
| Admin dashboard (applications, payment screenshots, approve & assign, reject, payment numbers) | `src/app/admin/index.tsx` |
| Account (change password, log out) | `src/app/account.tsx` |

## Run it
Start the API first (`cd backend && npm run dev`), then:

```bash
cd mobile
npm install
npm start          # shows a QR code — scan it with the Expo Go app on your phone
```

The app talks to `http://localhost:4000/api/v1` by default. A phone can't reach your computer's
`localhost`, so create `mobile/.env.local` with your computer's local network address:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api/v1
```

(Android emulator: use `http://10.0.2.2:4000/api/v1`.) To try it in a browser instead, press `w`
after `npm start` (`CORS_ORIGINS` in `backend/.env` must include `http://localhost:8081`, the default).
"Save Image" downloads the PNG in the browser; on a phone it goes to the photo gallery.

## Checks
```bash
npm run typecheck
npm test
```

Add packages with `npx expo install <package>` so the version matches the Expo SDK.
