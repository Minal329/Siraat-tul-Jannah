// Certificate designs: the three looks, the course template (with preview) and
// the per-student finished image.
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import AdminCertificate from "../app/admin/certificate/[enrollmentId].tsx";
import AdminCourses from "../app/admin/courses.tsx";
import CertificateScreen from "../app/student/certificate/[number].tsx";
import { CertificateCard } from "../components/CertificateCard.tsx";
import type { User } from "../lib/types.ts";
import { AuthContext, type AuthState } from "../lib/useAuth.ts";
import * as fake from "../test-helpers/fakeApi.ts";

jest.mock("../lib/api.ts", () => require("../test-helpers/fakeApi.ts").apiModule);
jest.mock("expo-router", () => ({
  ...require("../test-helpers/fakeApi.ts").routerModule,
  useLocalSearchParams: () => ({ number: "STJ-2026-00001-K7PX", enrollmentId: "e1" }),
}));
const mockSave = jest.fn(async () => "Saved to your photos ✓");
jest.mock("../lib/saveImage.ts", () => ({
  saveViewAsImage: (...args: unknown[]) => mockSave(...(args as [])),
  shareViewAsImage: jest.fn(async () => undefined),
}));
type Picked = { canceled: boolean; assets: { uri: string; width: number; height: number; mimeType: string; fileName: string }[] };
const mockPick = jest.fn(async (): Promise<Picked> => ({ canceled: true, assets: [] }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: () => mockPick(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));

const picked = (width: number, height: number, mimeType = "image/png") =>
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///design.png", width, height, mimeType, fileName: "design.png" }] });

const details = { studentName: "Zainab Ali", courseTitle: "Noorani Qaida", certificateNumber: "STJ-2026-00001-K7PX", issuedAt: "2026-09-29T10:00:00.000Z" };
const number = "STJ-2026-00001-K7PX";
const finished = { certificateNumber: number, issuedAt: details.issuedAt, design: "FINISHED", imageUrl: `/api/v1/certificates/${number}/image?v=abcd1234` };

beforeEach(() => {
  fake.reset();
  jest.clearAllMocks();
});

describe("the three looks", () => {
  it("built-in design and template: the app writes the student's details", async () => {
    await render(<CertificateCard certificate={details} />);
    expect(screen.getByText("Certificate of Completion")).toBeTruthy();
    expect(screen.getByText("Zainab Ali")).toBeTruthy();

    await render(<CertificateCard certificate={details} look={{ kind: "TEMPLATE", uri: "file:///t.png" }} />);
    expect(screen.getByTestId("certificate-design-image")).toBeTruthy();
    expect(screen.getByText("Zainab Ali")).toBeTruthy();
    expect(screen.getByText("Certificate no. STJ-2026-00001-K7PX")).toBeTruthy();
    expect(screen.queryByText("Certificate of Completion")).toBeNull(); // the template has its own headings
  });

  it("finished image: shown as is, nothing written on it", async () => {
    await render(<CertificateCard certificate={details} look={{ kind: "FINISHED", uri: "file:///f.png" }} />);
    expect(screen.getByTestId("certificate-design-image")).toBeTruthy();
    expect(screen.getByLabelText("Certificate of Zainab Ali")).toBeTruthy();
    expect(screen.queryByText("Zainab Ali")).toBeNull();
    expect(screen.queryByText(/Certificate no\./)).toBeNull();
  });
});

describe("student's certificate", () => {
  const auth = {
    user: { id: "u1", email: "zainab@x.pk", role: "STUDENT", profile: { id: "s1", fullName: "Zainab Ali", whatsappNumber: null } } as User,
    loading: false,
  } as AuthState;

  it("shows the finished image from the API, and saves it as a PNG once it has loaded", async () => {
    fake.responses["/enrollments/mine"] = {
      enrollments: [{ id: "e1", status: "COMPLETED", course: { id: "c1", title: "Noorani Qaida", slug: "q", feePkr: 0 }, certificate: finished, payments: [], classGroup: null }],
    };
    await render(
      <AuthContext.Provider value={auth}>
        <CertificateScreen />
      </AuthContext.Provider>,
    );

    const image = await screen.findByTestId("certificate-design-image");
    expect(image.props.source).toMatchObject([{ uri: finished.imageUrl }]);
    expect(screen.queryByText("Zainab Ali")).toBeNull();
    // Nothing to save until the image is on screen.
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();

    await fireEvent(image, "load", { nativeEvent: { source: { width: 1600, height: 1131 } } });
    await fireEvent.press(screen.getByRole("button", { name: "Save Image" }));
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), `Siraat-tul-Jannah-certificate-${number}.png`);
  });
});

describe("course certificate template (admin)", () => {
  const course = { id: "c1", title: "Noorani Qaida", slug: "q", description: "", level: null, durationWeeks: null, feePkr: 2000, thumbnailUrl: null, isPublished: true };

  async function openCourse(certificateTemplateUrl: string | null) {
    fake.responses["/admin/courses"] = { courses: [{ ...course, certificateTemplateUrl }] };
    await render(<AdminCourses />);
    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));
  }

  it("previews a chosen template with sample details, and only uploads it on Save", async () => {
    await openCourse(null);
    expect(screen.getByText(/No template — certificates use the app's built-in design/)).toBeTruthy();
    expect(screen.getAllByText(/1600 × 1131 px \(A4 landscape\)/).length).toBeGreaterThan(0);

    picked(1600, 1131);
    await fireEvent.press(screen.getByRole("button", { name: "Upload template" }));
    expect(await screen.findByText(/Preview with sample details/)).toBeTruthy();
    expect(screen.getByText("Student Name")).toBeTruthy();
    expect(screen.getByTestId("certificate-design-image").props.source).toMatchObject([{ uri: "file:///design.png" }]);
    expect(fake.writes()).toEqual([]);

    fake.responses["PUT /admin/courses/c1/certificate-template"] = { certificateTemplateUrl: "/api/v1/admin/courses/c1/certificate-template?v=1234abcd" };
    await fireEvent.press(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/courses/c1/certificate-template", method: "PUT" }]));
    expect(await screen.findByRole("button", { name: "Replace template" })).toBeTruthy();
  });

  it("refuses an image of the wrong shape before uploading anything", async () => {
    await openCourse(null);
    picked(1920, 1080);
    await fireEvent.press(screen.getByRole("button", { name: "Upload template" }));
    expect(await screen.findByText(/1920 × 1080 px, which isn't the A4 landscape shape/)).toBeTruthy();
    expect(screen.queryByText(/Preview with sample details/)).toBeNull();
    expect(fake.writes()).toEqual([]);
  });

  it("removes the template after confirming", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    fake.responses["DELETE /admin/courses/c1/certificate-template"] = { certificateTemplateUrl: null };
    await openCourse("/api/v1/admin/courses/c1/certificate-template?v=1234abcd");

    await fireEvent.press(screen.getByRole("button", { name: "Remove template" }));
    expect(alert).toHaveBeenCalledWith("Remove the certificate template?", expect.stringContaining("keep the design they were issued with"), expect.any(Array));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: "/admin/courses/c1/certificate-template", method: "DELETE" }]));
    alert.mockRestore();
  });
});

describe("finished certificate for one student (admin)", () => {
  const enrollment = (certificate: object) => ({
    id: "e1", status: "COMPLETED", appliedAt: "", approvedAt: null, rejectionReason: null,
    student: { id: "s1", userId: "u1", fullName: "Zainab Ali", whatsappNumber: null, email: "z@x.pk" },
    course: { id: "c1", title: "Noorani Qaida", feePkr: 2000 }, classGroup: null, certificate, hasVerifiedPayment: true, payments: [],
  });

  it("uploads a finished image after previewing it", async () => {
    fake.responses["/admin/enrollments?status=COMPLETED"] = { enrollments: [enrollment({ ...finished, design: "DEFAULT", imageUrl: null })] };
    await render(<AdminCertificate />);
    expect(await screen.findByText("The app's built-in design.")).toBeTruthy();

    picked(3508, 2480, "image/jpeg");
    await fireEvent.press(screen.getByRole("button", { name: "Upload finished certificate" }));
    expect(await screen.findByText(/Preview — this is exactly what the student will see/)).toBeTruthy();

    fake.responses["PUT /admin/certificates/STJ-2026-00001-K7PX/image"] = { certificate: finished };
    await fireEvent.press(screen.getByRole("button", { name: "Use this image" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: `/admin/certificates/${number}/image`, method: "PUT" }]));
  });

  it("can remove an uploaded finished image", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    fake.responses["/admin/enrollments?status=COMPLETED"] = { enrollments: [enrollment(finished)] };
    fake.responses["DELETE /admin/certificates/STJ-2026-00001-K7PX/image"] = { certificate: { ...finished, design: "DEFAULT", imageUrl: null } };
    await render(<AdminCertificate />);

    expect(await screen.findByText("A finished image uploaded for this student, shown as is.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove finished image" }));
    await waitFor(() => expect(fake.writes()).toEqual([{ path: `/admin/certificates/${number}/image`, method: "DELETE" }]));
    alert.mockRestore();
  });
});
