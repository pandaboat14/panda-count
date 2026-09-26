"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, GameEvent } from "@/game/engine";
import type { ChatMessage } from "@/lib/game/chat";
import type { GamePayload } from "@/lib/game/store";

const POLL_MS = 4000;
const TIMEOUT_MS = 20000;
// Neon Auth caches your session in a cookie for 5 minutes; refreshing it before then keeps every
// game request from having to check with the auth server (the cause of the mid-game errors).
const SESSION_REFRESH_MS = 4 * 60 * 1000;

// At most one report per kind of problem a minute, so a phone that drops offline doesn't flood the log.
const lastReport = new Map<string, number>();

export function reportError(where: string, message: string, detail?: Record<string, unknown>) {
  const key = `${where}:${message}`;
  if (Date.now() - (lastReport.get(key) ?? 0) < 60_000) return;
  lastReport.set(key, Date.now());
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ where, message, detail: { ...detail, url: location.pathname } }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never break the game */
  }
}

const refreshSession = () => fetch("/api/auth/get-session", { cache: "no-store", credentials: "same-origin" }).catch(() => null);

// fetch with a time limit, so a stuck request fails cleanly instead of hanging the game.
async function timedFetch(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Sends a request; if the session looked expired (or, for reads, the server hiccuped), refresh and try once more.
// Moves are only retried after a 401, which the server rejects before touching the game: retrying after
// a timeout or a 500 could make the same move twice (say, ending two turns).
async function robustFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  const isRead = !init?.method || init.method === "GET";
  let res: Response | null = null;
  let failure: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await timedFetch(url, init);
      if (res.status !== 401 && (res.status < 500 || !isRead)) return res;
    } catch (e) {
      failure = e;
      res = null;
      if (!isRead) break;
    }
    if (attempt === 0) {
      await refreshSession();
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  reportError("fetch", res ? `HTTP ${res.status}` : failure instanceof Error && failure.name === "AbortError" ? "timeout" : "network", {
    request: `${init?.method ?? "GET"} ${url.split("?")[0]}`,
    ms: Date.now() - started,
  });
  if (res) return res;
  throw failure;
}

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
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
        const res = await robustFetch(`/api/game/${initial.id}?v=${version.current}&m=${lastMsg.current}&since=${oldestSeq.current - 1}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && data.changed) merge(data as GamePayload);
      } catch {
        // Offline for a moment; try again next tick.
      }
    };
    const id = setInterval(tick, POLL_MS);
    let lastRefresh = Date.now();
    const keepAlive = setInterval(() => {
      if (document.hidden) return;
      lastRefresh = Date.now();
      void refreshSession();
    }, SESSION_REFRESH_MS);
    const onVisible = () => {
      if (document.hidden) return;
      // Coming back to the tab after a while: refresh the session first, then catch up.
      if (Date.now() - lastRefresh > SESSION_REFRESH_MS) {
        lastRefresh = Date.now();
        void refreshSession().then(tick);
      } else tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      clearInterval(keepAlive);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial.id, merge]);

  // Returns the events this action produced (so the UI can, say, play the battle it caused).
  const act = useCallback(
    async (action: Action): Promise<GameEvent[] | false> => {
      setBusy(true);
      setError(null);
      // What was new before this move: a poll that lands while it's in flight mustn't hide the move's own events.
      const top = newestSeq.current;
      try {
        const res = await robustFetch(`/api/game/${initial.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, since: oldestSeq.current - 1 }),
        });
        const data = await res.json().catch(() => ({ error: "Something went wrong." }));
        if (!res.ok) {
          setError(res.status === 401 ? "You've been signed out. Reload the page and sign in again." : (data.error ?? "That didn't work."));
          return false;
        }
        const payload = data as GamePayload;
        setSavedAt(Date.now());
        const fresh = payload.events.filter((e) => e.seq > top);
        merge(payload);
        return fresh;
      } catch (e) {
        setError(e instanceof Error && e.name === "AbortError" ? "The server took too long. Try that again." : "Couldn't reach the server. Check your connection.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [initial.id, merge],
  );

  const send = useCallback(
    async (to: string | null, body: string) => {
      const res = await robustFetch(`/api/game/${initial.id}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, body }),
      }).catch(() => null);
      if (!res) {
        setError("Couldn't send that. Check your connection.");
        return false;
      }
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
    const res = await robustFetch(`/api/game/${initial.id}/events?before=${before}`, { cache: "no-store" }).catch(() => null);
    if (!res) return;
    if (!res.ok) return;
    const data = (await res.json()) as { events: GameEvent[]; more: boolean };
    if (data.events.length) oldestSeq.current = data.events[0].seq;
    if (!data.more) setOlderDone(true);
    setGame((prev) => ({ ...prev, events: mergeEvents(data.events, prev.events) }));
  }, [initial.id]);

  return { game, act, send, loadOlder, olderDone, busy, error, savedAt, clearError: () => setError(null) };
}
