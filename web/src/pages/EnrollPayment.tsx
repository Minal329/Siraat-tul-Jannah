// Enroll & Payment (prototype screen 5): pay by Easypaisa/JazzCash, upload the
// screenshot and transaction ID, and wait for the academy to verify it.
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { Empty, ErrorMessage, Loaded } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatPkr, METHOD_LABELS } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";
import type { Enrollment, Payment, PaymentAccount } from "../lib/types.ts";

export function EnrollPaymentPage() {
  const { enrollmentId } = useParams();
  const state = useLoad(
    async () => {
      const [{ enrollments }, { accounts }] = await Promise.all([
        api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
        api<{ accounts: PaymentAccount[] }>("/payment-accounts"),
      ]);
      return { enrollment: enrollments.find((e) => e.id === enrollmentId) ?? null, accounts };
    },
    [enrollmentId],
  );

  return (
    <Layout subtitle="Enroll in Course">
      <Loaded state={state}>
        {({ enrollment, accounts }) =>
          enrollment ? <PaymentForm enrollment={enrollment} accounts={accounts} /> : <Empty>Enrollment not found.</Empty>
        }
      </Loaded>
    </Layout>
  );
}

function PaymentForm({ enrollment, accounts }: { enrollment: Enrollment; accounts: PaymentAccount[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState(String(enrollment.course.feePkr));
  const [submitted, setSubmitted] = useState<Payment | null>(null);
  const { busy, error, setError, run } = useAction();
  const account = accounts.find((a) => a.id === accountId);
  const waiting = enrollment.payments.find((p) => p.status === "PENDING");
  const lastRejected = enrollment.payments[0]?.status === "REJECTED" ? enrollment.payments[0] : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!account) return setError("Choose how you paid.");
    if (!file) return setError("Please attach a screenshot of your payment.");
    const form = new FormData();
    form.set("method", account.method);
    form.set("amountPkr", amount);
    if (transactionId.trim()) form.set("transactionId", transactionId.trim());
    form.set("proof", file);
    const result = await run(() => api<{ payment: Payment }>(`/enrollments/${enrollment.id}/payments`, { form }));
    if (result) setSubmitted(result.payment);
  }

  if (submitted || waiting) {
    return (
      <div className="card" style={{ maxWidth: 560, alignSelf: "center", textAlign: "center" }}>
        <h1 className="card-title">Submitted for Verification</h1>
        <p className="muted" style={{ margin: 0 }}>
          The academy will verify your payment for <strong>{enrollment.course.title}</strong> and assign you to a class group. You'll see it on your dashboard once approved.
        </p>
        <Link to="/student" className="btn">Go to my dashboard</Link>
      </div>
    );
  }

  if (enrollment.status !== "PENDING" && enrollment.status !== "APPROVED") {
    return <Empty>This enrollment is closed, so no payment is needed.</Empty>;
  }

  return (
    <form className="card" style={{ maxWidth: 560, width: "100%", alignSelf: "center" }} onSubmit={submit}>
      <div>
        <h1 className="card-title">{enrollment.course.title}</h1>
        <div className="stat-value" style={{ marginTop: 4 }}>{formatPkr(enrollment.course.feePkr)}</div>
      </div>

      {lastRejected && (
        <div className="alert alert-warn">
          Your last payment wasn't accepted: {lastRejected.reviewNote}. Please check and upload again.
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="alert alert-warn">The academy hasn't added payment accounts yet. Please contact the admin.</div>
      ) : (
        <>
          <div className="field">
            <span className="label">Pay via</span>
            <div className="tabs" role="tablist">
              {accounts.map((a) => (
                <button key={a.id} type="button" role="tab" className="tab" aria-selected={a.id === accountId} onClick={() => setAccountId(a.id)}>
                  {METHOD_LABELS[a.method]}
                </button>
              ))}
            </div>
          </div>
          {account && (
            <div className="quote" style={{ fontSize: 14 }}>
              Send payment to <strong style={{ fontSize: 18, color: "var(--navy)" }}>{account.accountNumber}</strong>
              <br />
              Account title: {account.accountTitle}
              {account.instructions && <><br />{account.instructions}</>}
            </div>
          )}
        </>
      )}

      <div className="field">
        <label htmlFor="proof">Screenshot of the transfer</label>
        <input id="proof" className="input" type="file" accept="image/png,image/jpeg,image/webp" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label htmlFor="tid">Transaction ID</label>
        <input id="tid" className="input" placeholder="e.g. 8842190231" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="amount">Amount paid (PKR)</label>
        <input id="amount" className="input" type="number" min={1} step={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>

      <ErrorMessage error={error} />
      <button className="btn btn-block" disabled={busy || accounts.length === 0}>
        {busy ? "Uploading…" : "Submit for Verification"}
      </button>
    </form>
  );
}
