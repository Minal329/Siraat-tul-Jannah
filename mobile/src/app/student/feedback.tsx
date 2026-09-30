// Feedback from teachers — written notes and voice notes.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Empty, Loaded, Muted, Screen, Title, styles } from "../../components/ui.tsx";
import { api, authHeaders, fileUrl } from "../../lib/api.ts";
import { formatDateTime } from "../../lib/format.ts";
import { useLoad } from "../../lib/hooks.ts";
import { colors } from "../../lib/theme.ts";
import type { Feedback } from "../../lib/types.ts";

export default function FeedbackScreen() {
  const state = useLoad(() => api<{ feedback: Feedback[]; unreadCount: number }>("/feedback/mine"), []);

  async function markRead(id: string) {
    await api(`/feedback/${id}/read`, { method: "POST" });
    void state.reload();
  }

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Feedback" }} />
      <Loaded state={state}>
        {({ feedback }) => (
          <>
            {feedback.length === 0 && <Empty>No feedback yet.</Empty>}
            {feedback.map((f) => (
              <Card key={f.id} style={f.readAt ? undefined : { borderColor: colors.gold }}>
                <Title>{f.teacherName}</Title>
                <Muted small>{[f.courseTitle, formatDateTime(f.sentAt)].filter(Boolean).join(" · ")}</Muted>
                {f.text && <View style={styles.quote}><Muted>{f.text}</Muted></View>}
                {f.voiceUrl && <VoiceNote path={f.voiceUrl} />}
                {!f.readAt && <Button small variant="outline" label="Mark as read" onPress={() => markRead(f.id)} />}
              </Card>
            ))}
          </>
        )}
      </Loaded>
    </Screen>
  );
}

// Voice notes are private, so the player sends the login token with the request.
function VoiceNote({ path }: { path: string }) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    authHeaders().then(setHeaders);
  }, []);
  if (!headers) return <Muted small>Loading voice note…</Muted>;
  return <Player uri={fileUrl(path)} headers={headers} />;
}

function Player({ uri, headers }: { uri: string; headers: Record<string, string> }) {
  const player = useAudioPlayer({ uri, headers });
  const status = useAudioPlayerStatus(player);
  const seconds = Math.round(status.duration || 0);
  return (
    <View style={styles.row}>
      <Button
        small
        label={status.playing ? "Pause" : "Play voice note"}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) void player.seekTo(0);
            player.play();
          }
        }}
      />
      {seconds > 0 && <Muted small>{Math.round(status.currentTime)}s / {seconds}s</Muted>}
    </View>
  );
}
