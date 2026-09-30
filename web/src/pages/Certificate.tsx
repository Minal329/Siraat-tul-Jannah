// Certificate View (prototype screen 9) and the public "verify a certificate" page.
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { ErrorMessage, Loaded } from "../components/ui.tsx";
import { api, apiFile } from "../lib/api.ts";
import { formatDate } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";

type VerifiedCertificate = { certificateNumber: string; studentName: string; courseTitle: string; issuedAt: string };

function CertificateCard({ c }: { c: VerifiedCertificate }) {
  return (
    <div className="certificate" aria-label="Certificate of completion">
      <img src="/favicon.svg" alt="" width={64} height={64} />
      <div className="cert-title">Siraat tul Jannah</div>
      <div className="cert-kicker">CERTIFICATE OF COMPLETION</div>
      <div className="muted">This certifies that</div>
      <div className="cert-name">{c.studentName}</div>
      <div className="muted">has successfully completed the course</div>
      <div className="cert-course">{c.courseTitle}</div>
      <div className="row" style={{ gap: 32, marginTop: 16, justifyContent: "center" }}>
        <div><strong>Hafiza Aqsa Jamil</strong><div className="muted small">Founder &amp; Instructor</div></div>
        <div><strong>{formatDate(c.issuedAt)}</strong><div className="muted small">Date issued</div></div>
      </div>
      <div className="muted small">Certificate no. {c.certificateNumber}</div>
    </div>
  );
}

export function CertificatePage() {
  const { number = "" } = useParams();
  const state = useLoad(() => api<{ certificate: VerifiedCertificate }>(`/certificates/verify/${number}`), [number]);
  const { busy, error, run } = useAction();
  const [copied, setCopied] = useState(false);
  const verifyLink = `${window.location.origin}/verify/${number}`;

  async function download() {
    await run(async () => {
      const blob = await apiFile(`/certificates/${number}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Siraat-tul-Jannah-certificate-${number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(verifyLink);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", verifyLink);
    }
  }

  return (
    <Layout subtitle="Certificate">
      <Loaded state={state}>
        {({ certificate }) => (
          <div className="stack" style={{ maxWidth: 760, width: "100%", alignSelf: "center" }}>
            <CertificateCard c={certificate} />
            <ErrorMessage error={error} />
            <div className="row">
              <button className="btn" onClick={download} disabled={busy}>{busy ? "Preparing…" : "Download PDF"}</button>
              <button className="btn btn-outline" onClick={share}>{copied ? "Link copied ✓" : "Copy verification link"}</button>
            </div>
            <p className="muted" style={{ margin: 0 }}>Anyone with the verification link can confirm this certificate is genuine.</p>
          </div>
        )}
      </Loaded>
    </Layout>
  );
}

export function VerifyPage() {
  const { number } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(number ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (input.trim()) navigate(`/verify/${input.trim().toUpperCase()}`);
  }

  return (
    <Layout subtitle="Verify a Certificate">
      <form className="card" style={{ maxWidth: 560, width: "100%", alignSelf: "center" }} onSubmit={submit}>
        <div className="field">
          <label htmlFor="number">Certificate number</label>
          <input id="number" className="input" placeholder="STJ-2026-00001-ABCD" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <button className="btn">Check</button>
      </form>
      {number && <VerifyResult key={number} number={number} />}
    </Layout>
  );
}

function VerifyResult({ number }: { number: string }) {
  const state = useLoad(() => api<{ certificate: VerifiedCertificate }>(`/certificates/verify/${encodeURIComponent(number)}`), [number]);
  if (state.error?.status === 404) {
    return (
      <div className="alert alert-error" role="alert" style={{ maxWidth: 560, alignSelf: "center" }}>
        No certificate with this number was found. Check it was typed exactly as printed.
      </div>
    );
  }
  return (
    <Loaded state={state}>
      {({ certificate }) => (
        <div className="stack" style={{ maxWidth: 760, width: "100%", alignSelf: "center" }}>
          <div className="alert alert-ok">✓ Genuine certificate issued by Siraat tul Jannah.</div>
          <CertificateCard c={certificate} />
        </div>
      )}
    </Loaded>
  );
}
