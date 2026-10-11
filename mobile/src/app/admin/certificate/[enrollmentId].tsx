// Admin view of a student's certificate — the same image the student gets, so the
// admin can save it or send it (e.g. to a parent on WhatsApp).
//
// Here the admin can also upload a FINISHED certificate for this one student: a
// complete image made elsewhere (name and date already on it), shown as is in
// place of the course template / built-in design. It can be replaced or removed later.
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CertificateCard, lookOf, type CertificateDetails } from "../../../components/CertificateCard.tsx";
import { CertificateView } from "../../../components/CertificateView.tsx";
import { Button, Card, Empty, ErrorText, Loaded, Muted, Notice, Screen, styles, Title } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { certificateImageForm, pickCertificateImage, SIZE_RULES, type PickedImage } from "../../../lib/certificateImage.ts";
import { confirm } from "../../../lib/confirm.ts";
import { useAction, useLoad } from "../../../lib/hooks.ts";
import type { AdminEnrollment, CertificateSummary } from "../../../lib/types.ts";

const DESIGN_TEXT: Record<CertificateSummary["design"], string> = {
  FINISHED: "A finished image uploaded for this student, shown as is.",
  TEMPLATE: "Drawn on the course's certificate template (the one it had when this certificate was issued).",
  DEFAULT: "The app's built-in design.",
};

export default function AdminCertificate() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>();
  const state = useLoad(async () => {
    const { enrollments } = await api<{ enrollments: AdminEnrollment[] }>("/admin/enrollments?status=COMPLETED");
    return enrollments.find((e) => e.id === enrollmentId) ?? null;
  }, [enrollmentId]);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Certificate" }} />
      <Loaded state={state}>
        {(e) => {
          if (!e?.certificate) return <Empty>Certificate not found.</Empty>;
          const details = {
            studentName: e.student.fullName,
            courseTitle: e.course.title,
            certificateNumber: e.certificate.certificateNumber,
            issuedAt: e.certificate.issuedAt,
          };
          return (
            <>
              <CertificateView look={lookOf(e.certificate)} certificate={details} />
              <FinishedImage certificate={e.certificate} details={details} onChanged={state.reload} />
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function FinishedImage({
  certificate,
  details,
  onChanged,
}: {
  certificate: CertificateSummary;
  details: CertificateDetails;
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const { busy, error, run } = useAction();
  const path = `/admin/certificates/${certificate.certificateNumber}/image`;
  const hasFinished = certificate.design === "FINISHED";

  const choose = () =>
    run(async () => {
      const image = await pickCertificateImage();
      if (image) setPicked(image);
    });
  const save = async () => {
    const done = await run(async () => api(path, { method: "PUT", form: await certificateImageForm(picked!) }));
    if (done !== undefined) {
      setPicked(null);
      onChanged();
    }
  };
  const remove = () =>
    confirm(
      "Remove the finished image?",
      "The certificate goes back to the course template it was issued with, or the app's built-in design.",
      "Remove",
      async () => {
        if ((await run(() => api(path, { method: "DELETE" }))) !== undefined) onChanged();
      },
    );

  return (
    <Card>
      <Title>Certificate design</Title>
      <Muted small>{DESIGN_TEXT[certificate.design]}</Muted>
      {picked ? (
        <>
          <Notice>Preview — this is exactly what the student will see. The image is shown as is, so the name and date must already be on it.</Notice>
          <CertificateCard certificate={details} look={{ kind: "FINISHED", uri: picked.uri }} />
          <ErrorText error={error} />
          <View style={styles.row}>
            <Button small label={busy ? "Uploading…" : "Use this image"} onPress={save} disabled={busy} />
            <Button small variant="outline" label="Cancel" onPress={() => setPicked(null)} disabled={busy} />
          </View>
        </>
      ) : (
        <>
          <Muted small>
            Have a certificate made elsewhere (e.g. in Canva) with this student's name and date on it? Upload it and the student gets
            exactly that image. Size: {SIZE_RULES}.
          </Muted>
          <ErrorText error={error} />
          <View style={styles.row}>
            <Button small variant="outline" label={hasFinished ? "Replace finished image" : "Upload finished certificate"} onPress={choose} disabled={busy} />
            {hasFinished && <Button small variant="danger" label="Remove finished image" onPress={remove} disabled={busy} />}
          </View>
        </>
      )}
    </Card>
  );
}
