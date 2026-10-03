// A pretend backend for screen tests. In a test file:
//   jest.mock("../lib/api.ts", () => require("../test-helpers/fakeApi.ts").apiModule);
//   jest.mock("expo-router", () => require("../test-helpers/fakeApi.ts").routerModule);
// then set `responses[path] = …` and check `writes()` (every POST/PATCH the screen sent).
type Options = { method?: string; body?: unknown; form?: unknown };
export type Call = { path: string; method: string; body?: unknown };

export const responses: Record<string, unknown> = {};
export const calls: Call[] = [];
export const pushed: string[] = [];

export function reset() {
  for (const key of Object.keys(responses)) delete responses[key];
  calls.length = 0;
  pushed.length = 0;
}

export const writes = () => calls.filter((c) => c.method !== "GET");

export const apiModule = {
  api: async (path: string, options: Options = {}) => {
    const method = options.method ?? (options.body !== undefined || options.form ? "POST" : "GET");
    calls.push({ path, method, ...(options.body !== undefined ? { body: options.body } : {}) });
    const reply = responses[`${method} ${path}`] ?? responses[path];
    if (reply instanceof Error) throw reply;
    return reply ?? {};
  },
  authHeaders: async () => ({}),
  fileUrl: (p: string) => p,
  friendlyMessage: (err: Error) => err.message,
};

export const routerModule = {
  Stack: { Screen: () => null },
  router: { push: (href: string) => pushed.push(href), replace: (href: string) => pushed.push(href) },
  useLocalSearchParams: () => ({}),
  // Load data as soon as the screen appears (there is no navigation in tests).
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
};
