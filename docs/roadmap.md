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
- [x] **11. Recorded lectures & certificates API**
- [x] ~~**12. Web app**~~ — built, then removed: the academy is mobile-only (decision 030)
- [x] **13. Mobile app** — Expo, same screens, shared API client
- [x] **14. Live classes** — Zoom SDK + WhatsApp fallback links
- [x] **15. Testing, security review, deployment**

## Mobile-only (decision 030)
- [x] **16. Remove the website** — and the PDF / public verify page; certificates are PNG images made in the app
- [x] **17. Admin dashboard in the app** — applications, payment screenshots, approve & assign, reject, payment numbers
- [ ] **18. Admin: courses** — add, edit, publish/unpublish
- [ ] **19. Admin: class groups & teachers** — batches, teachers, Zoom/WhatsApp links, password resets
- [ ] **20. Admin: complete courses & issue certificates**
