// Admin Dashboard (prototype screen 8, "Admin — Enrollments"): applications
// waiting for a decision. For each one the admin checks the payment screenshot,
// picks a class group, and taps Approve & Assign (which also marks the payment
// as verified) or Reject (with a reason the student sees). The gear opens the
// payment account numbers students pay to.
import { Stack } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountButton } from "../../components/AccountMenu.tsx";
import { Icon } from "../../components/Icon.tsx";
import { PrivateImage } from "../../components/PrivateImage.tsx";
import { Button, Chip, Empty, ErrorText, Field, Loaded, Muted, Screen, SectionTitle, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatPkr, initials, METHOD_LABELS } from "../../lib/format.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { AdminClassGroup, AdminEnrollment, PaymentAccount, PaymentMethod } from "../../lib/types.ts";

type Outcome = { enrollment: AdminEnrollment; result: "approved" | "rejected"; detail: string };
const AVATAR_COLORS = [colors.navy, colors.navy2, colors.gold];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AdminHome() {
  const state = useLoad(async () => {
    const [pending, approved, groups] = await Promise.all([
      api<{ enrollments: AdminEnrollment[] }>("/admin/enrollments?status=PENDING"),
      api<{ enrollments: AdminEnrollment[] }>("/admin/enrollments?status=APPROVED"),
      api<{ classGroups: AdminClassGroup[] }>("/admin/class-groups"),
    ]);
    const today = startOfToday();
    return {
      pending: pending.enrollments,
      approvedToday: approved.enrollments.filter((e) => e.approvedAt && new Date(e.approvedAt).getTime() >= today).length,
      groups: groups.classGroups.filter((g) => g.isActive),
    };
  }, []);
  // Cards the admin just handled stay on screen (as in the prototype) until the next visit.
  const [done, setDone] = useState<Outcome[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const finish = (outcome: Outcome) => {
    setDone((list) => [outcome, ...list]);
    void state.reload();
  };

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Admin — Enrollments", headerRight: () => <AccountButton /> }} />

      <View style={s.band}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={s.bandText}>Verify payments &amp; assign groups</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Payment settings" onPress={() => setSettingsOpen(true)} style={s.gear}>
            <Icon name="gear" size={17} color={colors.ivory} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat value={state.data ? String(state.data.pending.length) : "–"} label="Pending" />
          <Stat value={state.data ? String(state.data.approvedToday) : "–"} label="Approved Today" />
        </View>
      </View>

      <Loaded state={state}>
        {({ pending, groups }) => (
          <>
            {pending.length === 0 && <Empty>No applications waiting. Well done!</Empty>}
            {pending.map((e, i) => (
              <RequestCard
                key={e.id}
                enrollment={e}
                avatarColor={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                groups={groups.filter((g) => g.course.id === e.course.id)}
                onDone={finish}
              />
            ))}
            {done.length > 0 && <SectionTitle>Done just now</SectionTitle>}
            {done.map((o) => (
              <View key={o.enrollment.id} style={styles.card}>
                <Text style={s.name}>{o.enrollment.student.fullName}</Text>
                <Muted small>{o.enrollment.course.title}</Muted>
                <Text style={[s.outcome, { color: o.result === "approved" ? colors.navy : colors.danger }]}>
                  {o.result === "approved" ? `✓ Assigned to ${o.detail}` : `✕ ${o.detail}`}
                </Text>
              </View>
            ))}
          </>
        )}
      </Loaded>

      <PaymentSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── One application ───────────────────────────────────────────────

function paymentPill(e: AdminEnrollment) {
  const p = e.payments[0];
  if (!p) return { label: "No payment", bg: colors.ivory2, fg: colors.muted };
  if (p.status === "VERIFIED") return { label: "Paid ✓", bg: colors.okBg, fg: colors.navy };
  if (p.status === "REJECTED") return { label: "Payment rejected", bg: "#FBE7E2", fg: colors.danger };
  return { label: "Pending", bg: colors.warnBg, fg: colors.goldDark };
}

function RequestCard({ enrollment: e, avatarColor, groups, onDone }: {
  enrollment: AdminEnrollment;
  avatarColor: string;
  groups: AdminClassGroup[];
  onDone: (outcome: Outcome) => void;
}) {
  const payment = e.payments[0] ?? null;
  const [groupId, setGroupId] = useState(groups[0]?.id ?? null);
  const [withoutPayment, setWithoutPayment] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const { busy, error, setError, run } = useAction();
  const pill = paymentPill(e);
  const paid = payment?.status === "PENDING" || payment?.status === "VERIFIED";
  const group = groups.find((g) => g.id === groupId) ?? null;

  async function approve() {
    if (!group) return setError("Choose a class group first.");
    const ok = await run(async () => {
      // The admin has looked at the screenshot: confirm the payment, then place the student.
      if (payment?.status === "PENDING") await api(`/admin/payments/${payment.id}/verify`, { body: {} });
      await api(`/admin/enrollments/${e.id}/approve`, { body: { classGroupId: group.id, approveWithoutPayment: !paid || undefined } });
      return true;
    });
    if (ok) onDone({ enrollment: e, result: "approved", detail: group.name });
  }

  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={[s.avatar, { backgroundColor: avatarColor }]}>
          <Text style={s.avatarText}>{initials(e.student.fullName)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name}>{e.student.fullName}</Text>
          <Text style={s.meta}>
            {e.course.title}
            {payment ? ` · ${METHOD_LABELS[payment.method]} · ${formatPkr(payment.amountPkr)}` : ` · Fee ${formatPkr(e.course.feePkr)}`}
          </Text>
        </View>
        <Text style={[s.pill, { backgroundColor: pill.bg, color: pill.fg }]}>{pill.label}</Text>
      </View>

      {payment ? (
        <Pressable accessibilityRole="button" onPress={() => setViewing(true)} style={s.proofRow}>
          <View style={s.proofIcon}>
            <Icon name="folder" size={15} color={colors.text2} />
          </View>
          <Text style={s.proofText}>Payment screenshot{payment.transactionId ? ` · Txn ${payment.transactionId}` : ""}</Text>
        </Pressable>
      ) : (
        <Muted small>No payment screenshot uploaded yet.</Muted>
      )}
      {payment?.status === "REJECTED" && payment.reviewNote && <Muted small>Rejected: {payment.reviewNote} — waiting for a new screenshot.</Muted>}

      <View style={{ gap: 8 }}>
        <Text style={s.label}>Assign to group</Text>
        {groups.length === 0 ? (
          <Muted small>No active class group for {e.course.title} yet — create one first.</Muted>
        ) : (
          <View style={styles.row}>
            {groups.map((g) => (
              <Chip
                key={g.id}
                label={`${g.name} (${g.studentCount}${g.maxStudents ? `/${g.maxStudents}` : ""})`}
                selected={g.id === groupId}
                onPress={() => setGroupId(g.id)}
              />
            ))}
          </View>
        )}
      </View>

      {!paid && (
        <Chip label="Approve without payment (scholarship / cash)" selected={withoutPayment} onPress={() => setWithoutPayment(!withoutPayment)} />
      )}
      <ErrorText error={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label={busy ? "Saving…" : "Approve & Assign"} onPress={approve} disabled={busy || !group || (!paid && !withoutPayment)} />
        </View>
        <Button variant="danger" label="Reject" onPress={() => setRejecting(true)} disabled={busy} />
      </View>

      {payment && (
        <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
          <View style={s.viewer}>
            <PrivateImage path={payment.proofUrl} label={`Payment screenshot from ${e.student.fullName}`} style={{ width: "100%", height: "80%" }} />
            <Button variant="outline" label="Close" onPress={() => setViewing(false)} />
          </View>
        </Modal>
      )}
      <RejectSheet
        visible={rejecting}
        enrollment={e}
        onClose={() => setRejecting(false)}
        onRejected={(detail) => {
          setRejecting(false);
          onDone({ enrollment: e, result: "rejected", detail });
        }}
      />
    </View>
  );
}

// ── Rejecting, with a reason the student sees ─────────────────────

const QUICK_REASONS = ["The amount doesn't match the fee.", "The screenshot is unclear — please upload it again.", "We couldn't find this transaction."];

function RejectSheet({ visible, enrollment: e, onClose, onRejected }: {
  visible: boolean;
  enrollment: AdminEnrollment;
  onClose: () => void;
  onRejected: (detail: string) => void;
}) {
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useAction();
  const payment = e.payments[0];
  // A pending screenshot is rejected on its own, so the student can upload a new one.
  // With nothing to check, the application itself is rejected.
  const rejectsPayment = payment?.status === "PENDING";

  async function submit() {
    if (reason.trim().length < 3) return setError("Write a short reason for the student.");
    const ok = await run(async () => {
      if (rejectsPayment) await api(`/admin/payments/${payment.id}/reject`, { body: { note: reason.trim() } });
      else await api(`/admin/enrollments/${e.id}/reject`, { body: { reason: reason.trim() } });
      return true;
    });
    if (ok) onRejected(rejectsPayment ? "Payment rejected" : "Application rejected");
  }

  return (
    <Sheet visible={visible} title={rejectsPayment ? "Reject this payment?" : "Reject this application?"} onClose={onClose}>
      <Muted small>
        {rejectsPayment
          ? `${e.student.fullName} will see your reason and can upload a new screenshot.`
          : `${e.student.fullName}'s application for ${e.course.title} will be closed. They will see your reason.`}
      </Muted>
      <View style={{ gap: 6 }}>
        {QUICK_REASONS.map((r) => (
          <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      <Field label="Reason" placeholder="Or write your own…" value={reason} onChangeText={setReason} multiline />
      <ErrorText error={error} />
      <Button variant="danger" large label={busy ? "Rejecting…" : rejectsPayment ? "Reject payment" : "Reject application"} onPress={submit} disabled={busy} />
    </Sheet>
  );
}

// ── Payment account numbers (the gear) ───────────────────────────

function PaymentSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const state = useLoad(() => api<{ accounts: PaymentAccount[] }>("/admin/payment-accounts"), [visible]);
  return (
    <Sheet visible={visible} title="Payment Account Settings" onClose={onClose}>
      <Muted small>Students see these numbers on the Enroll &amp; Payment screen. Leave a number empty to hide that option.</Muted>
      {visible && <Loaded state={state}>{({ accounts }) => <PaymentSettingsForm accounts={accounts} onSaved={onClose} />}</Loaded>}
    </Sheet>
  );
}

const SHEET_METHODS: PaymentMethod[] = ["EASYPAISA", "JAZZCASH"];

function PaymentSettingsForm({ accounts, onSaved }: { accounts: PaymentAccount[]; onSaved: () => void }) {
  const current = (method: PaymentMethod) => accounts.find((a) => a.method === method);
  const activeNumber = (method: PaymentMethod) => (current(method)?.isActive === false ? "" : current(method)?.accountNumber ?? "");
  const [numbers, setNumbers] = useState<Record<string, string>>({ EASYPAISA: activeNumber("EASYPAISA"), JAZZCASH: activeNumber("JAZZCASH") });
  const [title, setTitle] = useState(accounts.find((a) => SHEET_METHODS.includes(a.method))?.accountTitle ?? "");
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();

  async function save() {
    if (title.trim().length < 2) return setError("Enter the name on the account.");
    const ok = await run(async () => {
      for (const method of SHEET_METHODS) {
        const number = numbers[method].trim();
        const existing = current(method);
        if (existing) {
          await api(`/admin/payment-accounts/${existing.id}`, {
            method: "PATCH",
            body: number ? { accountNumber: number, accountTitle: title.trim(), isActive: true } : { isActive: false },
          });
        } else if (number) {
          await api("/admin/payment-accounts", { body: { method, accountNumber: number, accountTitle: title.trim() } });
        }
      }
      return true;
    });
    if (ok) {
      setSaved(true);
      setTimeout(onSaved, 700);
    }
  }

  return (
    <>
      <Field label="Easypaisa account number" placeholder="0300-1234567" keyboardType="phone-pad" value={numbers.EASYPAISA} onChangeText={(v) => setNumbers({ ...numbers, EASYPAISA: v })} />
      <Field label="JazzCash account number" placeholder="0301-7654321" keyboardType="phone-pad" value={numbers.JAZZCASH} onChangeText={(v) => setNumbers({ ...numbers, JAZZCASH: v })} />
      <Field label="Account title" placeholder="Siraat tul Jannah Academy" value={title} onChangeText={setTitle} />
      <ErrorText error={error} />
      <Button large label={saved ? "Saved ✓" : busy ? "Saving…" : "Save Payment Details"} onPress={save} disabled={busy || saved} />
    </>
  );
}

// ── A sheet that slides up from the bottom ────────────────────────

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.close}>
              <Icon name="close" size={14} color={colors.text2} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  band: { backgroundColor: colors.navy, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 18, gap: 14 },
  bandText: { fontFamily: fonts.body, fontSize: 12, color: "rgba(247,243,236,0.78)" },
  gear: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  statValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ivory },
  statLabel: { fontFamily: fonts.body, fontSize: 10, color: "rgba(247,243,236,0.75)" },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  pill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyBold, fontSize: 10 },
  proofRow: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.ivory, borderRadius: 10, padding: 8, minHeight: 44 },
  proofIcon: { width: 34, height: 34, borderRadius: 7, backgroundColor: colors.line, alignItems: "center", justifyContent: "center" },
  proofText: { fontFamily: fonts.body, fontSize: 12, color: colors.text2, flex: 1 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text2 },
  outcome: { fontFamily: fonts.bodySemi, fontSize: 13 },
  viewer: { flex: 1, backgroundColor: "rgba(10,20,35,0.92)", padding: 16, paddingTop: 48, gap: 12, justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(28,38,32,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, gap: 14, maxHeight: "88%" },
  sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ivory2, alignItems: "center", justifyContent: "center" },
});
