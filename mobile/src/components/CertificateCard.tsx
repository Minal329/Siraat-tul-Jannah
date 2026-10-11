// The certificate of completion: A4 landscape (1600 × 1131 px when saved).
// The app turns this view into a PNG (lib/saveImage.ts) — there is no PDF and no
// website: what's on screen is exactly what gets saved or shared.
//
// Three looks (the API decides which one a certificate has):
//   DEFAULT  — the built-in design, drawn here
//   TEMPLATE — the course's background image, with the details drawn on top
//   FINISHED — a complete image uploaded for this student, shown as is
//
// Everything is laid out in 1600 × 1131 units and scaled to the card's width, so
// the details land in the same spots on every phone and in the saved image.
// Template makers: keep the areas in TEXT_AREAS (below) plain.
import { Image } from "expo-image";
import { useEffect, useState, type Ref } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { CERTIFICATE_HEIGHT, CERTIFICATE_WIDTH } from "../lib/certificateImage.ts";
import { formatDate } from "../lib/format.ts";
import { colors, fonts } from "../lib/theme.ts";
import type { CertificateSummary } from "../lib/types.ts";
import { Icon } from "./Icon.tsx";
import { usePrivateImageSource } from "./PrivateImage.tsx";

export type CertificateDetails = {
  studentName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: string;
};

export type CertificateLook =
  | { kind: "DEFAULT" }
  | { kind: "TEMPLATE" | "FINISHED"; path: string } // an image from the API (needs the login token)
  | { kind: "TEMPLATE" | "FINISHED"; uri: string }; // an image just picked on the phone (preview)

export function lookOf(certificate: Pick<CertificateSummary, "design" | "imageUrl">): CertificateLook {
  return certificate.design === "DEFAULT" || !certificate.imageUrl ? { kind: "DEFAULT" } : { kind: certificate.design, path: certificate.imageUrl };
}

// Where the app writes on a certificate, in 1600 × 1131 units: [top, height, left, right].
const TEXT_AREAS = {
  name: [440, 140, 160, 160],
  course: [646, 80, 200, 200],
  date: [840, 56, 1000, 200],
  number: [1000, 36, 200, 200],
} as const;

// The same areas in words, for the admin's template screen.
export const TEXT_AREAS_HELP =
  "The app writes the student's name across the middle (about 39–51% from the top), the course name below it (57–64%), " +
  "the date on the right (74–79%) and the certificate number at the bottom centre (88–92%). Keep those areas plain.";

export type CardStatus = "loading" | "ready" | "failed";

export function CertificateCard({
  certificate: c,
  look = { kind: "DEFAULT" },
  ref,
  onStatusChange,
}: {
  certificate: CertificateDetails;
  look?: CertificateLook;
  ref?: Ref<View>;
  onStatusChange?: (status: CardStatus) => void;
}) {
  // Until the card is measured (and in tests), assume a typical phone width.
  const [width, setWidth] = useState(340);
  const u = (n: number) => (n * width) / CERTIFICATE_WIDTH;

  const remote = usePrivateImageSource("path" in look ? look.path : null);
  const source = "uri" in look ? { uri: look.uri } : remote.source;
  const [loaded, setLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const status: CardStatus = look.kind === "DEFAULT" || loaded ? "ready" : imageFailed || remote.failed ? "failed" : "loading";

  useEffect(() => {
    setLoaded(false);
    setImageFailed(false);
  }, [source?.uri]);
  useEffect(() => onStatusChange?.(status), [status, onStatusChange]);

  const area = (name: keyof typeof TEXT_AREAS) => {
    const [top, height, left, right] = TEXT_AREAS[name];
    return { position: "absolute" as const, top: u(top), height: u(height), left: u(left), right: u(right), justifyContent: "center" as const };
  };
  const line = (size: number, style: TextStyle): TextStyle => ({ ...style, fontSize: u(size), lineHeight: u(size * 1.25), textAlign: "center" });

  return (
    // collapsable={false}: Android must keep this view so it can be captured as an image.
    <View
      ref={ref}
      collapsable={false}
      accessible={look.kind === "FINISHED"}
      accessibilityLabel={look.kind === "FINISHED" ? `Certificate of ${c.studentName}` : undefined}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={s.card}
    >
      {look.kind === "DEFAULT" && <BuiltInDesign u={u} line={line} />}
      {look.kind !== "DEFAULT" && source && (
        <Image
          testID="certificate-design-image"
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          onLoad={() => setLoaded(true)}
          onError={() => setImageFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
      {status === "failed" && (
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <Text style={s.problem}>Couldn't load the certificate design. Pull down to try again.</Text>
        </View>
      )}

      {/* A finished image already has the student's details on it. */}
      {look.kind !== "FINISHED" && (
        <>
          <View style={area("name")}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={line(96, { fontFamily: fonts.display, color: colors.navy })}>
              {c.studentName}
            </Text>
          </View>
          <View style={area("course")}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={line(50, { fontFamily: fonts.bodyBold, color: colors.text })}>
              {c.courseTitle}
            </Text>
          </View>
          <View style={area("date")}>
            <Text style={{ ...line(36, { fontFamily: fonts.bodySemi, color: colors.text }), textAlign: "right" }}>{formatDate(c.issuedAt)}</Text>
          </View>
          <View style={area("number")}>
            <Text style={line(24, { fontFamily: fonts.body, color: "#6B7380" })}>Certificate no. {c.certificateNumber}</Text>
          </View>
        </>
      )}
    </View>
  );
}

// The academy's own design: borders, badge, headings and the founder's signature.
// The student's details are added by CertificateCard in TEXT_AREAS.
function BuiltInDesign({ u, line }: { u: (n: number) => number; line: (size: number, style: TextStyle) => TextStyle }) {
  const at = (top: number, height: number, left = 160, right = 160) => ({ position: "absolute" as const, top: u(top), height: u(height), left: u(left), right: u(right) });
  const muted = { fontFamily: fonts.body, color: "#6B7380" };
  const ring = (pos: object) => (
    <View style={[{ position: "absolute", width: u(64), height: u(64), borderRadius: u(32), borderWidth: 1, borderColor: "rgba(11,42,74,0.08)" }, pos]} />
  );
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { margin: u(24), borderWidth: u(6), borderColor: colors.gold, borderRadius: u(24) }]} />
      <View style={[StyleSheet.absoluteFill, { margin: u(48), borderWidth: Math.max(1, u(2)), borderColor: "#D8B978", borderRadius: u(16) }]} />
      {ring({ top: u(60), left: u(60) })}
      {ring({ top: u(60), right: u(60) })}
      {ring({ bottom: u(60), left: u(60) })}
      {ring({ bottom: u(60), right: u(60) })}

      <View style={[{ position: "absolute", top: u(110), left: u(752), width: u(96), height: u(96), borderRadius: u(48), backgroundColor: colors.okBg }, s.center]}>
        <Icon name="star" size={u(48)} color={colors.navy} />
      </View>
      <Text style={[at(222, 40), line(30, { fontFamily: fonts.display, color: colors.gold, letterSpacing: u(4) })]}>SIRAAT TUL JANNAH</Text>
      <Text style={[at(268, 100), line(76, { fontFamily: fonts.display, color: colors.text })]}>Certificate of Completion</Text>
      <Text style={[at(392, 40), line(30, muted)]}>This certifies that</Text>
      <Text style={[at(596, 40), line(30, { fontFamily: fonts.body, color: colors.text2 })]}>has successfully completed the course</Text>

      <View style={at(840, 110, 200, 1000)}>
        <Text style={{ ...line(40, { fontFamily: fonts.display, color: colors.text }), textAlign: "left" }}>Hafiza Aqsa Jamil</Text>
        <Text style={[{ ...line(24, muted), textAlign: "left" }, { borderTopWidth: 1, borderTopColor: colors.line2, marginTop: u(6), paddingTop: u(6) }]}>
          Founder &amp; Instructor
        </Text>
      </View>
      <View style={at(902, 50, 1000, 200)}>
        <Text style={[{ ...line(24, muted), textAlign: "right" }, { borderTopWidth: 1, borderTopColor: colors.line2, paddingTop: u(6) }]}>Date Issued</Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  card: { width: "100%", aspectRatio: CERTIFICATE_WIDTH / CERTIFICATE_HEIGHT, backgroundColor: colors.white, overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  problem: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, textAlign: "center", padding: 16 },
});
