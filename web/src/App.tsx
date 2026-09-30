// Which page shows at which address, and who may see it.
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Spinner } from "./components/ui.tsx";
import { homeFor, useAuth } from "./lib/useAuth.ts";
import type { Role } from "./lib/types.ts";
import { AdminDashboardPage } from "./pages/AdminDashboard.tsx";
import { CatalogPage } from "./pages/Catalog.tsx";
import { CertificatePage, VerifyPage } from "./pages/Certificate.tsx";
import { EnrollPaymentPage } from "./pages/EnrollPayment.tsx";
import { LecturesPage } from "./pages/Lectures.tsx";
import { LiveClassPage } from "./pages/LiveClass.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { StudentDashboardPage } from "./pages/StudentDashboard.tsx";
import { StudentFeedbackPage } from "./pages/StudentFeedback.tsx";
import { TeacherDashboardPage } from "./pages/TeacherDashboard.tsx";
import { TeacherLecturesPage } from "./pages/TeacherLectures.tsx";

// Only lets the listed roles in; everyone else goes to login or their own home page.
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? homeFor(user.role) : "/courses"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage mode="login" />} />
      <Route path="/signup" element={<LoginPage mode="signup" />} />
      <Route path="/courses" element={<CatalogPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/verify/:number" element={<VerifyPage />} />

      <Route path="/student" element={<RequireRole roles={["STUDENT"]}><StudentDashboardPage /></RequireRole>} />
      <Route path="/student/pay/:enrollmentId" element={<RequireRole roles={["STUDENT"]}><EnrollPaymentPage /></RequireRole>} />
      <Route path="/student/live/:enrollmentId" element={<RequireRole roles={["STUDENT"]}><LiveClassPage /></RequireRole>} />
      <Route path="/student/lectures" element={<RequireRole roles={["STUDENT"]}><LecturesPage /></RequireRole>} />
      <Route path="/student/feedback" element={<RequireRole roles={["STUDENT"]}><StudentFeedbackPage /></RequireRole>} />
      <Route path="/student/certificates/:number" element={<RequireRole roles={["STUDENT", "ADMIN"]}><CertificatePage /></RequireRole>} />

      <Route path="/teacher" element={<RequireRole roles={["TEACHER", "ADMIN"]}><TeacherDashboardPage /></RequireRole>} />
      <Route path="/teacher/lectures" element={<RequireRole roles={["TEACHER", "ADMIN"]}><TeacherLecturesPage /></RequireRole>} />

      <Route path="/admin" element={<RequireRole roles={["ADMIN"]}><AdminDashboardPage /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
