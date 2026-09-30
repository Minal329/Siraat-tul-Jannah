import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import type { ApiError } from "./api.ts";

// Loads a screen's data each time the screen comes into view (so going back
// to a list shows fresh data). Pull-to-refresh calls `reload`.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass their own deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, error, loading, reload };
}

// Runs an action (a button press) and tracks "busy" and the error to show.
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
