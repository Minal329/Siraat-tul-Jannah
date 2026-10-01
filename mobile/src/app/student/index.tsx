// Student Dashboard (prototype screen 3): stats, my courses, attendance,
// latest feedback, next class and what to do next.
import { router, Stack } from "expo-router";
import { Text, View } from "react-native";
import { AccountButton } from "../../components/AccountMenu.tsx";
import { Button, Card, Empty, Greeting, Loaded, Muted, Notice, Screen, SectionTitle, StatusPill, Title, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatDateTime, greetingName } from "../../lib/format.ts";
import { useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { AttendanceSummary, Enrollment, Feedback, Session } from "../../lib/types.ts";
import { useAuth } from "../../lib/useAuth.ts";

type ScheduleItem = Session & { classGroup: { id: string; name: string }; courseTitle: string };

export default function StudentHome() {
  const { user } = useAuth();
  const state = useLoad(async () => {
    const [{ enrollments }, { sessions }, feedback] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ sessions: ScheduleItem[] }>("/enrollments/schedule"),
      api<{ feedback: Feedback[]; unreadCount: number }>("/feedback/mine"),
    ]);
    const shown = enrollments.filter((e) => e.status !== "CANCELLED");
    const attendance = Object.fromEntries(
      await Promise.all(
        shown.filter((e) => e.classGroup).map(async (e) => [e.id, (await api<{ summary: AttendanceSummary }>(`/enrollments/${e.id}/attendance`)).summary] as const),
      ),
    );
    return { enrollments: shown, sessions, feedback, attendance };
  }, []);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "My Dashboard", headerRight: () => <AccountButton /> }} />
      <Greeting title={`Assalamu Alaikum, ${greetingName(user?.profile?.fullName)}`} text="Here is how your learning is going" />
      <Loaded state={state}>
        {({ enrollments, sessions, feedback, attendance }) => {
          const rates = Object.values(attendance).map((a) => a.attendanceRate).filter((r): r is number => r !== null);
          const average = rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : null;
          return (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Stat value={String(enrollments.length)} label="Enrolled" />
                <Stat value={average === null ? "—" : `${average}%`} label="Attendance" />
                <Stat value={String(enrollments.filter((e) => e.certificate).length)} label="Certificates" />
              </View>

              <View style={styles.row}>
                <Button small variant="outline" label="Courses" onPress={() => router.push("/courses")} />
                <Button small variant="outline" label="Recordings" onPress={() => router.push("/student/lectures")} />
                <Button small variant="outline" label={feedback.unreadCount ? `Feedback (${feedback.unreadCount} new)` : "Feedback"} onPress={() => router.push("/student/feedback")} />
              </View>

              <SectionTitle>My Courses</SectionTitle>
              {enrollments.length === 0 && <Empty>You haven't enrolled in a course yet.</Empty>}
              {enrollments.map((e) => (
                <CourseCard
                  key={e.id}
                  e={e}
                  summary={attendance[e.id]}
                  nextClass={sessions.find((s) => s.classGroup.id === e.classGroup?.id)}
                  latest={feedback.feedback.find((f) => f.enrollmentId === e.id)}
                />
              ))}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={[styles.card, { flex: 1, alignItems: "center", padding: 10, gap: 2 }]}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy }}>{value}</Text>
      <Muted small>{label}</Muted>
    </View>
  );
}

function CourseCard({ e, summary, nextClass, latest }: { e: Enrollment; summary?: AttendanceSummary; nextClass?: ScheduleItem; latest?: Feedback }) {
  const payment = e.payments[0];
  const rate = summary?.attendanceRate ?? null;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title>{e.course.title}</Title>
          <Muted>{e.classGroup ? `${e.classGroup.teacherName ?? "Teacher to be assigned"} · ${e.classGroup.name}` : "Class group not assigned yet"}</Muted>
        </View>
        <StatusPill status={e.status} />
      </View>

      {summary && (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Muted small>Attendance</Muted>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text }}>{rate === null ? "No classes yet" : `${rate}%`}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.ivory2, overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: rate ?? 0 }}>
            <View style={{ height: 8, width: `${rate ?? 0}%`, backgroundColor: colors.navy, borderRadius: 999 }} />
          </View>
        </View>
      )}

      {latest && (
        <View style={styles.quote}>
          <Text style={{ fontFamily: fonts.body, color: colors.text2, fontSize: 13 }}>“{latest.text ?? "Voice note from your teacher"}”</Text>
          <Muted small>— {latest.teacherName}</Muted>
        </View>
      )}

      {e.status === "PENDING" &&
        (payment?.status === "PENDING" ? (
          <Notice>Payment received — the academy is checking it.</Notice>
        ) : payment?.status === "VERIFIED" ? (
          <Notice>Payment verified — you'll be placed in a class group soon.</Notice>
        ) : (
          <>
            {payment?.status === "REJECTED" && <Notice tone="warn">Payment not accepted: {payment.reviewNote}</Notice>}
            <Button label={payment?.status === "REJECTED" ? "Upload payment again" : "Pay & upload screenshot"} onPress={() => router.push(`/student/pay/${e.id}`)} />
          </>
        ))}
      {e.status === "REJECTED" && <Notice tone="error">Not approved: {e.rejectionReason}</Notice>}

      {e.status === "APPROVED" && (
        <>
          {nextClass?.status === "LIVE" ? (
            <Text style={{ fontFamily: fonts.bodyBold, color: colors.danger }}>● Live now</Text>
          ) : (
            <Muted small>Next class: {nextClass ? formatDateTime(nextClass.scheduledAt) : e.classGroup?.scheduleText ?? "to be announced"}</Muted>
          )}
          <Button label={nextClass?.status === "LIVE" ? "Join Live Class now" : "Join Live Class"} onPress={() => router.push(`/student/live/${e.id}`)} />
        </>
      )}
      {e.certificate && <Button variant="gold" label="View Certificate" onPress={() => router.push(`/student/certificate/${e.certificate!.certificateNumber}`)} />}
    </Card>
  );
}
