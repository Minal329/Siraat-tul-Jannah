// Small building blocks shared by every page.
import type { ReactNode } from "react";
import type { ApiError } from "../lib/api.ts";
import { usePrivateFileUrl } from "../lib/hooks.ts";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="spinner" role="status" aria-label={label} />;
}

export function ErrorMessage({ error }: { error: ApiError | string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {typeof error === "string" ? error : error.message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// Wraps a page's data: spinner while loading, message on error, content when ready.
export function Loaded<T>({ state, children }: { state: { data: T | null; error: ApiError | null; loading: boolean }; children: (data: T) => ReactNode }) {
  if (state.error) return <ErrorMessage error={state.error} />;
  if (state.loading || state.data === null) return <Spinner />;
  return <>{children(state.data)}</>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">{title}</h2>
          <button className="btn btn-outline btn-small" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// A payment screenshot, fetched with the login token.
export function PrivateImage({ path, alt }: { path: string; alt: string }) {
  const { url, error } = usePrivateFileUrl(path);
  if (error) return <ErrorMessage error={error} />;
  if (!url) return <Spinner label="Loading image…" />;
  return <img src={url} alt={alt} style={{ borderRadius: 12, maxHeight: "70vh", objectFit: "contain" }} />;
}

// A voice note, fetched with the login token.
export function PrivateAudio({ path, label }: { path: string; label: string }) {
  const { url, error } = usePrivateFileUrl(path);
  if (error) return <span className="muted">Voice note unavailable</span>;
  if (!url) return <span className="muted">Loading voice note…</span>;
  return <audio controls src={url} aria-label={label} style={{ width: "100%" }} />;
}

// The navy header's faint circle pattern, as in the prototype.
export function HeaderPattern() {
  const circles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 26; col++) {
      circles.push(<circle key={`${row}-${col}`} cx={30 + col * 46 + (row % 2) * 23} cy={14 + row * 30} r={16} />);
    }
  }
  return (
    <svg className="header-pattern" width="100%" height="100" preserveAspectRatio="xMinYMin slice" aria-hidden="true">
      <g stroke="#FFFFFF" strokeWidth="1" fill="none">
        {circles}
      </g>
    </svg>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    PENDING: ["pill-warn", "Awaiting approval"],
    APPROVED: ["pill-warn", "In progress"],
    COMPLETED: ["pill-ok", "Completed"],
    REJECTED: ["pill-bad", "Not approved"],
    CANCELLED: ["pill-bad", "Cancelled"],
    VERIFIED: ["pill-ok", "Verified"],
  };
  const [className, label] = map[status] ?? ["pill-ok", status];
  return <span className={`pill ${className}`}>{label}</span>;
}
