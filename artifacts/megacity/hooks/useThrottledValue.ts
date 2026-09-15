import { useEffect, useRef, useState } from "react";

export function useThrottledValue<T>(value: T, intervalMs = 250): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;

    if (elapsed >= intervalMs) {
      lastUpdate.current = now;
      setThrottled(value);
    } else {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        lastUpdate.current = Date.now();
        setThrottled(value);
        pending.current = null;
      }, intervalMs - elapsed);
    }

    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, [value, intervalMs]);

  return throttled;
}
