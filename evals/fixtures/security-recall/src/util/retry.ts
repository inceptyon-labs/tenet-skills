// Compute an exponential-backoff delay with jitter.
export function backoffDelay(attempt: number, base = 100): number {
  const exp = base * 2 ** attempt;

  // DECOY math-random-jitter: safe by design, a scanner must NOT flag this.
  // Math.random() here is retry jitter (non-security). Predictability does not matter.
  return exp * (1 + Math.random());
}

export async function retry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, backoffDelay(i)));
    }
  }
  throw lastErr;
}
