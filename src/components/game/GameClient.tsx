"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fillCost } from "@/game/advisor";
import type { Action, GameEvent } from "@/game/engine";
import { describeOutcome, type OutcomeTone } from "@/game/outcomes";
import { REGION_BY_ID, type Resource } from "@/game/regions";
import { rollShow, type RollShow } from "@/game/rollReport";
import type { BuildingType, Cost } from "@/game/rules";
import { afterAction, choicesAt, isHub, openRegion, pick, placeOf, planOf, promptFor, type Page } from "@/game/turnFlow";
import { attackTargets, buildWhere, dragRoutes, regionIn } from "@/game/turnOptions";
import type { GamePayload } from "@/lib/game/store";
import { useReducedMotion } from "@/lib/hooks";
import { Avatar } from "../Avatar";
import { SceneBoundary } from "../SceneBoundary";
import { canReplay } from "@/game/battleScript";
import { BattleView } from "./BattleView";
import { DiceRoll } from "./DiceRoll";
import { ChatPanel, channelOf, type Channel } from "./ChatPanel";
import type { BoardLabel, Built, Burst, Highlight, Placing } from "./Board";
import { Glossary, GoodsBar, affordable } from "./bits";
import { GameOver } from "./GameOver";
import { LogPanel, meOf, playerName, regionName, type Ctx } from "./panels";
import { attackCost, ballotsDue, tribunalSits } from "@/game/tribunal";
import { HowToPlay } from "./HowToPlay";
import { TribunalPills } from "./Tribunal";
import { ArmyPanel } from "./ArmyPanel";
import { MapKey } from "./MapKey";
import { TerritoryBar } from "./TerritoryBar";
import { TurnMenu } from "./turn/TurnMenu";
import type { Turn } from "./turn/kit";
import { useGame } from "./useGame";

const Board = dynamic(() => import("./Board"), { ssr: false, loading: () => null });

type Tab = "turn" | "army" | "chat" | "log";

// How long each of the other Kirds' moves stays on screen, so there's time to read it.
const FEED_MS = 8500;
// On phones the panel covers the bottom of the screen, so the camera aims this many degrees south of the action,
// which lifts it into the band of globe between the prompts and the buttons above the panel.
const PHONE_RAISE = 6;
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
  trial: "battle",
};

// How a result lights up the map.
const OUTCOME_TONE: Record<OutcomeTone, Highlight["tone"]> = {
  win: "build",
  loss: "battle",
  build: "build",
  move: "move",
  recruit: "build",
  hero: "hero",
  deal: "info",
  bank: "info",
  info: "info",
};

// What each kind of choice on the map is labelled with.
const CHOICE_ICON = { source: "", move: "➡️", attack: "⚔️", build: "🚡", thunder: "⚡", site: "🏗️" } as const;

// Buys whatever resources are missing (with Coin, at most 20 at a time), then does the action. Returns its events, or false.
async function perform(ctx: Ctx, action: Action, cost?: Cost) {
  const goods = meOf(ctx.view).goods ?? {};
  if (cost && !affordable(cost, goods)) {
    const plan = fillCost(goods, cost, ctx.view.prices.buyPrice);
    if (!plan) return false;
    for (const [g, n] of Object.entries(plan.buy)) {
      for (let left = n as number; left > 0; left -= 20) {
        if (!(await ctx.act({ type: "buy", good: g as Resource, count: Math.min(20, left) }))) return false;
      }
    }
  }
  return ctx.act(action);
}

const HOME: Page[] = [{ step: "home" }];
const onPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

export function GameClient({ initial }: { initial: GamePayload }) {
  const { game, act: rawAct, send, loadOlder, olderDone, busy, error, savedAt, clearError } = useGame(initial);
  const router = useRouter();
  const { view } = game;
  const me = meOf(view);
  const active = view.players.find((p) => p.seat === view.activeSeat)!;
  const over = game.status === "complete";
  const myTurn = !over && active.id === view.me;
  const still = useReducedMotion();

  // The turn menu is a stack of pages: Back pops one. `n` changes on every move through it, so each page starts
  // fresh. The menu itself is always at the bottom, so there's always a way home.
  const [nav, setNav] = useState<{ stack: Page[]; n: number }>({ stack: HOME, n: 0 });
  const move = useCallback(
    (f: (s: Page[]) => Page[]) =>
      setNav((v) => {
        const next = f(v.stack);
        return { stack: next[0]?.step === "home" ? next : [...HOME, ...next], n: v.n + 1 };
      }),
    [],
  );
  const top = nav.stack.at(-1)!;
  const [tab, setTab] = useState<Tab>("turn");
  const [focus, setFocus] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [flash, setFlash] = useState<Burst | null>(null);
  const [allNames, setAllNames] = useState(false);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [emailOn, setEmailOn] = useState(initial.notify.on);
  const [battle, setBattle] = useState<GameEvent | null>(null);
  const [menu, setMenu] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // The building you just put up, so the globe raises it out of the ground (only for as long as that takes,
  // so it never plays twice).
  const [built, setBuilt] = useState<Built | null>(null);
  useEffect(() => {
    if (!built) return;
    const t = setTimeout(() => setBuilt(null), 3200);
    return () => clearTimeout(t);
  }, [built]);

  // Every move goes through here so a battle you just fought plays out on screen, a new name is announced, and a
  // building you just put up rises on the globe.
  const act: typeof rawAct = useCallback(
    async (a) => {
      const evs = await rawAct(a);
      if (evs) {
        const fought = evs.find((e) => canReplay(e) && e.actor === view.me);
        if (fought) setBattle(fought);
        const renamed = evs.find((e) => e.type === "rename" && e.actor === view.me);
        if (renamed) setToast(renamed.text);
        const b = evs.find((e) => e.type === "build" && e.actor === view.me && e.regions[0]);
        if (b) setBuilt({ region: b.regions[0], building: b.data?.building as BuildingType, seq: b.seq });
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

  // Flies the camera to a region, or halfway between two. `raise` aims that many degrees south of the spot, so it
  // sits above the middle of the screen (clear of the panel along the bottom on phones).
  // The region the camera last flew to.
  const lookingAt = useRef<string | null>(null);
  const focusOn = useCallback((id: string, also?: string | null, raise = 0) => {
    const a = REGION_BY_ID.get(id);
    const b = also ? REGION_BY_ID.get(also) : undefined;
    if (!a) return;
    lookingAt.current = id;
    let { lat, lng } = a;
    if (b) {
      // Halfway along the great circle, so both regions stay on screen.
      const v = (d: { lat: number; lng: number }) => {
        const [la, ln] = [(d.lat * Math.PI) / 180, (d.lng * Math.PI) / 180];
        return [Math.cos(la) * Math.cos(ln), Math.cos(la) * Math.sin(ln), Math.sin(la)];
      };
      const [x, y, z] = v(a).map((n, i) => n + v(b)[i]);
      lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
      lng = (Math.atan2(y, x) * 180) / Math.PI;
    }
    setFocus({ lat: Math.max(-85, lat - raise), lng, seq: Date.now() });
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

  // When a new turn of yours starts: announce it and open the menu. Track the turn number, not just whose turn
  // it is: against computer players the turn comes straight back to you in the same request.
  const [seenTurn, setSeenTurn] = useState(view.turn);
  if (view.turn !== seenTurn) {
    setSeenTurn(view.turn);
    if (myTurn) {
      setNav((v) => ({ stack: HOME, n: v.n + 1 }));
      setToast("🎲 It's your turn!");
      setReplayOffered(false);
      setTab("turn");
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

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  // Every page of the menu starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [nav.n]);

  // Esc cancels the action you're in, back to where you started it (unless a dialog wants the key itself).
  useEffect(() => {
    if (!placeOf(top)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      move((s) => s.slice(0, s.reduce((at, p, i) => (isHub(p) ? i : at), 0) + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, move]);

  // ---- the turn menu and the globe ----
  // Turns the globe to what a page is about: both ends of a move or attack, the region it's about, or, when a
  // step asks you to pick a region, its first choice (unless you're already looking at one of them).
  const flyFor = useCallback(
    (p: Page) => {
      const raise = onPhone() ? PHONE_RAISE : 0;
      const plan = planOf(p, view);
      if (plan) return focusOn(plan.from ?? plan.to, plan.from ? plan.to : null, raise);
      const options = [...choicesAt(p, view).keys()];
      if (options.length && !options.includes(lookingAt.current ?? "")) focusOn(options[0], null, raise);
    },
    [view, focusOn],
  );

  const showRegion = useCallback(
    (id: string, fly = false) => {
      move((s) => openRegion(s, id));
      setTab("turn");
      setPanelOpen(true);
      if (fly) focusOn(id, null, onPhone() ? PHONE_RAISE : 0);
    },
    [move, focusOn],
  );

  // Clicking the globe: a choice when the current step asks for a region (those are ringed), otherwise that region's page.
  const onSelect = useCallback(
    (id: string) => {
      const next = pick(top, id, view);
      if (next) {
        move((s) => [...s, next]);
        setTab("turn");
        setPanelOpen(true);
        flyFor(next);
        return;
      }
      showRegion(id);
    },
    [top, view, move, showRegion, flyFor],
  );
  const onReady = useCallback(() => setReady(true), []);

  // Dropping an army you dragged on the globe: straight to "who goes", for a move or an attack. Anything you were
  // half-way through gives way, and Back steps through the earlier choices as if you'd made them in the menu.
  const onDrop = useCallback(
    (from: string, to: string) => {
      const steps: Page[] =
        regionIn(view, to)?.owner === view.me
          ? [{ step: "moveFrom" }, { step: "moveTo", from }, { step: "moveTroops", from, to }]
          : [{ step: "attackTarget" }, { step: "attackFrom", target: to }, { step: "attackTroops", target: to, from }];
      move((s) => [...s.slice(0, s.reduce((at, p, i) => (isHub(p) ? i : at), 0) + 1), ...steps]);
      setTab("turn");
      setPanelOpen(true);
      focusOn(from, to, onPhone() ? PHONE_RAISE : 0);
    },
    [view, move, focusOn],
  );

  const ctx: Ctx = { view, myTurn, busy, act, avatars: game.avatars, over };
  const closeDice = useCallback(() => setDice(null), []);

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
      move(() => HOME);
      setToast(view.players.some((p) => p.bot) ? "Turn ended. The computer players are moving…" : "Turn ended. The Kirds have been summoned.");
    }
  };

  // Does an action and shows what happened, or, mid-way through another action (a line built so troops can go),
  // carries on to `then`, as long as you're still on the page it started from.
  const run = async (action: Action, opts: { cost?: Cost; then?: Page } = {}) => {
    const started = top;
    const before = view;
    const events = await perform(ctx, action, opts.cost);
    if (!events) return false;
    // Turn the globe to where it happened.
    const at = "region" in action ? action.region : "target" in action ? action.target : "to" in action ? action.to : null;
    if (typeof at === "string" && REGION_BY_ID.has(at)) focusOn(at, null, onPhone() ? PHONE_RAISE : 0);
    if (opts.then) {
      const then = opts.then;
      move((s) => (s.at(-1) === started ? [...s.slice(0, -1), then] : s));
      if (action.type === "gondola") {
        setFlash({ key: `line-${Date.now()}`, region: action.to, text: "🚡 Line open!", tone: "build" });
        setToast(`🚡 Gondola line open: ${regionName(view, action.from)} ⇄ ${regionName(view, action.to)}`);
      }
    } else {
      move((s) => afterAction(s, { step: "done", action, events, before }));
    }
    return true;
  };

  const openPage = (p: Page) => {
    if (top.step !== p.step) move((s) => [...s, p]);
    setTab("turn");
    setPanelOpen(true);
  };

  // "Move troops" by End turn: from the region you're looking at, if troops can leave it; otherwise pick where from.
  const startMove = () => {
    const from = top.step === "region" && regionIn(view, top.id)?.owner === view.me ? top.id : null;
    openPage(from ? { step: "moveTo", from } : { step: "moveFrom" });
  };

  const turn: Turn = {
    ...ctx,
    stack: nav.stack,
    go: (p, current) => {
      move((s) => [...(current ? [...s.slice(0, -1), current] : s), p]);
      flyFor(p);
    },
    back: () => move((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    popTo: (i) => move((s) => s.slice(0, i + 1)),
    showRegion,
    run,
    endTurn,
    setAutopilot: (on, level) => void setAutopilot(on, level),
    openChat: (id) => {
      setChannel(id);
      setTab("chat");
    },
    name: (id) => regionName(view, id),
    activeName: `${active.bot ? "🤖 " : ""}${active.name}`,
  };

  const pendingOffers = view.offers.filter((o) => o.to === view.me).length;
  // Trials still waiting for your vote count as things to answer, like offers.
  const answers = pendingOffers + (over ? 0 : ballotsDue(view).length);

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

  // What the globe shows for the current page: ringed choices, the plan's arrow, the region you're looking at,
  // and after an action, where it happened.
  const outcome = useMemo(() => (top.step === "done" ? describeOutcome(top.action, top.before, view, top.events) : null), [top, view]);
  const choices = useMemo(() => choicesAt(top, view), [top, view]);
  const marks = useMemo(() => Object.fromEntries(choices), [choices]);
  const plan = useMemo(() => planOf(top, view), [top, view]);
  const prompt = promptFor(top);
  const selected = top.step === "region" ? top.id : plan && !plan.from ? plan.to : null;
  const route = useMemo(() => (plan?.from ? { from: plan.from, to: plan.to, tone: plan.tone } : null), [plan]);
  const bursts = useMemo(
    () => [
      ...(outcome?.burst && outcome.regions.length ? [{ key: `done-${nav.n}`, region: outcome.regions.at(-1)!, text: outcome.burst, tone: OUTCOME_TONE[outcome.tone] }] : []),
      ...(flash ? [flash] : []),
    ],
    [outcome, flash, nav.n],
  );

  // Choosing where a building goes: a see-through one bobs over each region it could go in, solid once picked.
  const placing = useMemo<Placing | null>(() => {
    if (top.step === "buildWhere") return { type: top.building, sites: buildWhere(view, top.building), site: null };
    if (top.step === "buildReview") return { type: top.building, sites: [top.region], site: top.region };
    return null;
  }, [top, view]);
  // Armies you can pick up and drag to a neighbour: rested troops with a gondola line to ride.
  const movable = useMemo(() => (myTurn && !busy && !placing ? dragRoutes(view) : new Map<string, string[]>()), [myTurn, busy, placing, view]);

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
        : outcome && outcome.regions.length
          ? { regions: outcome.regions, tone: OUTCOME_TONE[outcome.tone] }
          : plan && !plan.from
            ? { regions: [plan.to], tone: plan.tone }
            : highlight,
    [replayEvent, outcome, plan, highlight],
  );
  // Another Kird's building rises during the replay too.
  const boardBuilt = useMemo<Built | null>(
    () =>
      replayEvent?.type === "build" && replayEvent.regions[0]
        ? { region: replayEvent.regions[0], building: replayEvent.data?.building as BuildingType, seq: replayEvent.seq }
        : built,
    [replayEvent, built],
  );
  // Name tags beyond your own regions' (which always have theirs): conquerors' new names, the region you're
  // looking at, every name if you asked for them, and what each choice at this step does, with your odds.
  const labels = useMemo<BoardLabel[]>(() => {
    if (replayRegion) return [{ id: replayRegion, text: regionName(view, replayRegion) }];
    const out = new Map<string, BoardLabel>();
    for (const r of view.regions) {
      if (r.owner === view.me) continue;
      if (r.name) out.set(r.id, { id: r.id, text: r.name, tone: "named" });
      else if (allNames && !r.fog) out.set(r.id, { id: r.id, text: regionName(view, r.id) });
    }
    if (selected && regionIn(view, selected)?.owner !== view.me && !out.has(selected)) out.set(selected, { id: selected, text: regionName(view, selected) });
    const odds =
      top.step === "attackTarget" ? new Map(attackTargets(view, { from: top.from }).map((t) => [t.id, t.best?.odds ? Math.round(t.best.odds.win * 100) : null])) : null;
    for (const [id, kind] of choices) {
      const r = regionIn(view, id);
      if (r?.owner === view.me || !CHOICE_ICON[kind]) continue;
      const pct = kind === "attack" ? odds?.get(id) : null;
      // ⚖️: taking it would put you on trial for war crimes.
      const trial = (kind === "attack" || kind === "build" || kind === "thunder") && tribunalSits(view) && attackCost(view, r?.owner)?.trial;
      out.set(id, { id, text: `${CHOICE_ICON[kind]} ${regionName(view, id)}${pct != null ? ` · ${pct}%` : ""}${trial ? " ⚖️" : ""}`, tone: kind });
    }
    return [...out.values()];
  }, [replayRegion, view, allNames, selected, top, choices]);

  return (
    <main className="game">
      <div className="game-stage">
        {!ready && <div className="world-fallback"><p className="eyebrow">Loading the world…</p></div>}
        <SceneBoundary fallback={<p className="notice">This device can&rsquo;t show 3D. Try a newer browser.</p>}>
          <Board
            view={view}
            selected={selected}
            marks={marks}
            labels={labels}
            highlight={boardHighlight}
            route={route}
            bursts={bursts}
            myTurn={myTurn}
            focus={boardFocus}
            still={still}
            placing={placing}
            built={boardBuilt}
            movable={movable}
            onSelect={onSelect}
            onDrop={onDrop}
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
        <TerritoryBar view={view} myTurn={myTurn} selected={selected} onPick={(id) => showRegion(id, true)} />
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
        {!over && <TribunalPills view={view} onOpen={() => openPage({ step: "diplomacy" })} />}
        <div className="hud-keys">
          <Glossary />
          <MapKey view={view} allNames={allNames} setAllNames={setAllNames} />
        </div>
      </div>

      {over && <GameOver view={view} avatars={game.avatars} endedAt={game.endedAt} />}

      <div className="game-prompts">
        {!over && unseen.length > 0 && !replay && !replayOffered && !prompt && (
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

        {prompt && !replay && (
          <div className="map-prompt" role="status">
            <span aria-hidden="true">👆</span>
            <p>
              {prompt}
              {choices.size === 0 && " (none right now)"}
            </p>
            <button className="btn ghost small" onClick={() => move((s) => s.slice(0, -1))}>Back</button>
          </div>
        )}
      </div>

      {!panelOpen && (
        <button className="panel-restore" onClick={() => setPanelOpen(true)} aria-label="Show the actions panel">
          ▴ Actions
          {answers + unreadTotal > 0 && <span className="dot-count">{answers + unreadTotal}</span>}
        </button>
      )}

      <aside className={`game-panel${panelOpen ? "" : " closed"}`} hidden={!panelOpen}>
        <button className="panel-grip" onClick={() => setPanelOpen(false)} aria-label="Minimize the panel to see the map">
          <span aria-hidden="true" className="grip-bar" />▾ Minimize to see the map
        </button>
        <nav className="panel-tabs" aria-label="Panels">
          {(
            [
              ["turn", "🎯", "Actions"],
              ["army", "⚔️", "Army"],
              ["chat", "💬", "Chat"],
              ["log", "📜", "Log"],
            ] as [Tab, string, string][]
          ).map(([t, icon, label]) => (
            <button key={t} className={tab === t ? "on" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); setPanelOpen(true); }}>
              <span aria-hidden="true">{icon}</span> {label}
              {t === "turn" && answers > 0 && <span className="dot-count">{answers}</span>}
              {t === "chat" && unreadTotal > 0 && <span className="dot-count">{unreadTotal}</span>}
            </button>
          ))}
          <button className="panel-toggle" onClick={() => setPanelOpen(false)} aria-label="Minimize the panel" title="Minimize to see the map">
            ▾
          </button>
        </nav>
        {/* The menu stays mounted (just hidden) on other tabs and while minimized, so half-made choices survive. */}
        <div className="panel-scroll" ref={scroller}>
          <div hidden={tab !== "turn"}>
            <TurnMenu turn={turn} pageKey={nav.n} />
          </div>
          {panelOpen && tab === "army" && (
            <ArmyPanel
              ctx={ctx}
              events={game.events}
              onManage={(id) => showRegion(id, true)}
              onWatch={setBattle}
              openHeroes={() => openPage({ step: "heroes" })}
            />
          )}
          {panelOpen && tab === "chat" && (
            <ChatPanel view={view} messages={game.messages} avatars={game.avatars} channel={channel} setChannel={setChannel} unread={unread} send={send} />
          )}
          {panelOpen && tab === "log" && (
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
      </aside>

      <div className="game-bottom">
        {over ? (
          <Link className="btn end-turn" href="/game">🎲 Start a new game</Link>
        ) : myTurn ? (
          <div className="turn-actions">
            <button className="btn move-troops" disabled={busy} onClick={startMove}>
              🚡 Move troops
            </button>
            <button className="btn end-turn" disabled={busy} onClick={() => openPage({ step: "end" })}>
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
