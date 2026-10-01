// Shapes of the data the API sends back. Kept in step with web/src/lib/types.ts.

export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export type User = {
  id: string;
  email: string;
  role: Role;
  profile: { id: string; fullName: string; whatsappNumber: string | null } | null;
};

export type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string | null;
  durationWeeks: number | null;
  feePkr: number;
  thumbnailUrl: string | null;
};

export type AdminCourse = Course & { isPublished: boolean };

export type PaymentMethod = "EASYPAISA" | "JAZZCASH" | "BANK_TRANSFER";

export type Payment = {
  id: string;
  method: PaymentMethod;
  amountPkr: number;
  transactionId: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  proofUrl: string;
};

export type EnrollmentStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";

export type Enrollment = {
  id: string;
  status: EnrollmentStatus;
  appliedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  course: { id: string; title: string; slug: string; feePkr: number };
  classGroup: {
    id: string;
    name: string;
    scheduleText: string | null;
    startDate: string | null;
    endDate: string | null;
    teacherName: string | null;
    whatsappGroupLink: string | null;
    zoomMeetingId: string | null;
    zoomPasscode: string | null;
    zoomJoinUrl: string | null;
  } | null;
  certificate: { certificateNumber: string; issuedAt: string; downloadUrl: string; verifyUrl: string } | null;
  payments: Payment[];
};

export type PaymentAccount = {
  id: string;
  method: PaymentMethod;
  accountTitle: string;
  accountNumber: string;
  instructions: string | null;
  isActive?: boolean;
};

export type Session = {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";
  startedAt: string | null;
  endedAt: string | null;
  livePlatform: LivePlatform | null;
  liveNote: string | null;
};

export type LivePlatform = "ZOOM" | "WHATSAPP";

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

export type AttendanceSummary = {
  classes: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  notMarked: number;
  attendanceRate: number | null;
};

export type Feedback = {
  id: string;
  type: "TEXT" | "VOICE";
  text: string | null;
  voiceUrl: string | null;
  voiceDurationSeconds: number | null;
  readAt: string | null;
  sentAt: string;
  teacherName: string;
  studentName: string;
  enrollmentId: string | null;
  courseTitle: string | null;
};

export type Lecture = {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  embedUrl: string | null;
  durationSeconds: number | null;
  published: boolean;
  publishedAt: string | null;
  course: { id: string; title: string };
  classGroup: { id: string; name: string } | null;
  teacherName: string | null;
};

export type TeacherGroup = {
  id: string;
  name: string;
  scheduleText: string | null;
  course: { id: string; title: string };
  studentCount: number;
};

export type RosterStudent = { studentId: string; enrollmentId: string; fullName: string; enrollmentStatus: EnrollmentStatus };

export type AdminEnrollment = {
  id: string;
  status: EnrollmentStatus;
  appliedAt: string;
  rejectionReason: string | null;
  student: { id: string; userId: string; fullName: string; whatsappNumber: string | null; email: string };
  course: { id: string; title: string; feePkr: number };
  classGroup: { id: string; name: string } | null;
  certificate: { certificateNumber: string; issuedAt: string } | null;
  hasVerifiedPayment: boolean;
  payments: Payment[];
};

export type AdminPayment = Payment & {
  enrollment: { id: string; status: EnrollmentStatus; courseTitle: string; courseFeePkr: number };
  student: { fullName: string; whatsappNumber: string | null };
};

export type AdminClassGroup = {
  id: string;
  name: string;
  batchLabel: string | null;
  scheduleText: string | null;
  startDate: string | null;
  endDate: string | null;
  maxStudents: number | null;
  studentCount: number;
  zoomMeetingId: string | null;
  zoomPasscode: string | null;
  zoomJoinUrl: string | null;
  whatsappGroupLink: string | null;
  isActive: boolean;
  course: { id: string; title: string };
  teacher: { id: string; fullName: string } | null;
};

export type TeacherSummary = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  whatsappNumber: string | null;
  isActive: boolean;
  activeClassGroups: number;
};
