// Certificate (prototype screen 9): the certificate on screen, plus sharing
// its verification link. (The PDF download is on the website.)
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Share, Text, View } from "react-native";
import { Button, Loaded, Muted, Screen } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { formatDate } from "../../../lib/format.ts";
import { useLoad } from "../../../lib/hooks.ts";
import { colors, fonts } from "../../../lib/theme.ts";

type Verified = { certificateNumber: string; studentName: string; courseTitle: string; issuedAt: string };
const WEBSITE = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:5173";

export default function CertificateScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const state = useLoad(() => api<{ certificate: Verified }>(`/certificates/verify/${number}`), [number]);
  const verifyUrl = `${WEBSITE}/verify/${number}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Certificate" }} />
      <Loaded state={state}>
        {({ certificate: c }) => (
          <>
            <View style={{ backgroundColor: colors.ivory, borderWidth: 6, borderColor: colors.navy, padding: 20, alignItems: "center", gap: 8 }}>
              <View style={{ position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderWidth: 1, borderColor: colors.gold }} />
              <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.navy }}>Siraat tul Jannah</Text>
              <Text style={{ fontFamily: fonts.bodySemi, color: colors.gold, letterSpacing: 1, fontSize: 12 }}>CERTIFICATE OF COMPLETION</Text>
              <Muted>This certifies that</Muted>
              <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.navy, textAlign: "center" }}>{c.studentName}</Text>
              <Muted>has successfully completed the course</Muted>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.navy, textAlign: "center" }}>{c.courseTitle}</Text>
              <View style={{ flexDirection: "row", gap: 24, marginTop: 12 }}>
                <View style={{ alignItems: "center" }}><Text style={{ fontFamily: fonts.bodySemi }}>Hafiza Aqsa Jamil</Text><Muted small>Founder & Instructor</Muted></View>
                <View style={{ alignItems: "center" }}><Text style={{ fontFamily: fonts.bodySemi }}>{formatDate(c.issuedAt)}</Text><Muted small>Date issued</Muted></View>
              </View>
              <Muted small>Certificate no. {c.certificateNumber}</Muted>
            </View>
            <Button label="Share verification link" onPress={() => Share.share({ message: `My Siraat tul Jannah certificate: ${verifyUrl}` })} />
            <Button variant="outline" label="Open on the website (download PDF)" onPress={() => WebBrowser.openBrowserAsync(`${WEBSITE}/student/certificates/${number}`)} />
          </>
        )}
      </Loaded>
    </Screen>
  );
}
