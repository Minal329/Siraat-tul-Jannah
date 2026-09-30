import { useCallback, useEffect, useState } from "react";
import { apiFile, type ApiError } from "./api.ts";

// Loads data when a page opens: const { data, error, loading, reload } = useLoad(() => api("/courses"), []);
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: ApiError) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass their own deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

// Calls `tick` every `ms` milliseconds while the page is open and visible
// (e.g. checking whether a class has gone live). Paused in background tabs.
export function useInterval(tick: () => void, ms: number) {
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, ms);
    return () => clearInterval(id);
  }, [tick, ms]);
}

// A private file (screenshot, voice note) as a temporary in-page URL.
export function usePrivateFileUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    apiFile(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: ApiError) => !cancelled && setError(err));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, error };
}

// Runs an action (a button click) and tracks "busy" and the error to show.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
