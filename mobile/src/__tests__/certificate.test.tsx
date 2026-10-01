import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import CertificateScreen from "../app/student/certificate/[number].tsx";
import type { User } from "../lib/types.ts";
import { AuthContext, type AuthState } from "../lib/useAuth.ts";

const mockSave = jest.fn(async () => "Saved to your photos ✓");
jest.mock("../lib/saveImage.ts", () => ({
  saveViewAsImage: (...args: unknown[]) => mockSave(...(args as [])),
  shareViewAsImage: jest.fn(async () => undefined),
}));
jest.mock("../lib/api.ts", () => ({
  api: async () => ({
    enrollments: [
      {
        id: "e1",
        status: "COMPLETED",
        course: { id: "c1", title: "Noorani Qaida", slug: "noorani-qaida", feePkr: 2000 },
        certificate: { certificateNumber: "STJ-2026-00001-K7PX", issuedAt: "2026-09-29T10:00:00.000Z" },
        payments: [],
        classGroup: null,
      },
    ],
  }),
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ number: "STJ-2026-00001-K7PX" }),
  // Load data as soon as the screen appears (no navigation in tests).
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const auth = {
  user: { id: "u1", email: "zainab@x.pk", role: "STUDENT", profile: { id: "s1", fullName: "Zainab Ali", whatsappNumber: null } } as User,
  loading: false,
} as AuthState;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Certificate screen", () => {
  it("draws the certificate from the student's own course and saves it as an image", async () => {
    await render(
      <AuthContext.Provider value={auth}>
        <CertificateScreen />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText("Zainab Ali")).toBeTruthy();
    expect(screen.getByText("Noorani Qaida")).toBeTruthy();
    expect(screen.getByText("Certificate no. STJ-2026-00001-K7PX")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Save Image" }));
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), "Siraat-tul-Jannah-certificate-STJ-2026-00001-K7PX.png");
    expect(await screen.findByText("Saved to your photos ✓")).toBeTruthy();
  });
});
