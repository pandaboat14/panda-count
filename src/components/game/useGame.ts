"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, GameEvent } from "@/game/engine";
import type { ChatMessage } from "@/lib/game/chat";
import type { GamePayload } from "@/lib/game/store";

const POLL_MS = 4000;

const maxId = (ms: ChatMessage[]) => ms.reduce((n, m) => Math.max(n, m.id), 0);

function mergeEvents(a: GameEvent[], b: GameEvent[]) {
  const known = new Map(a.map((e) => [e.seq, e]));
  for (const e of b) known.set(e.seq, e);
  return [...known.values()].sort((x, y) => x.seq - y.seq);
}

function mergeMessages(a: ChatMessage[], b: ChatMessage[]) {
  const known = new Map(a.map((m) => [m.id, m]));
  for (const m of b) known.set(m.id, m);
  return [...known.values()].sort((x, y) => x.id - y.id);
}

// Keeps the game in sync with the server: polls for other Kirds' moves and messages, and sends ours.
export function useGame(initial: GamePayload) {
  const [game, setGame] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [olderDone, setOlderDone] = useState(false);
  const version = useRef(initial.version);
  const lastMsg = useRef(maxId(initial.messages));
  const oldestSeq = useRef(initial.events[0]?.seq ?? 0);
  const newestSeq = useRef(initial.events.at(-1)?.seq ?? 0);

  const merge = useCallback((next: GamePayload) => {
    version.current = next.version;
    newestSeq.current = Math.max(newestSeq.current, next.events.at(-1)?.seq ?? 0);
    lastMsg.current = Math.max(lastMsg.current, maxId(next.messages));
    setGame((prev) => ({ ...next, events: mergeEvents(prev.events, next.events), messages: mergeMessages(prev.messages, next.messages) }));
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/game/${initial.id}?v=${version.current}&m=${lastMsg.current}&since=${oldestSeq.current - 1}`, { cache: "no-store" });
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

  // Returns the events this action produced (so the UI can, say, play the battle it caused).
  const act = useCallback(
    async (action: Action): Promise<GameEvent[] | false> => {
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
        const payload = data as GamePayload;
        const top = newestSeq.current;
        const fresh = payload.events.filter((e) => e.seq > top);
        merge(payload);
        return fresh;
      } catch {
        setError("Couldn't reach the server. Check your connection.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [initial.id, merge],
  );

  const send = useCallback(
    async (to: string | null, body: string) => {
      const res = await fetch(`/api/game/${initial.id}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, body }),
      });
      const data = await res.json().catch(() => ({ error: "Couldn't send that." }));
      if (!res.ok) {
        setError(data.error ?? "Couldn't send that.");
        return false;
      }
      const m = data.message as ChatMessage;
      lastMsg.current = Math.max(lastMsg.current, m.id);
      setGame((prev) => ({ ...prev, messages: mergeMessages(prev.messages, [m]) }));
      return true;
    },
    [initial.id],
  );

  // Pages further back through history for the full log.
  const loadOlder = useCallback(async () => {
    const before = oldestSeq.current || Number.MAX_SAFE_INTEGER;
    const res = await fetch(`/api/game/${initial.id}/events?before=${before}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { events: GameEvent[]; more: boolean };
    if (data.events.length) oldestSeq.current = data.events[0].seq;
    if (!data.more) setOlderDone(true);
    setGame((prev) => ({ ...prev, events: mergeEvents(data.events, prev.events) }));
  }, [initial.id]);

  return { game, act, send, loadOlder, olderDone, busy, error, clearError: () => setError(null) };
}
