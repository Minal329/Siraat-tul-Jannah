// Enroll & Payment (prototype screen 5): pick the payment screenshot from the
// photo gallery, add the transaction ID, and submit for verification.
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Button, Card, Chip, Empty, ErrorText, Field, Loaded, Muted, Notice, Screen, Title, styles } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { formatPkr, METHOD_LABELS } from "../../../lib/format.ts";
import { useAction, useLoad } from "../../../lib/hooks.ts";
import { colors, fonts } from "../../../lib/theme.ts";
import type { Enrollment, Payment, PaymentAccount } from "../../../lib/types.ts";

export default function PayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(async () => {
    const [{ enrollments }, { accounts }] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ accounts: PaymentAccount[] }>("/payment-accounts"),
    ]);
    return { enrollment: enrollments.find((e) => e.id === id) ?? null, accounts };
  }, [id]);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Enroll in Course" }} />
      <Loaded state={state}>
        {({ enrollment, accounts }) => (enrollment ? <PaymentForm enrollment={enrollment} accounts={accounts} /> : <Empty>Enrollment not found.</Empty>)}
      </Loaded>
    </Screen>
  );
}

function PaymentForm({ enrollment, accounts }: { enrollment: Enrollment; accounts: PaymentAccount[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState(String(enrollment.course.feePkr));
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();
  const account = accounts.find((a) => a.id === accountId);
  const waiting = enrollment.payments.some((p) => p.status === "PENDING");
  const lastRejected = enrollment.payments[0]?.status === "REJECTED" ? enrollment.payments[0] : null;

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  async function submit() {
    if (!account) return setError("Choose how you paid.");
    if (!photo) return setError("Please attach a screenshot of your payment.");
    const form = new FormData();
    form.append("method", account.method);
    form.append("amountPkr", amount);
    if (transactionId.trim()) form.append("transactionId", transactionId.trim());
    const type = photo.mimeType ?? "image/jpeg";
    const name = photo.fileName ?? `payment.${type.split("/")[1] ?? "jpg"}`;
    if (Platform.OS === "web") {
      form.append("proof", await (await fetch(photo.uri)).blob(), name);
    } else {
      // React Native's FormData accepts a file described by its uri.
      form.append("proof", { uri: photo.uri, name, type } as unknown as Blob);
    }
    const result = await run(() => api<{ payment: Payment }>(`/enrollments/${enrollment.id}/payments`, { form }));
    if (result) setDone(true);
  }

  if (done || waiting) {
    return (
      <Card>
        <Title>Submitted for Verification</Title>
        <Muted>The academy will verify your payment for {enrollment.course.title} and assign you to a class group.</Muted>
        <Button label="Go to my dashboard" onPress={() => router.replace("/student")} />
      </Card>
    );
  }

  return (
    <Card>
      <Title>{enrollment.course.title}</Title>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 22, color: colors.navy }}>{formatPkr(enrollment.course.feePkr)}</Text>
      {lastRejected && <Notice tone="warn">Your last payment wasn't accepted: {lastRejected.reviewNote}</Notice>}

      {accounts.length === 0 ? (
        <Notice tone="warn">The academy hasn't added payment accounts yet. Please contact the admin.</Notice>
      ) : (
        <>
          <Muted>Pay via</Muted>
          <View style={styles.row}>
            {accounts.map((a) => <Chip key={a.id} label={METHOD_LABELS[a.method]} selected={a.id === accountId} onPress={() => setAccountId(a.id)} />)}
          </View>
          {account && (
            <View style={styles.quote}>
              <Muted>Send payment to</Muted>
              <Text selectable style={{ fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy }}>{account.accountNumber}</Text>
              <Muted small>Account title: {account.accountTitle}</Muted>
            </View>
          )}
        </>
      )}

      <Button variant="outline" label={photo ? "Change screenshot" : "Choose payment screenshot"} onPress={pickPhoto} />
      {photo && <Image source={{ uri: photo.uri }} style={{ height: 180, borderRadius: 12 }} contentFit="contain" accessibilityLabel="Selected payment screenshot" />}
      <Field label="Transaction ID" placeholder="e.g. 8842190231" value={transactionId} onChangeText={setTransactionId} />
      <Field label="Amount paid (PKR)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
      <ErrorText error={error} />
      <Button label={busy ? "Uploading…" : "Submit for Verification"} onPress={submit} disabled={busy || accounts.length === 0} />
    </Card>
  );
}
