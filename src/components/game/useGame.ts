"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "@/game/engine";
import type { GamePayload } from "@/lib/game/store";

const POLL_MS = 4000;

// Keeps the game in sync with the server: polls for other Kirds' moves and sends ours.
export function useGame(initial: GamePayload) {
  const [game, setGame] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(initial.version);
  const oldestSeq = useRef(initial.events[0]?.seq ?? 0);

  const merge = useCallback((next: GamePayload) => {
    version.current = next.version;
    setGame((prev) => {
      // Keep older events we already have, add anything new.
      const known = new Map(prev.events.map((e) => [e.seq, e]));
      for (const e of next.events) known.set(e.seq, e);
      const events = [...known.values()].sort((a, b) => a.seq - b.seq).slice(-600);
      return { ...next, events };
    });
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/game/${initial.id}?v=${version.current}&since=${oldestSeq.current - 1}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && data.changed) merge(data as GamePayload);
      } catch {
        // Offline for a moment; try again next tick.
      }
    };
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial.id, merge]);

  const act = useCallback(
    async (action: Action) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/game/${initial.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, since: oldestSeq.current - 1 }),
        });
        const data = await res.json().catch(() => ({ error: "Something went wrong." }));
        if (!res.ok) {
          setError(data.error ?? "That didn't work.");
          return false;
        }
        merge(data as GamePayload);
        return true;
      } catch {
        setError("Couldn't reach the server. Check your connection.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [initial.id, merge],
  );

  return { game, act, busy, error, clearError: () => setError(null) };
}
