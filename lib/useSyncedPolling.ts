// Destination: lib/useSyncedPolling.ts
"use client";

import { useEffect, useRef, useState } from "react";

// Runs `callback` on a fixed wall-clock cadence (every intervalMs,
// aligned to absolute time — e.g. every 10s lands on :00, :10, :20 of
// each minute) instead of a per-mount timer. Any two components using
// this hook with the same intervalMs refresh at the exact same
// instant, regardless of when each one mounted. Also refetches the
// moment the tab regains visibility, then re-aligns to the grid.
// Exposes `refreshing` (fetch in flight) and `secondsLeft` (countdown
// to the next tick) for display.
export function useSyncedPolling(intervalMs: number, callback: () => Promise<void> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.ceil((intervalMs - (Date.now() % intervalMs)) / 1000)
  );

  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextAtRef = useRef(Date.now() + (intervalMs - (Date.now() % intervalMs)));

  useEffect(() => {
    let cancelled = false;

    async function fire() {
      if (cancelled) return;
      setRefreshing(true);
      try {
        await callbackRef.current();
      } finally {
        if (!cancelled) setRefreshing(false);
      }
      if (cancelled) return;
      // Next fire is scheduled off the absolute clock, not off "now +
      // intervalMs" — so a slow request (or the visibility jump below)
      // never drags the schedule off the shared grid.
      const now = Date.now();
      const delay = intervalMs - (now % intervalMs) || intervalMs;
      nextAtRef.current = now + delay;
      timeoutRef.current = setTimeout(fire, delay);
    }

    const now = Date.now();
    const initialDelay = intervalMs - (now % intervalMs);
    nextAtRef.current = now + initialDelay;
    timeoutRef.current = setTimeout(fire, initialDelay);

    const tickId = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((nextAtRef.current - Date.now()) / 1000)));
    }, 1000);

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        fire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      clearInterval(tickId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { refreshing, secondsLeft };
}