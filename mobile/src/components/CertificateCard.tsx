// The certificate of completion, drawn like the prototype's Certificate screen.
// The app turns this view into a PNG (lib/saveImage.ts) — there is no PDF and no
// website: what's on screen is exactly what gets saved or shared.
import type { Ref } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatDate } from "../lib/format.ts";
import { colors, fonts } from "../lib/theme.ts";
import { Icon } from "./Icon.tsx";

export type CertificateDetails = {
  studentName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: string;
};

export function CertificateCard({ certificate: c, ref }: { certificate: CertificateDetails; ref?: Ref<View> }) {
  return (
    // collapsable={false}: Android must keep this view so it can be captured as an image.
    <View ref={ref} collapsable={false} style={s.outer}>
      <View style={s.inner}>
        {/* faint corner rings */}
        {[s.ringTL, s.ringTR, s.ringBL, s.ringBR].map((pos, i) => (
          <View key={i} style={[s.ring, pos]} />
        ))}
        <View style={s.badge}>
          <Icon name="star" size={22} color={colors.navy} />
        </View>
        <Text style={s.academy}>SIRAAT TUL JANNAH</Text>
        <Text style={s.heading}>Certificate of Completion</Text>
        <Text style={[s.small, { marginTop: 6 }]}>This certifies that</Text>
        <Text style={s.name}>{c.studentName}</Text>
        <Text style={s.body}>has successfully completed the course</Text>
        <Text style={s.course}>{c.courseTitle}</Text>

        <View style={s.signatures}>
          <View>
            <Text style={s.signName}>Hafiza Aqsa Jamil</Text>
            <Text style={s.signLabel}>Founder &amp; Instructor</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.date}>{formatDate(c.issuedAt)}</Text>
            <Text style={[s.signLabel, { textAlign: "right" }]}>Date Issued</Text>
          </View>
        </View>
        <Text style={s.number}>Certificate no. {c.certificateNumber}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  outer: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 2, borderColor: colors.gold, padding: 4 },
  inner: { borderWidth: 1, borderColor: "#D8B978", borderRadius: 12, paddingVertical: 26, paddingHorizontal: 20, alignItems: "center", gap: 8, overflow: "hidden" },
  ring: { position: "absolute", width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(11,42,74,0.08)" },
  ringTL: { top: 4, left: 4 },
  ringTR: { top: 4, right: 4 },
  ringBL: { bottom: 4, left: 4 },
  ringBR: { bottom: 4, right: 4 },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.okBg, alignItems: "center", justifyContent: "center" },
  academy: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.gold },
  heading: { fontFamily: fonts.display, fontSize: 21, color: colors.text, textAlign: "center" },
  small: { fontFamily: fonts.body, fontSize: 11, color: "#6B7380" },
  name: { fontFamily: fonts.display, fontSize: 24, color: colors.navy, textAlign: "center", lineHeight: 32 },
  body: { fontFamily: fonts.body, fontSize: 12, color: colors.text2 },
  course: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, textAlign: "center" },
  signatures: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginTop: 18 },
  signName: { fontFamily: fonts.display, fontSize: 14, color: colors.text },
  signLabel: { fontFamily: fonts.body, fontSize: 9, color: "#6B7380", borderTopWidth: 1, borderTopColor: colors.line2, marginTop: 3, paddingTop: 3 },
  date: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  number: { fontFamily: fonts.body, fontSize: 9, color: "#6B7380", marginTop: 10 },
});
