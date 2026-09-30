// Fills an EMPTY development database with realistic sample data, so every
// screen has something to show while we build it.
//
//   npm run db:seed          (or npm run db:reset to wipe everything and re-seed)
//
// Everything marked [SAMPLE] is a placeholder — course names, fees and account
// numbers must be replaced with the academy's real details before launch.
// Refuses to run in production. For the real first admin, use `npm run create-admin`.
import { pathToFileURL } from "node:url";
import { env } from "../config/env.ts";
import { prisma } from "../lib/prisma.ts";
import { createUserWithProfile } from "../modules/users/users.service.ts";

export const SEED_PASSWORD = "password123";

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number, hour = 20) => {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(hour - 5, 0, 0, 0); // hour is Pakistan time (UTC+5)
  return date;
};

export async function seedDevelopmentData({ nodeEnv = env.NODE_ENV } = {}) {
  if (nodeEnv === "production") {
    throw new Error("Refusing to seed sample data in production. Use `npm run create-admin` instead.");
  }
  if ((await prisma.user.count()) > 0) {
    return { skipped: true as const };
  }

  // One transaction: either all sample data is created, or none of it.
  return prisma.$transaction(
    async (tx) => {
      const user = (role: "STUDENT" | "TEACHER" | "ADMIN", email: string, fullName: string, whatsappNumber?: string) =>
        createUserWithProfile({ role, email, fullName, whatsappNumber, password: SEED_PASSWORD }, tx);

      // ── People ──────────────────────────────────────────────
      const admin = (await user("ADMIN", "admin@siraat.test", "Academy Admin [SAMPLE]")).admin!;
      const maryam = (await user("TEACHER", "maryam@siraat.test", "Ustadha Maryam [SAMPLE]", "+923000000011")).teacher!;
      const fatima = (await user("TEACHER", "fatima@siraat.test", "Ustadha Fatima [SAMPLE]", "+923000000012")).teacher!;
      const ayesha = (await user("STUDENT", "ayesha@siraat.test", "Ayesha Siddiqui [SAMPLE]", "+923000000021")).student!;
      const zainab = (await user("STUDENT", "zainab@siraat.test", "Zainab Ahmed [SAMPLE]", "+923000000022")).student!;
      const hira = (await user("STUDENT", "hira@siraat.test", "Hira Malik [SAMPLE]", "+923000000023")).student!;

      // ── Courses ─────────────────────────────────────────────
      const course = (title: string, slug: string, level: string, durationWeeks: number, feePkr: number, about: string) =>
        tx.course.create({
          data: { title, slug, level, durationWeeks, feePkr, description: `[SAMPLE] ${about}`, isPublished: true },
        });
      const qaida = await course("Noorani Qaida", "noorani-qaida", "Beginner", 12, 2000,
        "Learn the Arabic letters, their sounds and joining rules — the foundation for reading the Quran.");
      await course("Nazra Quran", "nazra-quran", "Beginner", 24, 2500,
        "Read the Holy Quran fluently from the Mushaf with correct pronunciation.");
      const tajweed = await course("Tajweed ul Quran", "tajweed", "Intermediate", 16, 3000,
        "Master the rules of Tajweed: Makharij, Sifaat, Noon Sakinah, Meem Sakinah and Madd.");
      await course("Hifz ul Quran", "hifz", "Advanced", 104, 5000,
        "Memorise the Holy Quran with a daily sabaq, sabqi and manzil routine.");

      // ── Class groups (one teacher + one batch of a course) ──
      const qaidaOld = await tx.classGroup.create({
        data: {
          courseId: qaida.id, teacherId: maryam.id, name: "Noorani Qaida — Batch 0",
          batchLabel: "Batch 0", scheduleText: "Mon/Wed/Fri 8:00–9:00 pm PKT",
          startDate: daysFromNow(-120), endDate: daysFromNow(-36), isActive: false,
        },
      });
      const qaidaNow = await tx.classGroup.create({
        data: {
          courseId: qaida.id, teacherId: maryam.id, name: "Noorani Qaida — Batch 1 — Evening",
          batchLabel: "Batch 1", scheduleText: "Mon/Wed/Fri 8:00–9:00 pm PKT", maxStudents: 10,
          startDate: daysFromNow(-21), endDate: daysFromNow(63),
        },
      });
      const tajweedNow = await tx.classGroup.create({
        data: {
          courseId: tajweed.id, teacherId: fatima.id, name: "Tajweed ul Quran — Batch 1 — Morning",
          batchLabel: "Batch 1", scheduleText: "Tue/Thu/Sat 10:00–11:00 am PKT", maxStudents: 8,
          startDate: daysFromNow(-14), endDate: daysFromNow(98),
        },
      });

      // ── Enrollments, payments, certificates ─────────────────
      // Ayesha: approved and attending Noorani Qaida.
      const ayeshaQaida = await tx.enrollment.create({
        data: {
          studentId: ayesha.id, courseId: qaida.id, classGroupId: qaidaNow.id, status: "APPROVED",
          approvedById: admin.id, approvedAt: daysFromNow(-22),
          payments: {
            create: {
              method: "EASYPAISA", amountPkr: 2000, transactionId: "SAMPLE-TID-0001",
              proofImageUrl: "https://example.com/sample-payment-proof.jpg", status: "VERIFIED",
              reviewedById: admin.id, reviewedAt: daysFromNow(-22),
            },
          },
        },
      });

      // Zainab: applied for Tajweed; her payment proof is waiting for an admin.
      await tx.enrollment.create({
        data: {
          studentId: zainab.id, courseId: tajweed.id, status: "PENDING",
          payments: {
            create: {
              method: "JAZZCASH", amountPkr: 3000, transactionId: "SAMPLE-TID-0002",
              proofImageUrl: "https://example.com/sample-payment-proof.jpg",
            },
          },
        },
      });

      // Hira: completed Noorani Qaida (with certificate), now studying Tajweed.
      const hiraQaida = await tx.enrollment.create({
        data: {
          studentId: hira.id, courseId: qaida.id, classGroupId: qaidaOld.id, status: "COMPLETED",
          approvedById: admin.id, approvedAt: daysFromNow(-121), completedAt: daysFromNow(-36),
        },
      });
      await tx.certificate.create({
        data: { enrollmentId: hiraQaida.id, certificateNumber: "STJ-2026-00001-SAMP", issuedById: admin.id, issuedAt: daysFromNow(-35) },
      });
      await tx.enrollment.create({
        data: {
          studentId: hira.id, courseId: tajweed.id, classGroupId: tajweedNow.id, status: "APPROVED",
          approvedById: admin.id, approvedAt: daysFromNow(-15),
        },
      });

      // ── Where students send fees (editable by admins later) ──
      await tx.paymentAccount.createMany({
        data: [
          { method: "EASYPAISA", accountTitle: "Siraat tul Jannah [SAMPLE]", accountNumber: "0300-0000000", updatedById: admin.id },
          { method: "JAZZCASH", accountTitle: "Siraat tul Jannah [SAMPLE]", accountNumber: "0301-0000000", updatedById: admin.id },
        ],
      });

      // ── Live classes and attendance ─────────────────────────
      const pastClass = await tx.classSession.create({
        data: { classGroupId: qaidaNow.id, topic: "Lesson 4 — Harakat (Zabar, Zer, Pesh)", scheduledAt: daysFromNow(-2), status: "COMPLETED" },
      });
      await tx.attendance.create({
        data: { classSessionId: pastClass.id, studentId: ayesha.id, status: "PRESENT", markedById: maryam.id },
      });
      await tx.classSession.createMany({
        data: [
          { classGroupId: qaidaNow.id, topic: "Lesson 5 — Tanween", scheduledAt: daysFromNow(1) },
          { classGroupId: tajweedNow.id, topic: "Makharij of the throat letters", scheduledAt: daysFromNow(2, 10) },
        ],
      });

      // ── Feedback and recorded lectures ──────────────────────
      await tx.feedback.create({
        data: {
          studentId: ayesha.id, teacherId: maryam.id, enrollmentId: ayeshaQaida.id, type: "TEXT",
          textContent: "[SAMPLE] MashaAllah, good progress with the Harakat. Please revise Lesson 4 daily before our next class.",
        },
      });
      await tx.recordedLecture.create({
        data: {
          courseId: qaida.id, uploadedById: maryam.id, title: "Lesson 1 — The Arabic letters",
          description: "[SAMPLE] Recording of our first class.", videoUrl: "https://example.com/sample-lecture.mp4",
          durationSeconds: 45 * 60, sortOrder: 1, publishedAt: daysFromNow(-20),
        },
      });

      return { skipped: false as const };
    },
    { timeout: 60_000 }, // hashing 6 passwords at full bcrypt strength takes a few seconds
  );
}

async function main() {
  try {
    const result = await seedDevelopmentData();
    if (result.skipped) {
      console.log("Database already has users — skipping seed. Run `npm run db:reset` to wipe and re-seed.");
      return;
    }
    console.log("Sample data created. Log in with any of these (password for all: password123):");
    console.table([
      { role: "ADMIN", email: "admin@siraat.test" },
      { role: "TEACHER", email: "maryam@siraat.test" },
      { role: "TEACHER", email: "fatima@siraat.test" },
      { role: "STUDENT", email: "ayesha@siraat.test", situation: "approved, attending Noorani Qaida" },
      { role: "STUDENT", email: "zainab@siraat.test", situation: "pending — payment awaiting review" },
      { role: "STUDENT", email: "hira@siraat.test", situation: "completed Qaida (certificate), now in Tajweed" },
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when called from the command line, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
