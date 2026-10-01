// Admin screens for steps 18–20: courses, class groups, teachers, students.
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import AdminCourses from "../app/admin/courses.tsx";
import AdminGroups from "../app/admin/groups.tsx";
import AdminStudents from "../app/admin/students.tsx";
import AdminTeachers from "../app/admin/teachers.tsx";
import * as fake from "../test-helpers/fakeApi.ts";

jest.mock("../lib/api.ts", () => require("../test-helpers/fakeApi.ts").apiModule);
jest.mock("expo-router", () => require("../test-helpers/fakeApi.ts").routerModule);

const course = { id: "c1", title: "Noorani Qaida", slug: "noorani-qaida", description: "Learn the letters.", level: "Beginner", durationWeeks: 12, feePkr: 2000, thumbnailUrl: null, isPublished: false };
const teacher = { id: "t1", userId: "ut1", fullName: "Ustadha Maryam", email: "maryam@x.pk", whatsappNumber: null, isActive: true, activeClassGroups: 1 };
const group = {
  id: "g1", name: "Qaida — Evening", batchLabel: null, scheduleText: "Mon/Wed 8pm", startDate: "2027-01-15T00:00:00.000Z", endDate: null,
  maxStudents: 10, studentCount: 3, zoomMeetingId: "111 222 3333", zoomPasscode: "q", zoomJoinUrl: "https://us06web.zoom.us/j/1?pwd=x",
  whatsappGroupLink: null, isActive: true, course: { id: "c1", title: "Noorani Qaida" }, teacher: { id: "t1", fullName: "Ustadha Maryam" },
};
const enrollment = (id: string, status: string, extra: object = {}) => ({
  id, status, appliedAt: "", approvedAt: null, rejectionReason: null,
  student: { id: `s-${id}`, userId: `u-${id}`, fullName: `Student ${id}`, whatsappNumber: null, email: `${id}@x.pk` },
  course: { id: "c1", title: "Noorani Qaida", feePkr: 2000 }, classGroup: { id: "g1", name: "Qaida — Evening" },
  certificate: null, hasVerifiedPayment: true, payments: [], ...extra,
});

beforeEach(() => {
  fake.reset();
});

describe("Courses (step 18)", () => {
  beforeEach(() => {
    fake.responses["/admin/courses"] = { courses: [course] };
  });

  it("adds a course with whole-rupee fee and weeks", async () => {
    await render(<AdminCourses />);
    await fireEvent.press(await screen.findByRole("button", { name: "+ Add a course" }));
    await fireEvent.changeText(screen.getByLabelText("Course title"), "Weekend Tajweed Circle");
    await fireEvent.changeText(screen.getByLabelText("Description"), "Tajweed rules for adults, every weekend.");
    await fireEvent.changeText(screen.getByLabelText("Fee (PKR, 0 = free)"), "3500");
    await fireEvent.changeText(screen.getByLabelText("Weeks (optional)"), "8");
    await fireEvent.press(screen.getByRole("button", { name: "Add course" }));

    await waitFor(() =>
      expect(fake.writes()).toEqual([
        {
          path: "/admin/courses",
          method: "POST",
          body: { title: "Weekend Tajweed Circle", description: "Tajweed rules for adults, every weekend.", level: null, durationWeeks: 8, feePkr: 3500, isPublished: true },
        },
      ]),
    );
  });

  it("refuses a fee that isn't whole rupees before calling the server", async () => {
    await render(<AdminCourses />);
    await fireEvent.press(await screen.findByRole("button", { name: "+ Add a course" }));
    await fireEvent.changeText(screen.getByLabelText("Fee (PKR, 0 = free)"), "1500.50");
    await fireEvent.press(screen.getByRole("button", { name: "Add course" }));
    expect(screen.getByText("Enter the fee in whole rupees (0 for a free course).")).toBeTruthy();
    expect(fake.writes()).toEqual([]);
  });

  it("publishes a draft course", async () => {
    await render(<AdminCourses />);
    await fireEvent.press(await screen.findByRole("button", { name: "Publish" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/courses/c1", method: "PATCH", body: { isPublished: true } }]));
  });
});

describe("Class groups (step 19)", () => {
  beforeEach(() => {
    fake.responses["/admin/class-groups"] = { classGroups: [group] };
    fake.responses["/admin/courses"] = { courses: [course] };
    fake.responses["/admin/teachers"] = { teachers: [teacher] };
    fake.responses["/admin/class-groups/zoom-status"] = { zoomConfigured: false };
  });

  it("creates a group for a course and teacher", async () => {
    await render(<AdminGroups />);
    await fireEvent.press(await screen.findByRole("button", { name: "+ Add a class group" }));
    await fireEvent.changeText(screen.getByLabelText("Group name"), "Qaida — Morning");
    await fireEvent.press(screen.getByRole("button", { name: "Ustadha Maryam" }));
    await fireEvent.changeText(screen.getByLabelText("Starts (YYYY-MM-DD)"), "2027-02-01");
    await fireEvent.changeText(screen.getByLabelText("Max students (optional)"), "12");
    await fireEvent.press(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() =>
      expect(fake.writes()).toEqual([
        {
          path: "/admin/class-groups",
          method: "POST",
          body: {
            courseId: "c1", teacherId: "t1", name: "Qaida — Morning", scheduleText: null, startDate: "2027-02-01", endDate: null,
            maxStudents: 12, zoomMeetingId: null, zoomPasscode: null, whatsappGroupLink: null,
          },
        },
      ]),
    );
  });

  it("checks the date format", async () => {
    await render(<AdminGroups />);
    await fireEvent.press(await screen.findByRole("button", { name: "+ Add a class group" }));
    await fireEvent.changeText(screen.getByLabelText("Group name"), "Qaida — Morning");
    await fireEvent.changeText(screen.getByLabelText("Starts (YYYY-MM-DD)"), "01/02/2027");
    await fireEvent.press(screen.getByRole("button", { name: "Create group" }));
    expect(screen.getByText("Start date: use the format YYYY-MM-DD, e.g. 2027-01-15.")).toBeTruthy();
    expect(fake.writes()).toEqual([]);
  });

  it("editing keeps a Zoom link made by the Zoom API unless the meeting ID changes, and can close a batch", async () => {
    await render(<AdminGroups />);
    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await fireEvent.changeText(screen.getByLabelText("Schedule (optional)"), "Tue/Thu 8pm");
    await fireEvent.press(screen.getByRole("button", { name: "Batch is running (uncheck to close it)" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fake.writes()).toHaveLength(1));
    const [patch] = fake.writes();
    expect(patch).toMatchObject({ path: "/admin/class-groups/g1", method: "PATCH" });
    expect(patch.body).toMatchObject({ scheduleText: "Tue/Thu 8pm", startDate: "2027-01-15", isActive: false });
    expect(patch.body).not.toHaveProperty("zoomMeetingId", expect.anything());
  });
});

describe("Teachers (step 19)", () => {
  beforeEach(() => {
    fake.responses["/admin/teachers"] = { teachers: [teacher] };
    fake.responses["POST /admin/teachers"] = {
      teacher: { ...teacher, id: "t2", userId: "ut2", fullName: "Ustadha Fatima", email: "fatima@x.pk" },
      temporaryPassword: "Tmp-Pass-1234567",
    };
  });

  it("adds a teacher and shows the temporary password once", async () => {
    await render(<AdminTeachers />);
    await fireEvent.press(await screen.findByRole("button", { name: "+ Add a teacher" }));
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Ustadha Fatima");
    await fireEvent.changeText(screen.getByLabelText("Email"), "fatima@x.pk");
    await fireEvent.press(screen.getByRole("button", { name: "Create teacher account" }));

    expect(await screen.findByLabelText("Temporary password Tmp-Pass-1234567")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send on WhatsApp / share" })).toBeTruthy();
    expect(fake.writes()).toEqual([{ path: "/admin/teachers", method: "POST", body: { fullName: "Ustadha Fatima", email: "fatima@x.pk", whatsappNumber: undefined } }]);
  });

  it("disables a teacher who left", async () => {
    await render(<AdminTeachers />);
    await fireEvent.press(await screen.findByRole("button", { name: "Disable" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/users/ut1/status", method: "PATCH", body: { isActive: false } }]));
  });
});

describe("Students (step 20)", () => {
  beforeEach(() => {
    fake.responses["/admin/enrollments?status=APPROVED"] = { enrollments: [enrollment("e1", "APPROVED")] };
    fake.responses["/admin/enrollments?status=COMPLETED"] = {
      enrollments: [
        enrollment("e2", "COMPLETED"),
        enrollment("e3", "COMPLETED", { certificate: { certificateNumber: "STJ-2026-00001-K7PX", issuedAt: "2026-09-29T00:00:00.000Z" } }),
      ],
    };
    fake.responses["/admin/class-groups"] = { classGroups: [group, { ...group, id: "g2", name: "Qaida — Morning", studentCount: 1 }] };
  });

  it("marks a course complete after confirming", async () => {
    // The phone's "Are you sure?" dialog: press its "Mark complete" button.
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.[1]?.onPress?.());
    await render(<AdminStudents />);
    await fireEvent.press(await screen.findByRole("button", { name: "Mark course complete" }));
    expect(alert).toHaveBeenCalledWith("Mark course complete?", expect.stringContaining("Student e1"), expect.any(Array));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/enrollments/e1/complete", method: "POST", body: {} }]));
    alert.mockRestore();
  });

  it("moves a student to another group", async () => {
    await render(<AdminStudents />);
    await fireEvent.press(await screen.findByRole("button", { name: "Move group" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move student" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/enrollments/e1/move", method: "POST", body: { classGroupId: "g2" } }]));
  });

  it("issues a certificate for a finished course, and opens an issued one", async () => {
    await render(<AdminStudents />);
    await fireEvent.press(await screen.findByRole("button", { name: /Completed/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Issue certificate" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/certificates", method: "POST", body: { enrollmentId: "e2" } }]));

    await fireEvent.press(screen.getByRole("button", { name: "View certificate" }));
    expect(fake.pushed).toEqual(["/admin/certificate/e3"]);
  });

  it("searches by name", async () => {
    await render(<AdminStudents />);
    await fireEvent.press(await screen.findByRole("button", { name: /Completed/ }));
    await fireEvent.changeText(screen.getByLabelText("Search"), "student e3");
    expect(screen.queryByText("Student e2")).toBeNull();
    expect(within(screen.getByText("Student e3").parent!.parent!).getByText(/STJ-2026-00001-K7PX/)).toBeTruthy();
  });
});
