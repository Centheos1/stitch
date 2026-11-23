export function logError(operation: string, error: unknown): void {
  const name = error instanceof Error && /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(error.name)
    ? error.name
    : "UnknownError";
  console.error(operation, { error: name });
}
