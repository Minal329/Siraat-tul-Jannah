import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import TeacherLectures from "../app/teacher/lectures.tsx";
import * as fake from "../test-helpers/fakeApi.ts";

jest.mock("../lib/api.ts", () => require("../test-helpers/fakeApi.ts").apiModule);
jest.mock("expo-router", () => require("../test-helpers/fakeApi.ts").routerModule);

const groups = [{ id: "g1", name: "Qaida — Evening", scheduleText: null, course: { id: "c1", title: "Noorani Qaida" }, studentCount: 3 }];
const lecture = {
  id: "l1", title: "Lesson 4", description: null, videoUrl: "https://youtu.be/abc", embedUrl: null, durationSeconds: 1500, published: true,
  publishedAt: "", course: { id: "c1", title: "Noorani Qaida" }, classGroup: null, teacherName: "Ustadha Maryam",
};

beforeEach(() => {
  fake.reset();
  fake.responses["/teacher/lectures"] = { lectures: [lecture] };
  fake.responses["/teacher/class-groups"] = { classGroups: groups };
});

describe("Recorded lectures (teachers)", () => {
  it("adds a video link for every group of the course, or just one group", async () => {
    await render(<TeacherLectures />);
    await fireEvent.press(await screen.findByRole("button", { name: "+ Add a recording" }));
    await fireEvent.changeText(screen.getByLabelText("Title"), "Lesson 5 — Tanween");
    await fireEvent.changeText(screen.getByLabelText("Video link"), "https://youtu.be/xyz");
    await fireEvent.changeText(screen.getByLabelText("Length in minutes (optional)"), "25");
    await fireEvent.press(screen.getByRole("button", { name: "For every Noorani Qaida group" })); // → only this group
    await fireEvent.press(screen.getByRole("button", { name: "Add recording" }));

    await waitFor(() =>
      expect(fake.writes()).toEqual([
        {
          path: "/teacher/lectures",
          method: "POST",
          body: { courseId: "c1", classGroupId: "g1", title: "Lesson 5 — Tanween", videoUrl: "https://youtu.be/xyz", description: undefined, durationSeconds: 1500, published: true },
        },
      ]),
    );
  });

  it("unpublishes a recording", async () => {
    await render(<TeacherLectures />);
    await fireEvent.press(await screen.findByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/teacher/lectures/l1", method: "PATCH", body: { published: false } }]));
  });
});
