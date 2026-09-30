// Live Class (prototype screen 6): open the class in the Zoom app, or use
// WhatsApp when the connection is weak.
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { Button, Card, Chip, Empty, Loaded, Muted, Notice, Screen, Title, styles } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { formatDateTime } from "../../../lib/format.ts";
import { useLoad } from "../../../lib/hooks.ts";
import type { Enrollment, Session } from "../../../lib/types.ts";

type ScheduleItem = Session & { classGroup: { id: string; name: string } };

export default function LiveClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<"zoom" | "whatsapp">("zoom");
  const state = useLoad(async () => {
    const [{ enrollments }, { sessions }] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ sessions: ScheduleItem[] }>("/enrollments/schedule"),
    ]);
    const enrollment = enrollments.find((e) => e.id === id) ?? null;
    return { enrollment, next: sessions.find((s) => s.classGroup.id === enrollment?.classGroup?.id) ?? null };
  }, [id]);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Live Class" }} />
      <Loaded state={state}>
        {({ enrollment, next }) => {
          const group = enrollment?.classGroup;
          if (!enrollment || enrollment.status !== "APPROVED" || !group) return <Empty>Live classes open once you're approved and placed in a class group.</Empty>;
          return (
            <>
              <Card>
                <Title>{group.name}</Title>
                <Muted>{group.teacherName}</Muted>
                <Muted>{next ? `Next class: ${formatDateTime(next.scheduledAt)}${next.topic ? ` — ${next.topic}` : ""}` : group.scheduleText ?? "No class scheduled yet."}</Muted>
              </Card>
              <View style={styles.row}>
                <Chip label="Zoom Class" selected={tab === "zoom"} onPress={() => setTab("zoom")} />
                <Chip label="WhatsApp Options" selected={tab === "whatsapp"} onPress={() => setTab("whatsapp")} />
              </View>
              {tab === "zoom" ? (
                <Card>
                  {group.zoomJoinUrl ? (
                    <>
                      <Button label="Join on Zoom" onPress={() => Linking.openURL(group.zoomJoinUrl!)} />
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
                      <Button label="Join Class WhatsApp Group" onPress={() => Linking.openURL(group.whatsappGroupLink!)} />
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
