# Build roadmap

Everything ships in one release, but we *build* it in layers. Each step sits on
top of the one before, so it can be tested before moving on.

- [x] **1. Foundation** — repo layout, `CLAUDE.md`, decisions log, `.gitignore`
- [x] **2. Database schema** — Prisma schema for every feature + first migration
- [x] **3. API skeleton** — Express app, folder structure, error handling, health check
- [x] **4. Auth** — signup/login, bcrypt password hashing, JWT, role-based guards
- [x] **5. Seed data** — sample admin, teachers, courses, students for development
- [x] **6. Courses & enrollment API** — catalog, enroll, one-active-enrollment rule
- [x] **7. Payments API** — proof upload (file storage), admin-editable accounts, verification
- [x] **8. Admin workflow** — approve/reject, assign class group
- [x] **9. Class sessions & attendance API**
- [x] **10. Feedback API** — text + voice notes (audio upload)
- [ ] **11. Recorded lectures & certificates API** (PDF generation)
- [ ] **12. Web app** — React + brand theme, all 9 prototype screens wired to the API
- [ ] **13. Mobile app** — Expo, same screens, shared API client
- [ ] **14. Live classes** — Zoom SDK + WhatsApp fallback links
- [ ] **15. Testing, security review, deployment**
