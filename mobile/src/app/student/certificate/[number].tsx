// Certificate (prototype screen 9): the certificate drawn in the app, with
// "Save Image" (to the phone's photos) and "Share" (WhatsApp etc.) as a PNG.
import { Stack, useLocalSearchParams } from "expo-router";
import { CertificateView } from "../../../components/CertificateView.tsx";
import { Empty, Loaded, Screen } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { useLoad } from "../../../lib/hooks.ts";
import type { Enrollment } from "../../../lib/types.ts";
import { useAuth } from "../../../lib/useAuth.ts";

export default function CertificateScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const { user } = useAuth();
  const state = useLoad(async () => {
    const { enrollments } = await api<{ enrollments: Enrollment[] }>("/enrollments/mine");
    return enrollments.find((e) => e.certificate?.certificateNumber === number) ?? null;
  }, [number]);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Certificate" }} />
      <Loaded state={state}>
        {(enrollment) =>
          !enrollment?.certificate ? (
            <Empty>Certificate not found.</Empty>
          ) : (
            <CertificateView
              certificate={{
                studentName: user?.profile?.fullName ?? "",
                courseTitle: enrollment.course.title,
                certificateNumber: enrollment.certificate.certificateNumber,
                issuedAt: enrollment.certificate.issuedAt,
              }}
            />
          )
        }
      </Loaded>
    </Screen>
  );
}
