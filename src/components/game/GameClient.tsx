"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameEvent } from "@/game/engine";
import { NEIGHBORS, REGION_BY_ID } from "@/game/regions";
import type { GamePayload } from "@/lib/game/store";
import { useReducedMotion } from "@/lib/hooks";
import { Avatar } from "../Avatar";
import { SceneBoundary } from "../SceneBoundary";
import { canReplay } from "@/game/battleScript";
import { BattleView } from "./BattleView";
import { DiceRoll } from "./DiceRoll";
import { ChatPanel, channelOf, type Channel } from "./ChatPanel";
import type { Highlight } from "./Board";
import { Glossary, GoodsBar } from "./bits";
import { GameOver } from "./GameOver";
import { BankPanel, DiplomacyPanel, HeroesPanel, LogPanel, RegionPanel, meOf, playerName, regionName, regionView, usableLine, type Ctx } from "./panels";
import { HowToPlay } from "./HowToPlay";
import { ArmyPanel } from "./ArmyPanel";
import { PlanPanel } from "./PlanPanel";
import { useGame } from "./useGame";

const Board = dynamic(() => import("./Board"), { ssr: false, loading: () => null });

type Tab = "plan" | "army" | "region" | "heroes" | "diplomacy" | "chat" | "bank" | "log";

// How long each of the other Kirds' moves stays on screen, so there's time to read it.
const FEED_MS = 8500;
// Routine bookkeeping that isn't worth a caption.
const QUIET = new Set(["endTurn", "turn", "income"]);

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

type DiceShow = { seq: number; turn: number; roll: [number, number]; lines: string[] };

// The latest roll (by `who`, or by anyone if null), with what it did in plain words.
function diceFor(events: GameEvent[], who: string | null): DiceShow | null {
  const rollEvent = [...events].reverse().find((e) => e.type === "roll" && (who === null || e.actor === who) && Array.isArray(e.data?.roll));
  if (!rollEvent) return null;
  const roll = rollEvent.data!.roll as [number, number];
  const lines = [rollEvent.text.replace(/^🎲 .*? rolled \d+[.:]?\s*/u, "")];
  const income = events.find((e) => e.type === "income" && e.actor === rollEvent.actor && e.turn === rollEvent.turn);
  if (income) lines.push(`Your turn: ${income.text}`);
  return { seq: rollEvent.seq, turn: rollEvent.turn, roll, lines: lines.filter(Boolean) };
}

export function GameClient({ initial }: { initial: GamePayload }) {
  const { game, act: rawAct, send, loadOlder, olderDone, busy, error, savedAt, clearError } = useGame(initial);
  const router = useRouter();
  const { view } = game;
  const me = meOf(view);
  const active = view.players.find((p) => p.seat === view.activeSeat)!;
  const over = game.status === "complete";
  const myTurn = !over && active.id === view.me;
  const still = useReducedMotion();

  const [selected, setSelected] = useState<string | null>(me.capital ?? null);
  const [dest, setDest] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(myTurn ? "plan" : "region");
  const [thunder, setThunder] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [emailOn, setEmailOn] = useState(initial.notify.on);
  const [battle, setBattle] = useState<GameEvent | null>(null);
  const [menu, setMenu] = useState(false);

  // Every move goes through here so a battle you just fought plays out on screen.
  const act: typeof rawAct = useCallback(
    async (a) => {
      const evs = await rawAct(a);
      if (evs) {
        const fought = evs.find((e) => canReplay(e) && e.actor === view.me);
        if (fought) setBattle(fought);
      }
      return evs;
    },
    [rawAct, view.me],
  );

  // ---- chat: which conversation is open, and what's unread ----
  const [channel, setChannel] = useState<Channel>("all");
  const readKey = `pd-read-${game.id}`;
  const [lastRead, setLastRead] = useState<Record<string, number>>({});
  useEffect(() => {
    // Read after mount so the server render and the first client render agree.
    const t = setTimeout(() => {
      try {
        setLastRead(JSON.parse(localStorage.getItem(readKey) ?? "{}"));
      } catch {
        /* private mode */
      }
    });
    return () => clearTimeout(t);
  }, [readKey]);
  const unread = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of game.messages) {
      if (m.from === view.me) continue;
      const ch = channelOf(m, view.me);
      if (m.id > (lastRead[ch] ?? 0)) out[ch] = (out[ch] ?? 0) + 1;
    }
    return out;
  }, [game.messages, lastRead, view.me]);
  const unreadTotal = Object.values(unread).reduce((a, b) => a + b, 0);
  const viewingChat = tab === "chat" && panelOpen;
  useEffect(() => {
    if (!viewingChat || !unread[channel]) return;
    const top = Math.max(...game.messages.filter((m) => channelOf(m, view.me) === channel).map((m) => m.id));
    // Deferred so the badge clears after this render, not during it.
    const t = setTimeout(() =>
      setLastRead((prev) => {
        const next = { ...prev, [channel]: top };
        try {
          localStorage.setItem(readKey, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      }),
    );
    return () => clearTimeout(t);
  }, [viewingChat, channel, unread, game.messages, view.me, readKey]);

  const leave = async (end: boolean) => {
    const msg = end
      ? `End "${game.name}" for everyone? It moves to Complete in the lobby and nobody can make moves any more.`
      : `Leave "${game.name}"? Your land goes back to the wild pandas.`;
    if (!confirm(msg)) return;
    const res = await fetch(end ? `/api/game/${game.id}` : `/api/game/${game.id}/leave`, { method: end ? "DELETE" : "POST" });
    if (res.ok) router.push("/game");
    else setToast((await res.json().catch(() => ({}))).error ?? "That didn't work.");
  };

  const toggleEmail = async () => {
    const on = !emailOn;
    const res = await fetch(`/api/game/${game.id}/notify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) });
    if (res.ok) {
      setEmailOn(on);
      setToast(on ? `📧 We'll email ${initial.notify.email ?? "you"} when it's your turn.` : "🔕 Turn emails off.");
    }
  };

  const focusOn = useCallback((id: string) => {
    const d = REGION_BY_ID.get(id);
    if (d) setFocus({ lat: d.lat, lng: d.lng, seq: Date.now() });
  }, []);

  // ---- replay of everything since your last turn ----
  const unseen = useMemo(
    () => game.events.filter((e) => e.seq > (me.lastTurnEndSeq ?? 0) && e.actor !== view.me && !QUIET.has(e.type)),
    [game.events, me.lastTurnEndSeq, view.me],
  );
  const [replay, setReplay] = useState<{ list: GameEvent[]; i: number } | null>(null);
  const [replayOffered, setReplayOffered] = useState(false);

  // ---- the chance cubes: your start-of-turn roll, played once the other Kirds' moves have been shown ----
  const [dice, setDice] = useState<DiceShow | null>(null);
  const [pendingDice, setPendingDice] = useState<DiceShow | null>(null);
  const diceKey = `pd-dice-${game.id}`;
  useEffect(() => {
    // After mount (so server and client render the same): if your turn's roll hasn't been shown yet, queue it.
    const t = setTimeout(() => {
      const mine = myTurn ? diceFor(game.events, view.me) : null;
      // Only this turn's roll, and only once (it's remembered on this device).
      if (!mine || mine.turn !== view.turn) return;
      let shown = 0;
      try {
        shown = Number(localStorage.getItem(diceKey) ?? 0);
      } catch {
        /* private mode */
      }
      if (mine.seq > shown) setPendingDice(mine);
    });
    return () => clearTimeout(t);
    // Only on first load; later turns are handled when the turn changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a new turn of yours starts: announce it and open the Plan. Track the turn number, not just whose turn
  // it is: against computer players the turn comes straight back to you in the same request.
  const [seenTurn, setSeenTurn] = useState(view.turn);
  if (view.turn !== seenTurn) {
    setSeenTurn(view.turn);
    if (myTurn) {
      setToast("🎲 It's your turn!");
      setReplayOffered(false);
      setTab("plan");
      const mine = diceFor(game.events, view.me);
      if (mine && mine.turn === view.turn) setPendingDice(mine);
    }
  }

  // Live feed: when other Kirds (or the computer players) move, their moves play as captions.
  const newestSeq = game.events.at(-1)?.seq ?? 0;
  const [feedSeen, setFeedSeen] = useState(newestSeq);
  if (newestSeq > feedSeen) {
    setFeedSeen(newestSeq);
    const fresh = game.events.filter((e) => e.seq > feedSeen && e.actor !== view.me && !QUIET.has(e.type));
    if (fresh.length) {
      setReplayOffered(true);
      setReplay((r) => (r ? { ...r, list: [...r.list, ...fresh] } : { list: fresh, i: 0 }));
    }
  }

  // Show the queued roll once nothing else is playing.
  useEffect(() => {
    if (!pendingDice || replay || battle || dice) return;
    const t = setTimeout(() => {
      setDice(pendingDice);
      setPendingDice(null);
      try {
        localStorage.setItem(diceKey, String(pendingDice.seq));
      } catch {
        /* private mode */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [pendingDice, replay, battle, dice, diceKey]);

  const replayEvent = replay?.list[replay.i] ?? null;
  const nextReplay = () => setReplay((r) => (r && r.i + 1 < r.list.length ? { ...r, i: r.i + 1 } : null));
  useEffect(() => {
    if (!replay || battle || dice) return;
    const e = replay.list[replay.i];
    // Battles get the full re-enactment; the replay carries on when it's closed.
    if (e && canReplay(e)) {
      const t = setTimeout(() => setBattle(e), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(nextReplay, FEED_MS);
    return () => clearTimeout(t);
  }, [replay, battle, dice]);

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

  const onSelect = useCallback((id: string) => {
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
  }, [thunder, moveTargets, selected, dest, act]);
  const onReady = useCallback(() => setReady(true), []);

  const ctx: Ctx = { view, myTurn, busy, act, avatars: game.avatars, over };
  const closeDice = useCallback(() => setDice(null), []);

  // Pick an attack: show the source region's panel with the target lined up.
  const planAttack = (from: string, to: string) => {
    setSelected(from);
    setDest(to);
    setTab("region");
    setPanelOpen(true);
    focusOn(to);
  };

  const setAutopilot = async (on: boolean, level: "medium" | "hard" = "medium") => {
    if (
      on &&
      !confirm(
        `Put ${game.name} on autopilot (${level === "hard" ? "aggressive" : "careful"})? The computer will answer offers, build, recruit and attack for you on every turn until you take back command. You'll get a recap of each turn.`,
      )
    )
      return;
    if (await act({ type: "autopilot", on, level })) setToast(on ? "🤖 Autopilot on. Safe travels!" : "🙋 You're back in command.");
  };

  const endTurn = async () => {
    if (await act({ type: "endTurn" })) {
      setDest(null);
      setToast(view.players.some((p) => p.bot) ? "Turn ended. The computer players are moving…" : "Turn ended. The Kirds have been summoned.");
    }
  };
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
  const boardFocus = useMemo(
    () => (replayEvent && replayDef ? { lat: replayDef.lat, lng: replayDef.lng, seq: replayEvent.seq } : focus),
    [replayEvent, replayDef, focus],
  );
  const boardHighlight: Highlight | null = useMemo(
    () =>
      replayEvent
        ? replayEvent.regions.length
          ? { regions: replayEvent.regions, tone: TONE[replayEvent.type] ?? "info" }
          : null
        : highlight ?? (dest ? { regions: [dest], tone: regionView(view, dest).owner === view.me ? "move" : "battle" } : null),
    [replayEvent, highlight, dest, view],
  );
  const boardTargets = useMemo(() => (thunder || dest === null ? moveTargets : [dest]), [thunder, dest, moveTargets]);

  return (
    <main className="game">
      <div className="game-stage">
        {!ready && <div className="world-fallback"><p className="eyebrow">Loading the world…</p></div>}
        <SceneBoundary fallback={<p className="notice">This device can&rsquo;t show 3D. Try a newer browser.</p>}>
          <Board
            view={view}
            selected={selected}
            targets={boardTargets}
            highlight={boardHighlight}
            focus={boardFocus}
            still={still}
            onSelect={onSelect}
            onReady={onReady}
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
                {" "}·{" "}
                <button
                  type="button"
                  className="roll-link"
                  title="Watch the last roll again"
                  onClick={() => {
                    const last = diceFor(game.events, null);
                    if (last) setDice(last);
                  }}
                >
                  🎲 {view.lastRoll[0]}+{view.lastRoll[1]}={view.lastRoll[0] + view.lastRoll[1]}
                </button>
              </>
            )}
            {view.goal ? <> · 🏁 {view.goal}</> : null}
            <span className="saved" title="Every move is saved as you make it">{over ? " · 🏁 Complete" : savedAt ? " · ✓ Saved" : " · Auto-saves"}</span>
          </span>
        </div>
        <div className={`turn-banner${myTurn ? " mine" : ""}`} style={{ borderColor: active.color }}>
          <Avatar value={game.avatars[active.id]} userId={active.id} size={24} />
          {over ? "Game over" : myTurn ? "Your turn" : `${active.bot ? "🤖 " : ""}${active.name}'s turn`}
        </div>
        <div className="game-top-actions">
          {!over && <button className="btn ghost small invite-btn" onClick={invite}>Invite</button>}
          {initial.notify.available && initial.notify.email && (
            <button
              className="btn ghost small"
              onClick={toggleEmail}
              aria-pressed={emailOn}
              title={emailOn ? `Emailing ${initial.notify.email} on your turn. Click to stop.` : "Get an email when it's your turn"}
            >
              {emailOn ? "🔔" : "🔕"}
            </button>
          )}
          <button className="btn ghost small" onClick={() => setHelp(true)} aria-label="How to play">?</button>
          <div className="menu-wrap">
            <button className="btn ghost small" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Game menu">⋯</button>
            {menu && (
              <div className="game-menu" role="menu" onClick={() => setMenu(false)}>
                <Link role="menuitem" href={`/profile?back=/game/${game.id}`}>🐼 Change your avatar</Link>
                <button role="menuitem" onClick={invite}>📨 Invite the Kirds</button>
                <button role="menuitem" onClick={() => setHelp(true)}>📜 How to play</button>
                {!over &&
                  (me.autopilot ? (
                    <button role="menuitem" onClick={() => setAutopilot(false)}>🙋 Take back command (autopilot off)</button>
                  ) : (
                    <>
                      <button role="menuitem" onClick={() => setAutopilot(true, "medium")}>🤖 Autopilot: careful</button>
                      <button role="menuitem" onClick={() => setAutopilot(true, "hard")}>🤖 Autopilot: aggressive</button>
                    </>
                  ))}
                <Link role="menuitem" href="/game">🎲 All your games</Link>
                <Link role="menuitem" href="/releases">📰 Release notes</Link>
                <button role="menuitem" className="danger" onClick={() => leave(false)}>🚪 Leave this game</button>
                {game.hostId === view.me && !over && (
                  <button role="menuitem" className="danger" onClick={() => leave(true)}>🏁 End game for everyone</button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="game-goods">
        <GoodsBar goods={me.goods} />
        {!over && me.autopilot && (
          <p className="autopilot-pill" role="status">
            🤖 Autopilot is playing your turns ({me.autopilot === "hard" ? "aggressive" : "careful"}).{" "}
            <button type="button" onClick={() => setAutopilot(false)} disabled={busy}>
              Take back command
            </button>
          </p>
        )}
        {!over && view.threat && view.goal && (
          <p className={`threat-pill${view.threat === view.me ? " mine" : ""}`} role="status">
            {view.threat === view.me
              ? `🏁 Hold ${view.goal} regions until your next turn starts and you win!`
              : `⚠️ ${playerName(view, view.threat)} holds ${view.players.find((p) => p.id === view.threat)?.regions ?? view.goal} regions. Take some before their next turn, or they win!`}
          </p>
        )}
        <Glossary />
      </div>

      {over && <GameOver view={view} avatars={game.avatars} endedAt={game.endedAt} />}

      {!over && unseen.length > 0 && !replay && !replayOffered && (
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
          {!canReplay(replay.list[replay.i]) && !still && <span key={`${replay.i}-${replay.list[replay.i].seq}`} className="feed-timer" style={{ animationDuration: `${FEED_MS}ms` }} />}
          {canReplay(replay.list[replay.i]) && !battle && (
            <button className="btn small" onClick={() => setBattle(replay.list[replay.i])}>⚔️ Watch the battle</button>
          )}
          <div className="form-actions">
            <button className="btn ghost small" onClick={() => setReplay({ ...replay, i: Math.max(0, replay.i - 1) })} disabled={replay.i === 0}>◀</button>
            <button className="btn ghost small" onClick={nextReplay}>▶</button>
            <button className="btn small" onClick={() => setReplay(null)}>{replay.i + 1 < replay.list.length ? "Skip all ⏭" : "Done"}</button>
          </div>
        </div>
      )}

      {thunder && (
        <div className="replay-caption">
          <p>⚡ Pick a region you can see for Casey to strike.</p>
          <button className="btn ghost small" onClick={() => setThunder(false)}>Cancel</button>
        </div>
      )}

      {!panelOpen && (
        <button className="panel-restore" onClick={() => setPanelOpen(true)} aria-label="Show the actions panel">
          ▴ Actions
          {pendingOffers + unreadTotal > 0 && <span className="dot-count">{pendingOffers + unreadTotal}</span>}
        </button>
      )}

      <aside className={`game-panel${panelOpen ? "" : " closed"}`} hidden={!panelOpen}>
        <button className="panel-grip" onClick={() => setPanelOpen(false)} aria-label="Minimize the panel to see the map">
          <span aria-hidden="true" className="grip-bar" />▾ Minimize to see the map
        </button>
        <nav className="panel-tabs" aria-label="Panels">
          {(
            [
              ["plan", "💡", "Plan"],
              ["army", "⚔️", "Army"],
              ["region", "🗺️", "Region"],
              ["heroes", "🦸", "Heroes"],
              ["diplomacy", "🤝", "Kirds"],
              ["chat", "💬", "Chat"],
              ["bank", "🏦", "Bank"],
              ["log", "📜", "Log"],
            ] as [Tab, string, string][]
          ).map(([t, icon, label]) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setPanelOpen(true); }}>
              <span aria-hidden="true">{icon}</span> {label}
              {t === "diplomacy" && pendingOffers > 0 && <span className="dot-count">{pendingOffers}</span>}
              {t === "chat" && unreadTotal > 0 && <span className="dot-count">{unreadTotal}</span>}
            </button>
          ))}
          <button className="panel-toggle" onClick={() => setPanelOpen(false)} aria-label="Minimize the panel" title="Minimize to see the map">
            ▾
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
                  planAttack={planAttack}
                />
              ) : (
                <p className="panel-body muted">Tap a region on the globe.</p>
              ))}
            {tab === "plan" && (
              <PlanPanel
                ctx={ctx}
                planAttack={planAttack}
                openTab={(t) => setTab(t)}
                endTurn={endTurn}
              />
            )}
            {tab === "army" && (
              <ArmyPanel
                ctx={ctx}
                events={game.events}
                onManage={(id) => {
                  setSelected(id);
                  setDest(null);
                  setTab("region");
                  setPanelOpen(true);
                  focusOn(id);
                }}
                onWatch={setBattle}
                openHeroes={() => setTab("heroes")}
              />
            )}
            {tab === "heroes" && <HeroesPanel ctx={ctx} selected={selected} />}
            {tab === "diplomacy" && <DiplomacyPanel ctx={ctx} selected={selected} />}
            {tab === "chat" && (
              <ChatPanel view={view} messages={game.messages} avatars={game.avatars} channel={channel} setChannel={setChannel} unread={unread} send={send} />
            )}
            {tab === "bank" && <BankPanel ctx={ctx} />}
            {tab === "log" && (
              <LogPanel
                events={game.events}
                me={view.me}
                onWatch={setBattle}
                loadOlder={loadOlder}
                olderDone={olderDone}
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
        {over ? (
          <Link className="btn end-turn" href="/game">🎲 Start a new game</Link>
        ) : myTurn ? (
          <button className="btn end-turn" disabled={busy} onClick={endTurn}>
            End turn ⏭
          </button>
        ) : (
          <p className="waiting">
            Waiting for {active.bot ? "🤖 " : ""}{active.name}…
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
      {dice && <DiceRoll key={dice.seq} roll={dice.roll} lines={dice.lines} still={still} onClose={closeDice} />}
      {battle && (
        <BattleView
          key={battle.seq}
          event={battle}
          view={view}
          still={still}
          onClose={() => {
            const wasReplaying = replay?.list[replay.i]?.seq === battle.seq;
            setBattle(null);
            if (wasReplaying) nextReplay();
          }}
        />
      )}
      <span className="sr-only" aria-live="polite">{myTurn ? "Your turn" : `${playerName(view, active.id)}'s turn`}</span>
    </main>
  );
}
