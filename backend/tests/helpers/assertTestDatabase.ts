// Safety catch: tests delete data, so refuse to run against any database whose
// name doesn't end in "_test" (e.g. the dev database or, one day, production).
export function assertTestDatabase(url: string | undefined) {
  const name = url ? new URL(url).pathname.slice(1) : "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to run tests against database "${name}": its name must end in "_test".`);
  }
}
