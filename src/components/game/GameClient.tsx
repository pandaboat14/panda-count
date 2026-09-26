"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { unitTotal, type BattleData, type GameEvent } from "@/game/engine";
import { NEIGHBORS, REGION_BY_ID } from "@/game/regions";
import { rollShow, type RollShow } from "@/game/rollReport";
import type { GamePayload } from "@/lib/game/store";
import { useReducedMotion } from "@/lib/hooks";
import { Avatar } from "../Avatar";
import { SceneBoundary } from "../SceneBoundary";
import { canReplay } from "@/game/battleScript";
import { BattleView } from "./BattleView";
import { DiceRoll } from "./DiceRoll";
import { ChatPanel, channelOf, type Channel } from "./ChatPanel";
import type { BoardLabel, Highlight, MarkKind } from "./Board";
import { FlagIcon } from "./Flag";
import { Glossary, GoodsBar } from "./bits";
import { GameOver } from "./GameOver";
import { BankPanel, DiplomacyPanel, HeroesPanel, LogPanel, RegionPanel, RenameCard, meOf, playerName, regionName, regionView, usableLine, type Ctx } from "./panels";
import { restedIn } from "@/game/army";
import { attackOdds } from "@/game/odds";
import { HowToPlay } from "./HowToPlay";
import { ArmyPanel } from "./ArmyPanel";
import { MoveBar, moveOptions, moveSources } from "./MoveBar";
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
  rename: "build",
};

// Moving troops: where from, then where to (either can still be unpicked).
type Move = { from: string | null; to: string | null };

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
  // Move mode: null when you're not moving troops.
  const [move, setMove] = useState<Move | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  // Phones tuck the panel away while you move troops, and bring it back when you stop.
  const [restorePanel, setRestorePanel] = useState(false);
  // A region you just took, waiting to hear if you'd like to rename it.
  const [renameAsk, setRenameAsk] = useState<string | null>(null);
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

  // Every move goes through here so a battle you just fought plays out on screen, and a region you
  // just took gets offered a new name once it has.
  const act: typeof rawAct = useCallback(
    async (a) => {
      const evs = await rawAct(a);
      if (evs) {
        const fought = evs.find((e) => canReplay(e) && e.actor === view.me);
        if (fought) setBattle(fought);
        const took = evs.find((e) => e.actor === view.me && (e.type === "capture" || (e.type === "battle" && (e.data as Partial<BattleData> | undefined)?.won)));
        if (took) setRenameAsk((took.data as Partial<BattleData> | undefined)?.to ?? took.regions.at(-1) ?? null);
        const renamed = evs.find((e) => e.type === "rename" && e.actor === view.me);
        if (renamed) setToast(renamed.text);
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

  const focusOn = useCallback((id: string, also?: string | null) => {
    const a = REGION_BY_ID.get(id);
    const b = also ? REGION_BY_ID.get(also) : undefined;
    if (!a) return;
    if (!b) {
      setFocus({ lat: a.lat, lng: a.lng, seq: Date.now() });
      return;
    }
    // Halfway along the great circle, so both regions stay on screen.
    const v = (d: { lat: number; lng: number }) => {
      const [lat, lng] = [(d.lat * Math.PI) / 180, (d.lng * Math.PI) / 180];
      return [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)];
    };
    const [x, y, z] = v(a).map((n, i) => n + v(b)[i]);
    setFocus({ lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lng: (Math.atan2(y, x) * 180) / Math.PI, seq: Date.now() });
  }, []);

  // ---- replay of everything since your last turn ----
  const unseen = useMemo(
    () => game.events.filter((e) => e.seq > (me.lastTurnEndSeq ?? 0) && e.actor !== view.me && !QUIET.has(e.type)),
    [game.events, me.lastTurnEndSeq, view.me],
  );
  const [replay, setReplay] = useState<{ list: GameEvent[]; i: number } | null>(null);
  const [replayOffered, setReplayOffered] = useState(false);

  // ---- the dice: your start-of-turn roll, thrown once the other Kirds' moves have been shown ----
  // `live` is your own throw to make; otherwise it's a replay that throws itself.
  const [dice, setDice] = useState<{ show: RollShow; live: boolean } | null>(null);
  const [pendingDice, setPendingDice] = useState<RollShow | null>(null);
  const diceKey = `pd-dice-${game.id}`;
  useEffect(() => {
    // After mount (so server and client render the same): if your turn's roll hasn't been shown yet, queue it.
    const t = setTimeout(() => {
      const mine = myTurn ? rollShow(game.events, view.me, view.me) : null;
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
    // A turn change always ends any troop move or rename that was under way.
    setMove(null);
    setMoveNote(null);
    setRenameAsk(null);
    if (restorePanel) {
      setPanelOpen(true);
      setRestorePanel(false);
    }
    if (myTurn) {
      setToast("🎲 It's your turn!");
      setReplayOffered(false);
      setTab("plan");
      const mine = rollShow(game.events, view.me, view.me);
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
      setDice({ show: pendingDice, live: true });
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

  // ---- moving troops ----
  const startMove = useCallback(
    (from: string | null, to: string | null = null) => {
      setThunder(false);
      setReplay(null);
      setMove({ from, to });
      setMoveNote(null);
      if (from) setSelected(from);
      if (from) focusOn(from, to);
      // Phones: tuck the panel away so the whole map is free to tap.
      if (panelOpen && window.matchMedia("(max-width: 760px)").matches) {
        setPanelOpen(false);
        setRestorePanel(true);
      }
    },
    [focusOn, panelOpen],
  );
  const stopMove = useCallback(() => {
    setMove(null);
    setMoveNote(null);
    if (restorePanel) {
      setPanelOpen(true);
      setRestorePanel(false);
    }
  }, [restorePanel]);
  // The bar's buttons can name regions anywhere on the globe, so the camera follows them there.
  const pickMove = useCallback(
    (from: string | null, to: string | null) => {
      setMove({ from, to });
      if (from) setSelected(from);
      if (from) focusOn(from, to);
    },
    [focusOn],
  );

  // Esc stops moving troops (or calling thunder), unless a dialog is open and wants the key itself.
  useEffect(() => {
    if (!move && !thunder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (thunder) setThunder(false);
      else stopMove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, thunder, stopMove]);

  // ---- clicking the board ----
  const sel = selected ? regionView(view, selected) : null;
  const thunderTargets = useMemo(
    () => (thunder ? view.regions.filter((r) => !r.fog && r.owner !== view.me).map((r) => r.id) : []),
    [thunder, view],
  );

  const onSelect = useCallback(
    (id: string) => {
      if (thunder) {
        if (thunderTargets.includes(id) && confirm(`Call Casey's thunder down on ${regionName(view, id)}?`)) {
          act({ type: "thunder", target: id });
        }
        setThunder(false);
        return;
      }
      if (move) {
        const r = regionView(view, id);
        const from = move.from;
        setMoveNote(null);
        if (from && id === from) {
          // Tapping where you're moving from again lets you pick somewhere else.
          setMove({ from: null, to: null });
        } else if (from && NEIGHBORS.get(from)!.includes(id) && !(r.owner === view.me && !usableLine(view, from, id))) {
          setMove({ from, to: move.to === id ? null : id });
        } else if (r.owner === view.me) {
          setMove({ from: id, to: null });
          setSelected(id);
        } else {
          setMoveNote(
            from
              ? `${regionName(view, id)} isn't next to ${regionName(view, from)}: troops ride one gondola line at a time.`
              : `${regionName(view, id)} isn't yours. Start from one of your regions: they fly your flag.`,
          );
        }
        return;
      }
      setSelected(id);
      setTab("region");
      setPanelOpen(true);
    },
    [thunder, thunderTargets, move, view, act],
  );
  const onReady = useCallback(() => setReady(true), []);

  const ctx: Ctx = { view, myTurn, busy, act, avatars: game.avatars, over };
  const closeDice = useCallback(() => setDice(null), []);

  // Pick an attack (Sun Tzu's, or from a region's panel): straight into move mode, ready to choose who goes.
  const planAttack = (from: string, to: string) => startMove(from, to);

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

  // "Your land": each tap flies on to the next region you hold.
  const myLand = useMemo(() => view.regions.filter((r) => r.owner === view.me).map((r) => r.id), [view.regions, view.me]);
  const showMyLand = () => {
    if (!myLand.length) return;
    const id = myLand[(myLand.indexOf(selected ?? "") + 1) % myLand.length];
    setSelected(id);
    focusOn(id);
  };

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
        : highlight ?? (move?.to ? { regions: [move.to], tone: regionView(view, move.to).owner === view.me ? "move" : "battle" } : null),
    [replayEvent, highlight, move, view],
  );
  // Rings for whatever you're doing: where troops can leave from, where they can go, or what thunder can hit.
  const boardMarks = useMemo(() => {
    const marks: Record<string, MarkKind> = {};
    if (thunder) {
      for (const id of thunderTargets) marks[id] = "thunder";
    } else if (move && myTurn) {
      if (!move.from) {
        for (const r of moveSources(view)) marks[r.id] = "source";
      } else if (move.to) {
        marks[move.to] = !usableLine(view, move.from, move.to) ? "build" : regionView(view, move.to).owner === view.me ? "move" : "attack";
      } else {
        const { lines, build } = moveOptions(view, move.from);
        for (const n of build) marks[n] = "build";
        for (const n of lines) marks[n] = regionView(view, n).owner === view.me ? "move" : "attack";
      }
    }
    return marks;
  }, [thunder, thunderTargets, move, myTurn, view]);
  // Name tags: where troops are moving from and to (with your odds), what a replay is about, or what you picked.
  const boardLabels = useMemo<BoardLabel[]>(() => {
    if (replayRegion) return [{ id: replayRegion, text: regionName(view, replayRegion) }];
    if (thunder) return [];
    if (!move) {
      const named: BoardLabel[] = view.regions.filter((r) => r.name).map((r) => ({ id: r.id, text: r.name!, tone: "named" }));
      return selected && !named.some((l) => l.id === selected) ? [...named, { id: selected, text: regionName(view, selected) }] : named;
    }
    if (!move.from) return [];
    const from = move.from;
    const labels: BoardLabel[] = [{ id: from, text: `From ${regionName(view, from)}`, tone: "source" }];
    const ready = restedIn(regionView(view, from));
    for (const [id, kind] of Object.entries(boardMarks)) {
      if (kind === "move") labels.push({ id, text: `➡️ ${regionName(view, id)}`, tone: kind });
      else if (kind === "attack") {
        // The odds of sending everyone ready; once you pick who goes, the bar has the exact number.
        const odds = !move.to && unitTotal(ready) ? attackOdds(view, from, id, ready, 120) : null;
        labels.push({ id, text: `⚔️ ${regionName(view, id)}${odds ? ` · ${Math.round(odds.win * 100)}%` : ""}`, tone: kind });
      } else if (id === move.to) labels.push({ id, text: `🚡 ${regionName(view, id)}`, tone: kind });
    }
    return labels;
  }, [replayRegion, thunder, move, selected, view, boardMarks]);
  const renaming = renameAsk && myTurn && !battle && !dice && view.regions.some((r) => r.id === renameAsk && r.renamable) ? renameAsk : null;

  return (
    <main className="game">
      <div className="game-stage">
        {!ready && <div className="world-fallback"><p className="eyebrow">Loading the world…</p></div>}
        <SceneBoundary fallback={<p className="notice">This device can&rsquo;t show 3D. Try a newer browser.</p>}>
          <Board
            view={view}
            selected={selected}
            marks={boardMarks}
            labels={boardLabels}
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
                    const last = rollShow(game.events, null, view.me);
                    if (last) setDice({ show: last, live: false });
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
        <div className="goods-extras">
          <button type="button" className="your-land" onClick={showMyLand} title="Fly to each of your regions in turn">
            <FlagIcon color={me.color} mine size={22} />
            <span>
              Your land: <strong>{me.regions}</strong> region{me.regions === 1 ? "" : "s"}
            </span>
          </button>
          <Glossary />
        </div>
      </div>

      {over && <GameOver view={view} avatars={game.avatars} endedAt={game.endedAt} />}

      <div className="game-prompts">
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

        {renaming && <RenameCard key={renaming} ctx={ctx} id={renaming} onClose={() => setRenameAsk(null)} />}
      </div>

      {!panelOpen && !move && (
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
                  startMove={(from) => startMove(from)}
                  startThunder={() => {
                    stopMove();
                    setThunder(true);
                  }}
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

      <div className={`game-bottom${move ? " moving" : ""}`}>
        {over ? (
          <Link className="btn end-turn" href="/game">🎲 Start a new game</Link>
        ) : myTurn && move ? (
          <MoveBar ctx={ctx} from={move.from} to={move.to} note={moveNote} pick={pickMove} setNote={setMoveNote} onStop={stopMove} />
        ) : myTurn ? (
          <div className="turn-actions">
            <button className="btn move-troops" disabled={busy} onClick={() => startMove(sel?.owner === view.me ? selected : null)}>
              🚡 Move troops
            </button>
            <button className="btn end-turn" disabled={busy} onClick={endTurn}>
              End turn ⏭
            </button>
          </div>
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
      {dice && <DiceRoll key={`${dice.show.seq}-${dice.live}`} show={dice.show} view={view} live={dice.live} still={still} onClose={closeDice} />}
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
