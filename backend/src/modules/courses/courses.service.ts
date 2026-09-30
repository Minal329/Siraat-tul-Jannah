// Course catalog logic. Public functions only ever see published courses;
// admin functions see and change everything.
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import type { CreateCourseInput, UpdateCourseInput } from "./courses.schemas.ts";

type CourseRow = Prisma.CourseGetPayload<object>;

const courseNotFound = () => new AppError(404, "NOT_FOUND", "Course not found.");

// Fields anyone may see. Built field by field so internal columns never leak.
function toPublicCourse(course: CourseRow) {
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    level: course.level,
    durationWeeks: course.durationWeeks,
    feePkr: course.feePkr,
    thumbnailUrl: course.thumbnailUrl,
  };
}

function toAdminCourse(course: CourseRow) {
  return {
    ...toPublicCourse(course),
    isPublished: course.isPublished,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

export async function listPublishedCourses() {
  const courses = await prisma.course.findMany({ where: { isPublished: true }, orderBy: { createdAt: "asc" } });
  return { courses: courses.map(toPublicCourse) };
}

// A course page: the course plus its currently running/upcoming batches.
// Zoom details and WhatsApp links are NOT included — only enrolled students get those.
export async function getPublishedCourse(slug: string) {
  const course = await prisma.course.findFirst({
    where: { slug, isPublished: true },
    include: {
      classGroups: {
        where: { isActive: true },
        orderBy: { startDate: "asc" },
        include: { teacher: { select: { fullName: true } } },
      },
    },
  });
  if (!course) throw courseNotFound();

  return {
    course: {
      ...toPublicCourse(course),
      classGroups: course.classGroups.map((group) => ({
        id: group.id,
        name: group.name,
        batchLabel: group.batchLabel,
        scheduleText: group.scheduleText,
        startDate: group.startDate,
        endDate: group.endDate,
        teacherName: group.teacher?.fullName ?? null,
      })),
    },
  };
}

export async function listAllCourses() {
  const courses = await prisma.course.findMany({ orderBy: { createdAt: "asc" } });
  return { courses: courses.map(toAdminCourse) };
}

export async function createCourse(input: CreateCourseInput) {
  try {
    return { course: toAdminCourse(await prisma.course.create({ data: input })) };
  } catch (err) {
    throw slugTakenOr(err);
  }
}

export async function updateCourse(id: string, changes: UpdateCourseInput) {
  try {
    return { course: toAdminCourse(await prisma.course.update({ where: { id }, data: changes })) };
  } catch (err) {
    // P2025 = the row to update doesn't exist.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw courseNotFound();
    throw slugTakenOr(err);
  }
}

function slugTakenOr(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return new AppError(409, "SLUG_TAKEN", "Another course already uses this slug. Choose a different one.");
  }
  return err;
}
