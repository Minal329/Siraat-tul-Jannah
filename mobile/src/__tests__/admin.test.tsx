import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AdminHome from "../app/admin/index.tsx";

type Call = { path: string; options?: { method?: string; body?: unknown } };
const mockCalls: Call[] = [];

const enrollment = (id: string, name: string, payment: object | null) => ({
  id,
  status: "PENDING",
  appliedAt: "2026-09-30T10:00:00.000Z",
  approvedAt: null,
  rejectionReason: null,
  student: { id: `s-${id}`, userId: `u-${id}`, fullName: name, whatsappNumber: null, email: `${id}@x.pk` },
  course: { id: "c1", title: "Noorani Qaida", feePkr: 2000 },
  classGroup: null,
  certificate: null,
  hasVerifiedPayment: false,
  payments: payment ? [payment] : [],
});
const payment = { id: "p1", method: "EASYPAISA", amountPkr: 2000, transactionId: "8842190231", status: "PENDING", reviewNote: null, submittedAt: "", reviewedAt: null, proofUrl: "/api/v1/payments/p1/proof" };

jest.mock("../lib/api.ts", () => ({
  api: async (path: string, options?: { method?: string; body?: unknown }) => {
    mockCalls.push({ path, options });
    if (path === "/admin/enrollments?status=PENDING") {
      return { enrollments: [enrollment("e1", "Zainab Ali", payment), enrollment("e2", "Sara Ahmed", null)] };
    }
    if (path === "/admin/enrollments?status=APPROVED") return { enrollments: [] };
    if (path === "/admin/class-groups") {
      return {
        classGroups: [
          { id: "g1", name: "Evening Batch", isActive: true, studentCount: 3, maxStudents: 10, course: { id: "c1", title: "Noorani Qaida" } },
          { id: "g2", name: "Morning Batch", isActive: true, studentCount: 1, maxStudents: null, course: { id: "c1", title: "Noorani Qaida" } },
        ],
      };
    }
    if (path === "/admin/payment-accounts") {
      return { accounts: [{ id: "a1", method: "EASYPAISA", accountTitle: "Old title", accountNumber: "0300-0000000", instructions: null, isActive: true }] };
    }
    return {};
  },
  authHeaders: async () => ({}),
  fileUrl: (p: string) => p,
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const writes = () => mockCalls.filter((c) => c.options?.body !== undefined || c.options?.method);

beforeEach(() => {
  mockCalls.length = 0;
});

describe("Admin dashboard", () => {
  it("lists waiting applications with their payment", async () => {
    await render(<AdminHome />);
    expect(await screen.findByText("Zainab Ali")).toBeTruthy();
    expect(screen.getByText("Noorani Qaida · Easypaisa · PKR 2,000")).toBeTruthy();
    expect(screen.getByText("Payment screenshot · Txn 8842190231")).toBeTruthy();
    expect(screen.getByText("No payment screenshot uploaded yet.")).toBeTruthy();
  });

  it("Approve & Assign confirms the payment, then places the student in the chosen group", async () => {
    await render(<AdminHome />);
    await screen.findByText("Zainab Ali");
    await fireEvent.press(screen.getAllByRole("button", { name: "Morning Batch (1)" })[0]);
    await fireEvent.press(screen.getAllByRole("button", { name: "Approve & Assign" })[0]);

    await waitFor(() => expect(screen.getByText("✓ Assigned to Morning Batch")).toBeTruthy());
    expect(writes()).toEqual([
      { path: "/admin/payments/p1/verify", options: { body: {} } },
      { path: "/admin/enrollments/e1/approve", options: { body: { classGroupId: "g2", approveWithoutPayment: undefined } } },
    ]);
  });

  it("without a payment, approving needs the scholarship/cash option", async () => {
    await render(<AdminHome />);
    await screen.findByText("Sara Ahmed");
    const approveSara = screen.getAllByRole("button", { name: "Approve & Assign" })[1];
    expect(approveSara.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByRole("button", { name: "Approve without payment (scholarship / cash)" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "Approve & Assign" })[1]);

    await waitFor(() =>
      expect(writes()).toEqual([{ path: "/admin/enrollments/e2/approve", options: { body: { classGroupId: "g1", approveWithoutPayment: true } } }]),
    );
  });

  it("Reject sends the payment back with the reason the student will see", async () => {
    await render(<AdminHome />);
    await screen.findByText("Zainab Ali");
    await fireEvent.press(screen.getAllByRole("button", { name: "Reject" })[0]);
    await fireEvent.press(screen.getByRole("button", { name: "The screenshot is unclear — please upload it again." }));
    await fireEvent.press(screen.getByRole("button", { name: "Reject payment" }));

    await waitFor(() =>
      expect(writes()).toEqual([{ path: "/admin/payments/p1/reject", options: { body: { note: "The screenshot is unclear — please upload it again." } } }]),
    );
    expect(await screen.findByText("✕ Payment rejected")).toBeTruthy();
  });

  it("the gear edits the payment numbers students pay to", async () => {
    await render(<AdminHome />);
    await screen.findByText("Zainab Ali");
    await fireEvent.press(screen.getByRole("button", { name: "Payment settings" }));
    await fireEvent.changeText(await screen.findByLabelText("Easypaisa account number"), "0300-1234567");
    await fireEvent.changeText(screen.getByLabelText("JazzCash account number"), "0301-7654321");
    await fireEvent.changeText(screen.getByLabelText("Account title"), "Siraat tul Jannah Academy");
    await fireEvent.press(screen.getByRole("button", { name: "Save Payment Details" }));

    await waitFor(() =>
      expect(writes()).toEqual([
        { path: "/admin/payment-accounts/a1", options: { method: "PATCH", body: { accountNumber: "0300-1234567", accountTitle: "Siraat tul Jannah Academy", isActive: true } } },
        { path: "/admin/payment-accounts", options: { body: { method: "JAZZCASH", accountNumber: "0301-7654321", accountTitle: "Siraat tul Jannah Academy" } } },
      ]),
    );
  });
});
