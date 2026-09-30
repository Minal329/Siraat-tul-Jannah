import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { createAdmin } from "../src/scripts/create-admin.ts";
import { SEED_PASSWORD, seedDevelopmentData } from "../src/scripts/seed.ts";
import { resetDatabase } from "./helpers/db.ts";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const loginAs = (email: string, password: string) =>
  request(createApp()).post("/api/v1/auth/login").send({ email, password });

describe("seedDevelopmentData", () => {
  it("fills an empty database with one of everything the screens need", async () => {
    const result = await seedDevelopmentData();

    expect(result.skipped).toBe(false);
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
    expect(await prisma.teacher.count()).toBe(2);
    expect(await prisma.student.count()).toBe(3);
    expect(await prisma.course.count({ where: { isPublished: true } })).toBe(4);
    expect(await prisma.paymentAccount.count()).toBe(2);
    expect(await prisma.certificate.count()).toBe(1);
    expect(await prisma.attendance.count()).toBe(1);
    expect(await prisma.feedback.count()).toBe(1);
    expect(await prisma.recordedLecture.count()).toBe(1);
    const statuses = (await prisma.enrollment.findMany()).map((e) => e.status).sort();
    expect(statuses).toEqual(["APPROVED", "APPROVED", "COMPLETED", "PENDING"]);
  });

  it("creates accounts you can actually log in with", async () => {
    await seedDevelopmentData();

    for (const email of ["admin@siraat.test", "maryam@siraat.test", "ayesha@siraat.test"]) {
      expect((await loginAs(email, SEED_PASSWORD)).status).toBe(200);
    }
  });

  it("keeps the data consistent: approved enrollments have a class group, completed ones a certificate", async () => {
    await seedDevelopmentData();

    const approved = await prisma.enrollment.findMany({ where: { status: "APPROVED" } });
    expect(approved.every((e) => e.classGroupId && e.approvedById)).toBe(true);
    const completed = await prisma.enrollment.findMany({ where: { status: "COMPLETED" }, include: { certificate: true } });
    expect(completed.every((e) => e.certificate)).toBe(true);
  });

  it("marks placeholder course details as [SAMPLE]", async () => {
    await seedDevelopmentData();

    const courses = await prisma.course.findMany();
    expect(courses.every((c) => c.description.startsWith("[SAMPLE]"))).toBe(true);
  });

  it("does nothing if the database already has users", async () => {
    await seedDevelopmentData();

    const second = await seedDevelopmentData();

    expect(second.skipped).toBe(true);
    expect(await prisma.user.count()).toBe(6);
  });

  it("refuses to run in production", async () => {
    await expect(seedDevelopmentData({ nodeEnv: "production" })).rejects.toThrow(/production/);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("createAdmin", () => {
  it("creates an admin who can log in with the chosen password", async () => {
    const { user, generatedPassword } = await createAdmin({
      email: "Founder@Example.com",
      fullName: "Hafiza Aqsa Jamil",
      password: "a-strong-password",
    });

    expect(generatedPassword).toBeUndefined();
    expect(user).toMatchObject({ email: "founder@example.com", role: "ADMIN" });
    expect(user.admin?.fullName).toBe("Hafiza Aqsa Jamil");
    const res = await loginAs("founder@example.com", "a-strong-password");
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("ADMIN");
  });

  it("generates a strong password when none is given", async () => {
    const { generatedPassword } = await createAdmin({ email: "admin@example.com", fullName: "Admin" });

    expect(generatedPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await loginAs("admin@example.com", generatedPassword!)).status).toBe(200);
  });

  it("refuses weak passwords and duplicate emails", async () => {
    await expect(createAdmin({ email: "a@example.com", fullName: "Admin", password: "short" })).rejects.toThrow();

    await createAdmin({ email: "a@example.com", fullName: "Admin", password: "long-enough-1" });
    await expect(
      createAdmin({ email: "A@example.com", fullName: "Admin Two", password: "long-enough-2" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(await prisma.user.count()).toBe(1);
  });
});
