// Admin view of a student's certificate — the same image the student gets, so the
// admin can save it or send it (e.g. to a parent on WhatsApp).
import { Stack, useLocalSearchParams } from "expo-router";
import { CertificateView } from "../../../components/CertificateView.tsx";
import { Empty, Loaded, Screen } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { useLoad } from "../../../lib/hooks.ts";
import type { AdminEnrollment } from "../../../lib/types.ts";

export default function AdminCertificate() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>();
  const state = useLoad(async () => {
    const { enrollments } = await api<{ enrollments: AdminEnrollment[] }>("/admin/enrollments?status=COMPLETED");
    return enrollments.find((e) => e.id === enrollmentId) ?? null;
  }, [enrollmentId]);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Certificate" }} />
      <Loaded state={state}>
        {(e) =>
          !e?.certificate ? (
            <Empty>Certificate not found.</Empty>
          ) : (
            <CertificateView
              certificate={{
                studentName: e.student.fullName,
                courseTitle: e.course.title,
                certificateNumber: e.certificate.certificateNumber,
                issuedAt: e.certificate.issuedAt,
              }}
            />
          )
        }
      </Loaded>
    </Screen>
  );
}
