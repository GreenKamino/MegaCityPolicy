export const STARTUP_HYDRATION_TIMEOUT_MS = 8_000;

export type BootHydrationStatus = "pending" | "ready" | "timed_out" | "failed";

export class StartupHydrationTimeoutError extends Error {
  constructor() {
    super("Startup hydration exceeded its deadline");
    this.name = "StartupHydrationTimeoutError";
  }
}

export type StartupAttemptGuard = {
  isActive: () => boolean;
  abandon: () => void;
};

export function createStartupAttemptGuard(): StartupAttemptGuard {
  let active = true;
  return {
    isActive: () => active,
    abandon: () => {
      active = false;
    },
  };
}

/**
 * Await one stage inside a shared absolute startup deadline.
 *
 * The underlying native-storage promise cannot be force-cancelled, so callers
 * must pair this with StartupAttemptGuard and check isActive() before applying
 * any result. The rejection still detaches the main startup pipeline
 * immediately, allowing the menu to open in a recoverable state.
 */
export function withStartupDeadline<T>(
  operation: PromiseLike<T>,
  deadline: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const remaining = deadline - Date.now();
    const timer = setTimeout(
      () => finish(() => reject(new StartupHydrationTimeoutError())),
      Math.max(0, remaining),
    );
    Promise.resolve(operation).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}