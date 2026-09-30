# CLAUDE.md — Siraat tul Jannah

Claude Code reads this file at the start of every session. It is the project's
standing brief: keep it short, true, and up to date.

## What this is
Online Quran academy LMS for **Siraat tul Jannah** (founder: Hafiza Aqsa Jamil).
Replaces WhatsApp-based class coordination. One codebase family:
- `backend/` — Node.js + Express REST API, PostgreSQL via Prisma 7
- `web/` — React.js desktop website (not scaffolded yet)
- `mobile/` — React Native (Expo) app (not scaffolded yet)
- `docs/` — decisions log and build roadmap

Clickable prototype (source of truth for screens/UX):
https://claude.ai/artifact/7m7B8AWvEGj338MsGGGddY

## The owner is learning
The project owner is a coding beginner. When working here:
- Explain what you're doing and why, briefly, in plain language.
- Mention a realistic alternative when a choice matters.
- Prefer boring, well-documented tools over clever ones.

## Data model rules (see `backend/prisma/schema.prisma`)
- Base `users` table + one of `students` / `teachers` / `admins` (each has `user_id`).
- All primary keys are UUIDs. Tables snake_case plural, Prisma models PascalCase singular.
- `enrollments` has its own `id`. One student → many enrollments.
- **Only one PENDING/APPROVED enrollment per (student, course).** Enforced in the
  service layer AND by the partial unique index
  `enrollments_one_active_per_student_course` (hand-written in the init migration).
  Unlimited COMPLETED ones.
- Money = whole PKR in `Int` columns named `*_pkr`. Never floats.
- Payment receiving accounts live in `payment_accounts` (admin-editable), never hard-coded.

## Brand
Navy `#0B2A4A` (primary) · Navy 2 `#1B3A63` · Gold `#B48B48` (accent) ·
Ivory `#F5F0E4` (background) · Text `#14213A`.
Fonts: **Amiri** (headings/display) + **Work Sans** (body), via Google Fonts.
Logo: open book + pen in a gold sunburst circle badge.

## Commands (run inside `backend/`)
- `npm run db:migrate` — create/apply a migration after editing the schema
- `npm run db:generate` — regenerate the Prisma client
- `npm run db:studio` — browse the database in a GUI
- Local DB URL lives in `backend/.env` (copy from `.env.example`; never commit `.env`).

## Conventions
- Never commit secrets. New env vars go in `.env.example` with a placeholder.
- Schema changes always go through a Prisma migration — never edit the DB by hand.
- Record significant decisions in `docs/decisions.md`.
