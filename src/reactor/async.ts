export interface RetryUntilOptions<T> {
  /** Attempts after the first one. */
  times: number;
  delayMs?: number;
  backoff?: boolean;
  /** Decides whether a value is good enough; the default accepts everything. Use it for `Result`: `(r) => r.isSuccess`. */
  until?(value: T): boolean;
  /** Stop retrying (and return the last value) once true, e.g. `() => ctx.isCancelled`. */
  isCancelled?(): boolean;
}

/**
 * Runs [fn] again until [until] accepts the value or the attempts run out; a thrown error
 * counts as a failed attempt and is rethrown after the last one. Returns the last value.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: RetryUntilOptions<T>,
): Promise<T> {
  const { times, delayMs = 0, backoff = false, until = () => true, isCancelled } = options;
  for (let attempt = 0; ; attempt++) {
    let value: T | undefined;
    let failure: unknown;
    let threw = false;
    try {
      value = await fn();
    } catch (error) {
      threw = true;
      failure = error;
    }
    const last = attempt >= times || isCancelled?.() === true;
    if (!threw && until(value as T)) return value as T;
    if (last) {
      if (threw) throw failure;
      return value as T;
    }
    const delay = delayMs * (backoff ? 2 ** attempt : 1);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Makes concurrent calls share one run: while [fn] is pending every caller gets the same
 * promise. The classic use is a token refresh that several failing requests trigger at once.
 */
export function singleFlight<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let pending: Promise<T> | undefined;
  return (...args) => {
    if (!pending) {
      pending = fn(...args).finally(() => {
        pending = undefined;
      });
    }
    return pending;
  };
}
