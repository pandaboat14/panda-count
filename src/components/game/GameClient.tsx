"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameEvent } from "@/game/engine";
import { NEIGHBORS, REGION_BY_ID } from "@/game/regions";
import type { GamePayload } from "@/lib/game/store";
import { useReducedMotion } from "@/lib/hooks";
import { SceneBoundary } from "../SceneBoundary";
import type { Highlight } from "./Board";
import { GoodsBar } from "./bits";
import { BankPanel, DiplomacyPanel, HeroesPanel, LogPanel, RegionPanel, meOf, playerName, regionName, regionView, usableLine, type Ctx } from "./panels";
import { HowToPlay } from "./HowToPlay";
import { useGame } from "./useGame";

const Board = dynamic(() => import("./Board"), { ssr: false, loading: () => null });

type Tab = "region" | "heroes" | "diplomacy" | "bank" | "log";

const TONE: Record<string, Highlight["tone"]> = {
  battle: "battle",
  capture: "battle",
  thunder: "battle",
  heroCaptured: "hero",
  hero: "hero",
  heroMove: "hero",
  heroFled: "hero",
  build: "build",
  gondola: "build",
  recruit: "build",
  arm: "build",
  move: "move",
  loan: "move",
};

export function GameClient({ initial }: { initial: GamePayload }) {
  const { game, act, busy, error, clearError } = useGame(initial);
  const { view } = game;
  const me = meOf(view);
  const active = view.players.find((p) => p.seat === view.activeSeat)!;
  const myTurn = active.id === view.me;
  const still = useReducedMotion();

  const [selected, setSelected] = useState<string | null>(me.capital ?? null);
  const [dest, setDest] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("region");
  const [thunder, setThunder] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const focusOn = useCallback((id: string) => {
    const d = REGION_BY_ID.get(id);
    if (d) setFocus({ lat: d.lat, lng: d.lng, seq: Date.now() });
  }, []);

  // ---- replay of everything since your last turn ----
  const unseen = useMemo(
    () => game.events.filter((e) => e.seq > (me.lastTurnEndSeq ?? 0) && e.actor !== view.me && e.type !== "endTurn"),
    [game.events, me.lastTurnEndSeq, view.me],
  );
  const [replay, setReplay] = useState<{ list: GameEvent[]; i: number } | null>(null);
  const [replayOffered, setReplayOffered] = useState(false);

  // When it becomes your turn: announce it and offer the replay again.
  const [wasMyTurn, setWasMyTurn] = useState(myTurn);
  if (myTurn !== wasMyTurn) {
    setWasMyTurn(myTurn);
    if (myTurn) {
      setToast("🎲 It's your turn!");
      setReplayOffered(false);
    }
  }

  const replayEvent = replay?.list[replay.i] ?? null;
  useEffect(() => {
    if (!replay) return;
    const e = replay.list[replay.i];
    const t = setTimeout(
      () => setReplay((r) => (r && r.i + 1 < r.list.length ? { ...r, i: r.i + 1 } : null)),
      e?.regions.length ? 2600 : 1800,
    );
    return () => clearTimeout(t);
  }, [replay]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- clicking the board ----
  const sel = selected ? regionView(view, selected) : null;
  const moveTargets = useMemo(() => {
    if (thunder) return view.regions.filter((r) => !r.fog && r.owner !== view.me).map((r) => r.id);
    if (!myTurn || !selected || sel?.owner !== view.me) return [];
    return NEIGHBORS.get(selected)!.filter((n) => usableLine(view, selected, n));
  }, [thunder, myTurn, selected, sel?.owner, view]);

  const onSelect = (id: string) => {
    if (thunder) {
      if (moveTargets.includes(id) && confirm(`Call Casey's thunder down on ${regionName(id)}?`)) {
        act({ type: "thunder", target: id });
      }
      setThunder(false);
      return;
    }
    if (selected && moveTargets.includes(id)) {
      setDest(dest === id ? null : id);
      setTab("region");
      return;
    }
    setSelected(id);
    setDest(null);
    setTab("region");
    setPanelOpen(true);
  };

  const ctx: Ctx = { view, myTurn, busy, act };
  const pendingOffers = view.offers.filter((o) => o.to === view.me).length;

  const invite = async () => {
    const url = `${location.origin}/game/join/${game.code}`;
    try {
      if (navigator.share) await navigator.share({ title: `Join ${game.name}`, text: "Come play Panda Diplomacy with the Kirds", url });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Invite link copied 📋");
      }
    } catch {
      /* cancelled */
    }
  };

  const hoursWaiting = (now - view.turnStartedAt) / 3600000;

  // During a replay the board follows the replay; otherwise it shows your own picks.
  const replayRegion = replayEvent?.regions.at(-1);
  const replayDef = replayRegion ? REGION_BY_ID.get(replayRegion) : undefined;
  const boardFocus = replayEvent && replayDef ? { lat: replayDef.lat, lng: replayDef.lng, seq: replayEvent.seq } : focus;
  const boardHighlight: Highlight | null = replayEvent
    ? replayEvent.regions.length
      ? { regions: replayEvent.regions, tone: TONE[replayEvent.type] ?? "info" }
      : null
    : highlight ?? (dest ? { regions: [dest], tone: regionView(view, dest).owner === view.me ? "move" : "battle" } : null);

  return (
    <main className="game">
      <div className="game-stage">
        {!ready && <div className="world-fallback"><p className="eyebrow">Loading the world…</p></div>}
        <SceneBoundary fallback={<p className="notice">This device can&rsquo;t show 3D. Try a newer browser.</p>}>
          <Board
            view={view}
            selected={selected}
            targets={thunder || dest === null ? moveTargets : [dest]}
            highlight={boardHighlight}
            focus={boardFocus}
            still={still}
            onSelect={onSelect}
            onReady={() => setReady(true)}
          />
        </SceneBoundary>
      </div>

      <header className="game-top">
        <Link href="/game" className="game-back" aria-label="All games">←</Link>
        <div className="game-title">
          <strong>{game.name}</strong>
          <span className="muted small">
            Round {view.round}
            {view.lastRoll && (
              <>
                {" "}· 🎲 {view.lastRoll[0]}+{view.lastRoll[1]}={view.lastRoll[0] + view.lastRoll[1]}
              </>
            )}
          </span>
        </div>
        <div className={`turn-banner${myTurn ? " mine" : ""}`} style={{ borderColor: active.color }}>
          <span className="player-dot" style={{ background: active.color }} />
          {myTurn ? "Your turn" : `${active.name}'s turn`}
        </div>
        <div className="game-top-actions">
          <button className="btn ghost small" onClick={invite}>Invite</button>
          <button className="btn ghost small" onClick={() => setHelp(true)} aria-label="How to play">?</button>
        </div>
      </header>

      <div className="game-goods">
        <GoodsBar goods={me.goods} />
      </div>

      {unseen.length > 0 && !replay && !replayOffered && (
        <div className="replay-offer">
          <p>
            <strong>{unseen.length}</strong> thing{unseen.length === 1 ? "" : "s"} happened since your last turn.
          </p>
          <div className="form-actions">
            <button className="btn small" onClick={() => { setReplay({ list: unseen, i: 0 }); setReplayOffered(true); }}>▶ Watch replay</button>
            <button className="btn ghost small" onClick={() => { setReplayOffered(true); setTab("log"); }}>Read it</button>
          </div>
        </div>
      )}

      {replay && replay.list[replay.i] && (
        <div className="replay-caption" role="status">
          <p className="muted small">
            {replay.i + 1} / {replay.list.length} · Round {replay.list[replay.i].round}
          </p>
          <p>{replay.list[replay.i].text}</p>
          <div className="form-actions">
            <button className="btn ghost small" onClick={() => setReplay({ ...replay, i: Math.max(0, replay.i - 1) })} disabled={replay.i === 0}>◀</button>
            <button className="btn ghost small" onClick={() => setReplay({ ...replay, i: replay.i + 1 })}>▶</button>
            <button className="btn small" onClick={() => setReplay(null)}>Done</button>
          </div>
        </div>
      )}

      {thunder && (
        <div className="replay-caption">
          <p>⚡ Pick a region you can see for Casey to strike.</p>
          <button className="btn ghost small" onClick={() => setThunder(false)}>Cancel</button>
        </div>
      )}

      <aside className={`game-panel${panelOpen ? "" : " closed"}`}>
        <nav className="panel-tabs" aria-label="Panels">
          {(
            [
              ["region", "🗺️", "Region"],
              ["heroes", "🦸", "Heroes"],
              ["diplomacy", "🤝", "Kirds"],
              ["bank", "🏦", "Bank"],
              ["log", "📜", "Log"],
            ] as [Tab, string, string][]
          ).map(([t, icon, label]) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setPanelOpen(true); }}>
              <span aria-hidden="true">{icon}</span> {label}
              {t === "diplomacy" && pendingOffers > 0 && <span className="dot-count">{pendingOffers}</span>}
            </button>
          ))}
          <button className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? "Hide panel" : "Show panel"}>
            {panelOpen ? "▾" : "▴"}
          </button>
        </nav>
        {panelOpen && (
          <div className="panel-scroll">
            {tab === "region" &&
              (selected ? (
                <RegionPanel
                  key={selected}
                  ctx={ctx}
                  id={selected}
                  dest={dest}
                  setDest={setDest}
                  startThunder={() => setThunder(true)}
                  planAttack={(from, to) => {
                    setSelected(from);
                    setDest(to);
                    focusOn(to);
                  }}
                />
              ) : (
                <p className="panel-body muted">Tap a region on the globe.</p>
              ))}
            {tab === "heroes" && <HeroesPanel ctx={ctx} selected={selected} />}
            {tab === "diplomacy" && <DiplomacyPanel ctx={ctx} selected={selected} />}
            {tab === "bank" && <BankPanel ctx={ctx} />}
            {tab === "log" && (
              <LogPanel
                events={game.events}
                onPick={(e) => {
                  if (!e.regions.length) return;
                  focusOn(e.regions[e.regions.length - 1]);
                  setHighlight({ regions: e.regions, tone: TONE[e.type] ?? "info" });
                }}
              />
            )}
          </div>
        )}
      </aside>

      <div className="game-bottom">
        {myTurn ? (
          <button
            className="btn end-turn"
            disabled={busy}
            onClick={async () => {
              if (await act({ type: "endTurn" })) {
                setDest(null);
                setToast("Turn ended. The Kirds have been summoned.");
              }
            }}
          >
            End turn ⏭
          </button>
        ) : (
          <p className="waiting">
            Waiting for {active.name}…
            {game.hostId === view.me && hoursWaiting >= 12 && (
              <button className="btn ghost small" disabled={busy} onClick={() => act({ type: "skipTurn" })}>Skip their turn</button>
            )}
          </p>
        )}
      </div>

      {(error || toast) && (
        <div className={`game-toast${error ? " error" : ""}`} role="alert" onClick={() => { clearError(); setToast(null); }}>
          {error ?? toast}
        </div>
      )}

      {help && <HowToPlay onClose={() => setHelp(false)} />}
      <span className="sr-only" aria-live="polite">{myTurn ? "Your turn" : `${playerName(view, active.id)}'s turn`}</span>
    </main>
  );
}
