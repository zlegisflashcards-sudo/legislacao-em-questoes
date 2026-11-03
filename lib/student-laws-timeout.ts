const REQUEST_TIMEOUT_MS = 15_000;

export function withStudentLawsTimeout<T, E extends Error>(promise: Promise<T>, createTimeoutError: () => E, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(createTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
