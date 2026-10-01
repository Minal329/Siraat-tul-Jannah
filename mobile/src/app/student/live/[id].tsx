// Live Class (prototype screen 6): shows when the class is live (checked every
// 30 seconds) and opens it in the Zoom app — or WhatsApp when the connection is
// weak or the teacher has switched the class there.
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Card, Chip, Empty, ErrorText, Loaded, Muted, Notice, Screen, Title, styles } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { formatDateTime, formatTime } from "../../../lib/format.ts";
import { useAction, useInterval, useLoad } from "../../../lib/hooks.ts";
import { colors, fonts } from "../../../lib/theme.ts";
import type { Enrollment, LivePlatform, Session } from "../../../lib/types.ts";

type ScheduleItem = Session & { classGroup: { id: string; name: string } };
type LiveState = { session: Session | null; joinedAt: string | null };

export default function LiveClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [chosenTab, setTab] = useState<"zoom" | "whatsapp" | null>(null);
  const state = useLoad(async () => {
    const [{ enrollments }, { sessions }] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ sessions: ScheduleItem[] }>("/enrollments/schedule"),
    ]);
    const enrollment = enrollments.find((e) => e.id === id) ?? null;
    const canJoin = enrollment?.status === "APPROVED" && !!enrollment.classGroup;
    const live = canJoin ? await api<LiveState>(`/enrollments/${id}/live`) : { session: null, joinedAt: null };
    return {
      enrollment,
      live,
      next: sessions.find((s) => s.classGroup.id === enrollment?.classGroup?.id && s.status !== "LIVE") ?? null,
    };
  }, [id]);
  useInterval(state.reload, 30_000);
  const { busy, error, run } = useAction();
  const [pulling, setPulling] = useState(false); // spinner only for pull-to-refresh, not the 30-second check

  async function join(platform: LivePlatform) {
    const result = await run(() => api<{ joinUrl: string }>(`/enrollments/${id}/live/join`, { body: { platform } }));
    if (result) {
      await Linking.openURL(result.joinUrl);
      void state.reload();
    }
  }

  return (
    <Screen
      onRefresh={async () => {
        setPulling(true);
        await state.reload();
        setPulling(false);
      }}
      refreshing={pulling}
    >
      <Stack.Screen options={{ title: "Live Class" }} />
      <Loaded state={state}>
        {({ enrollment, live, next }) => {
          const group = enrollment?.classGroup;
          if (!enrollment || enrollment.status !== "APPROVED" || !group) return <Empty>Live classes open once you're approved and placed in a class group.</Empty>;
          const session = live.session;
          const platform = session?.livePlatform ?? "ZOOM";
          // Follow the teacher: if they moved the class to WhatsApp, show that tab.
          const tab = chosenTab ?? (platform === "WHATSAPP" ? "whatsapp" : "zoom");
          // While live, "Join" is recorded first (a hint for the teacher's attendance).
          const open = (p: LivePlatform, url: string) => (session ? join(p) : Linking.openURL(url));
          return (
            <>
              <Card>
                <Title>{group.name}</Title>
                <Muted>{group.teacherName}</Muted>
                {!session && <Muted>{next ? `Next class: ${formatDateTime(next.scheduledAt)}${next.topic ? ` — ${next.topic}` : ""}` : group.scheduleText ?? "No class scheduled yet."}</Muted>}
              </Card>

              {session && (
                <Card style={{ borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.dangerBg }}>
                  <Text style={{ fontFamily: fonts.bodyBold, color: colors.danger, fontSize: 16 }}>● Your class is live{session.topic ? ` — ${session.topic}` : ""}</Text>
                  <Muted>
                    Started {session.startedAt ? formatTime(session.startedAt) : "just now"} on {platform === "ZOOM" ? "Zoom" : "WhatsApp"}
                    {live.joinedAt ? ` · you joined at ${formatTime(live.joinedAt)}` : ""}
                  </Muted>
                  {session.liveNote && <View style={styles.quote}><Muted>{session.liveNote}</Muted></View>}
                  {(platform === "ZOOM" ? group.zoomJoinUrl : group.whatsappGroupLink) ? (
                    <Button label={busy ? "Opening…" : platform === "ZOOM" ? "Join now on Zoom" : "Join now on WhatsApp"} onPress={() => join(platform)} disabled={busy} />
                  ) : (
                    <Muted>Your teacher hasn't added a {platform === "ZOOM" ? "Zoom meeting" : "WhatsApp group"} link for this class yet — please message them.</Muted>
                  )}
                </Card>
              )}
              <ErrorText error={error} />

              <View style={styles.row}>
                <Chip label="Zoom Class" selected={tab === "zoom"} onPress={() => setTab("zoom")} />
                <Chip label="WhatsApp Options" selected={tab === "whatsapp"} onPress={() => setTab("whatsapp")} />
              </View>
              {tab === "zoom" ? (
                <Card>
                  {group.zoomJoinUrl ? (
                    <>
                      <Button label="Join on Zoom" onPress={() => open("ZOOM", group.zoomJoinUrl!)} disabled={busy} />
                      <Muted>Meeting ID: {group.zoomMeetingId}{group.zoomPasscode ? ` · Passcode: ${group.zoomPasscode}` : ""}</Muted>
                    </>
                  ) : (
                    <Muted>Your teacher hasn't added a Zoom meeting yet.</Muted>
                  )}
                  <Button variant="outline" label="Low bandwidth? Use WhatsApp instead" onPress={() => setTab("whatsapp")} />
                </Card>
              ) : (
                <Card>
                  {group.whatsappGroupLink ? (
                    <>
                      <Button label="Join Class WhatsApp Group" onPress={() => open("WHATSAPP", group.whatsappGroupLink!)} disabled={busy} />
                      <Notice>To join a group voice or video call, open the group in WhatsApp and tap the call icon when your teacher starts it.</Notice>
                    </>
                  ) : (
                    <Muted>Your teacher hasn't added a WhatsApp group yet.</Muted>
                  )}
                </Card>
              )}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
