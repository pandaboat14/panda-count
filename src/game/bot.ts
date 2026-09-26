// Computer-controlled Kirds. A bot plays its whole turn through applyAction, so it follows exactly
// the same rules as people do; anything illegal simply fails and the bot moves on.
// Easy bots are timid and wasteful, medium bots play a sensible economy and pick good fights,
// hard bots simulate battles before committing, trade at the bank, hire heroes and gang up on humans.

import { NEIGHBORS, REGION_BY_ID, lineId } from "./regions";
import {
  BUILDINGS,
  GOODS,
  HEROES,
  HERO_IDS,
  RESOURCES,
  UNITS,
  UNIT_TYPES,
  type BuildingType,
  type Cost,
  type Good,
  type HeroId,
  type UnitType,
} from "./rules";
import {
  GameError,
  activePlayer,
  applyAction,
  battle,
  bankRate,
  emptyUnits,
  gondolaCost,
  heroCost,
  inPact,
  lineUsable,
  ownedRegions,
  unitCost,
  unitTotal,
  visibleRegions,
  type Action,
  type BotLevel,
  type GameEvent,
  type GameState,
  type Player,
  type RegionState,
  type Units,
} from "./engine";

export const BOT_NAMES = [
  "Sir Bamboozle",
  "Ogretron 3000",
  "CAM-bot",
  "Pandamonium",
  "Gondola Gary",
  "Bao Bot",
  "Kung Fu Circuit",
  "Chairman Meow",
];

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

type Style = {
  // Attack when our expected strength beats theirs by this much (easy/medium)…
  ratio: number;
  // …or, for hard bots, when this many simulated battles out of 100 are wins.
  winPct: number;
  sims: number;
  attackChance: number;
  maxAttacks: number;
  maxRecruits: number;
  bankTrades: number;
  heroes: number; // chance per turn to hire an affordable hero
  build: number; // chance per turn to put up a building
  arm: boolean;
  consolidate: boolean;
  preferHumans: boolean;
};

const STYLE: Record<BotLevel, Style> = {
  easy: { ratio: 2.6, winPct: 0, sims: 0, attackChance: 0.45, maxAttacks: 1, maxRecruits: 2, bankTrades: 0, heroes: 0, build: 0.3, arm: false, consolidate: false, preferHumans: false },
  medium: { ratio: 1.6, winPct: 0, sims: 0, attackChance: 0.85, maxAttacks: 2, maxRecruits: 5, bankTrades: 2, heroes: 0.5, build: 0.7, arm: true, consolidate: true, preferHumans: false },
  hard: { ratio: 0, winPct: 62, sims: 40, attackChance: 1, maxAttacks: 4, maxRecruits: 10, bankTrades: 4, heroes: 1, build: 1, arm: true, consolidate: true, preferHumans: true },
};

// Rough worth of each good, for judging trades.
const WORTH: Record<Good, number> = { bamboo: 1, stone: 1, iron: 1.2, rice: 1, gems: 1.5, coin: 0.5, pandaCoin: 1, camCoin: 2 };
const worth = (c: Cost) => GOODS.reduce((n, g) => n + (c[g] ?? 0) * WORTH[g], 0);

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const affordable = (p: Player, c: Cost) => GOODS.every((g) => p.goods[g] >= (c[g] ?? 0));
const rested = (r: RegionState): Units => {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) u[t] = Math.max(0, r.units[t] - r.tired[t]);
  return u;
};

function heroBonusAt(s: GameState, pid: string, regionId: string) {
  return HERO_IDS.reduce((n, h) => n + (s.heroes[h].owner === pid && s.heroes[h].region === regionId ? HEROES[h].combatBonus : 0), 0);
}

// Expected dice total of a side, a quick stand-in for simulating the fight.
function power(u: Units, stat: "attack" | "defense", bonus: number) {
  return UNIT_TYPES.reduce((n, t) => n + u[t] * (3.5 + UNITS[t][stat] + bonus), 0);
}

// The region holding the biggest army.
function base(s: GameState, id: string) {
  return ownedRegions(s, id).sort((a, b) => unitTotal(b.units) - unitTotal(a.units))[0];
}

// True when the main army has fewer than two gondola lines leading into hostile land.
function needsLine(s: GameState, id: string) {
  const b = base(s, id);
  if (!b) return false;
  return NEIGHBORS.get(b.id)!.filter((n) => s.regions[n].owner !== id && lineUsable(s, id, b.id, n)).length < 2;
}

const minus = (have: Record<Good, number>, c: Cost) =>
  Object.fromEntries(GOODS.map((g) => [g, have[g] - (c[g] ?? 0)])) as Record<Good, number>;

// Plays the active bot's whole turn, ending it. Returns everything that happened.
export function playBotTurn(s: GameState, now: number): GameEvent[] {
  const me = activePlayer(s);
  if (!me?.bot) return [];
  const style = STYLE[me.bot];
  const roll = rng((s.rng ^ (s.turn * 7919) ^ (me.seat * 104729)) >>> 0);
  const out: GameEvent[] = [];
  const self = () => s.players.find((p) => p.id === me.id)!;
  const tryAct = (a: Action) => {
    try {
      out.push(...applyAction(s, me.id, a, now));
      return true;
    } catch (e) {
      if (e instanceof GameError) return false;
      throw e;
    }
  };

  answerOffers(s, self, style, roll, tryAct);
  heroPowers(s, self, style, tryAct);
  if (style.bankTrades) bankUp(s, self, style, tryAct);
  // Fight with what's rested first, then spend what's left on the future.
  if (roll() < style.attackChance) expand(s, self, style, roll, tryAct);
  if (style.bankTrades) layLine(s, self, tryAct);
  if (roll() < style.heroes) hireHero(s, self, tryAct);
  if (roll() < style.build) putUpBuilding(s, self, me.bot, tryAct);
  recruit(s, self, style, tryAct);
  if (style.consolidate) consolidate(s, self, tryAct);

  // Always hand the turn on, even if the bot couldn't afford to do anything.
  if (activePlayer(s).id === me.id) tryAct({ type: "endTurn" });
  return out;
}

// Plays computer turns until it's a person's turn again (or a safety limit is hit).
export function runBots(s: GameState, now: number, limit = 24): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < limit; i++) {
    const p = activePlayer(s);
    if (!p?.bot || !s.players.some((q) => !q.bot)) break;
    out.push(...playBotTurn(s, now));
  }
  return out;
}

type Act = (a: Action) => boolean;

function answerOffers(s: GameState, me: () => Player, style: Style, roll: () => number, act: Act) {
  for (const o of s.offers.filter((x) => x.to === me().id)) {
    let yes = false;
    if (o.kind === "loan") yes = true; // free PandaCoin for both of us
    else if (o.kind === "pact") {
      const them = ownedRegions(s, o.from).length;
      const mine = ownedRegions(s, me().id).length;
      yes = style.preferHumans ? them >= mine : roll() < 0.6;
    } else {
      const fair = style.preferHumans ? 1.2 : style.bankTrades ? 1 : 0.8;
      yes = affordable(me(), o.get) && worth(o.give) >= worth(o.get) * fair;
    }
    act({ type: "respond", offerId: o.id, accept: yes });
  }
}

function heroPowers(s: GameState, me: () => Player, style: Style, act: Act) {
  const id = me().id;
  const vis = visibleRegions(s, id);
  if (s.heroes.casey.owner === id && me().thunderReadyTurn <= s.turn) {
    const target = Object.values(s.regions)
      .filter((r) => vis.has(r.id) && r.owner !== id && (!r.owner || !inPact(s, id, r.owner)) && unitTotal(r.units) > 0)
      .sort((a, b) => score(b) - score(a))[0];
    if (target) act({ type: "thunder", target: target.id });
  }
  if (s.heroes.josserkid.owner === id && me().pickpocketTurn !== s.turn) {
    const victim = s.players
      .filter((p) => p.id !== id && !inPact(s, id, p.id) && ownedRegions(s, p.id).some((r) => vis.has(r.id)))
      .sort((a, b) => RESOURCES.reduce((n, g) => n + b.goods[g], 0) - RESOURCES.reduce((n, g) => n + a.goods[g], 0))[0];
    if (victim) act({ type: "pickpocket", target: victim.id });
  }
  function score(r: RegionState) {
    const human = r.owner && !s.players.find((p) => p.id === r.owner)?.bot;
    return unitTotal(r.units) + (style.preferHumans && human ? 5 : 0) + (r.owner ? 2 : 0);
  }
}

// Swap whatever is piled up for whatever is missing for the next gondola or army.
function bankUp(s: GameState, me: () => Player, style: Style, act: Act) {
  const want: Cost = needsLine(s, me().id) ? { ...gondolaCost(s, me().id) } : { ...unitCost(s, me().id, "panda") };
  for (let i = 0; i < style.bankTrades; i++) {
    const p = me();
    const rate = bankRate(s, p.id);
    const missing = RESOURCES.find((g) => p.goods[g] < (want[g] ?? 0));
    if (!missing) break;
    const spare = RESOURCES.filter((g) => g !== missing && p.goods[g] - (want[g] ?? 0) >= rate).sort((a, b) => p.goods[b] - p.goods[a])[0];
    if (!spare || !act({ type: "bankTrade", give: spare, get: missing })) break;
  }
  // PandaCoin piles up; turn the spare into Coin (ogre wages, markets) and CamCoin (CAMs, Casey).
  for (let i = 0; i < 4 && me().goods.pandaCoin > 8; i++) {
    const p = me();
    const wantsCam = p.goods.camCoin < 10 && (style.preferHumans || ownedRegions(s, p.id).some((r) => r.buildings.includes("gym")));
    if (!act(wantsCam && i % 2 === 0 ? { type: "exchange", from: "pandaCoin", to: "camCoin" } : { type: "exchange", from: "pandaCoin", to: "coin" })) break;
  }
  if (me().goods.coin < 3 && me().goods.pandaCoin >= 2) act({ type: "exchange", from: "pandaCoin", to: "coin" });
}

const HERO_PRIORITY: HeroId[] = ["casey", "cockpenis", "ping", "piecer", "josserkid"];

function hireHero(s: GameState, me: () => Player, act: Act) {
  const h = HERO_PRIORITY.find((x) => !s.heroes[x].owner && affordable(me(), heroCost(s, x)));
  if (h) act({ type: "recruitHero", hero: h, region: frontline(s, me().id)?.id ?? me().capital });
}

function putUpBuilding(s: GameState, me: () => Player, level: BotLevel, act: Act) {
  const id = me().id;
  const mine = ownedRegions(s, id);
  const plan: [BuildingType, RegionState | undefined][] = [
    ["market", mine.find((r) => r.id === me().capital)],
    ["fort", level === "easy" ? undefined : frontline(s, id)],
    ["sanctuary", mine.find((r) => !r.buildings.includes("sanctuary"))],
    ["gym", level === "hard" ? mine.find((r) => !r.buildings.includes("gym")) : undefined],
  ];
  for (const [b, r] of plan) {
    if (r && !r.buildings.includes(b) && affordable(me(), BUILDINGS[b].cost)) {
      act({ type: "build", region: r.id, building: b });
      return;
    }
  }
}

// The owned region with the most hostile neighbours: where armies should gather.
function frontline(s: GameState, id: string) {
  const hostile = (r: RegionState) => NEIGHBORS.get(r.id)!.filter((n) => s.regions[n].owner !== id).length;
  return ownedRegions(s, id).sort((a, b) => hostile(b) - hostile(a) || unitTotal(b.units) - unitTotal(a.units))[0];
}

function recruit(s: GameState, me: () => Player, style: Style, act: Act) {
  const id = me().id;
  const front = frontline(s, id);
  if (!front) return;
  // Don't eat the materials for the gondola the army is waiting on.
  const reserve = needsLine(s, id) ? gondolaCost(s, id) : {};
  let made = 0;
  const order: ("cam" | "nacam" | "panda")[] = ["cam", "nacam", "panda"];
  while (made < style.maxRecruits) {
    const p = me();
    const pick = order.find((t) => {
      if (t === "cam" && !front.buildings.includes("gym")) return false;
      // Keep enough coin to pay every ogre next turn.
      if (t === "nacam") {
        const ogres = ownedRegions(s, id).reduce((n, r) => n + r.units.nacam, 0);
        if (p.goods.coin - (unitCost(s, id, "nacam").coin ?? 0) < ogres + 1) return false;
      }
      return GOODS.every((g) => minus(p.goods, reserve)[g] >= (unitCost(s, id, t)[g] ?? 0));
    });
    if (!pick || !act({ type: "recruit", region: front.id, unit: pick, count: 1 })) break;
    made++;
  }
  if (style.arm && front.units.panda > 0 && affordable(me(), UNITS.armedPanda.cost)) {
    const n = Math.min(front.units.panda, me().goods.iron, me().goods.coin, 3);
    if (n > 0) act({ type: "arm", region: front.id, count: n });
  }
}

type Plan = { from: RegionState; to: RegionState; send: Units; value: number };

function expand(s: GameState, me: () => Player, style: Style, roll: () => number, act: Act) {
  const id = me().id;
  for (let attacks = 0; attacks < style.maxAttacks; attacks++) {
    const plans: Plan[] = [];
    for (const from of ownedRegions(s, id)) {
      const avail = rested(from);
      if (unitTotal(avail) === 0) continue;
      // Leave one defender behind when we can.
      const send = { ...avail };
      if (unitTotal(from.units) === unitTotal(avail) && unitTotal(send) > 1) {
        const keep = (["panda", "armedPanda", "nacam", "cam"] as UnitType[]).find((t) => send[t] > 0)!;
        send[keep] -= 1;
      }
      if (unitTotal(send) === 0) continue;
      for (const n of NEIGHBORS.get(from.id)!) {
        const to = s.regions[n];
        if (to.owner === id || (to.owner && inPact(s, id, to.owner))) continue;
        const odds = winChance(s, id, from, to, send, style);
        if (odds < (style.sims ? style.winPct / 100 : 1)) continue;
        const def = REGION_BY_ID.get(n)!;
        const human = to.owner && !s.players.find((p) => p.id === to.owner)?.bot;
        const hot = to.token === 6 || to.token === 8 ? 1.5 : to.token === 5 || to.token === 9 ? 1 : 0;
        const value = odds * 4 + hot + (to.owner ? 1 : 0) + (style.preferHumans && human ? 2 : 0) + (def.native === "pandas" ? 1 : 0) + roll();
        plans.push({ from, to, send, value });
      }
    }
    const best = plans.sort((a, b) => b.value - a.value)[0];
    if (!best) return;
    if (!lineUsable(s, id, best.from.id, best.to.id)) {
      if (s.lines[lineId(best.from.id, best.to.id)] || !act({ type: "gondola", from: best.from.id, to: best.to.id })) return;
    }
    if (!act({ type: "move", from: best.from.id, to: best.to.id, units: best.send })) return;
  }
}

// Build a gondola from where the biggest army stands toward its softest unlinked neighbour,
// so next turn's army has somewhere to go.
function layLine(s: GameState, me: () => Player, act: Act) {
  const id = me().id;
  if (!affordable(me(), gondolaCost(s, id))) return;
  const home = base(s, id);
  if (!home) return;
  const hostile = NEIGHBORS.get(home.id)!.filter((n) => s.regions[n].owner !== id && !(s.regions[n].owner && inPact(s, id, s.regions[n].owner!)));
  if (hostile.filter((n) => lineUsable(s, id, home.id, n)).length >= 2) return;
  const soft = (n: string) => {
    const to = s.regions[n];
    return power(to.units, "defense", to.buildings.includes("fort") ? 1 : 0) - (to.token === 6 || to.token === 8 ? 3 : 0);
  };
  const target = hostile.filter((n) => !s.lines[lineId(home.id, n)]).sort((a, b) => soft(a) - soft(b))[0];
  if (target) act({ type: "gondola", from: home.id, to: target });
}

// For easy/medium: 1 if the fight looks good enough, else 0. For hard: the share of simulated wins.
function winChance(s: GameState, id: string, from: RegionState, to: RegionState, send: Units, style: Style) {
  if (unitTotal(to.units) === 0) return 1;
  const atkBonus = heroBonusAt(s, id, from.id);
  const defBonus = (to.buildings.includes("fort") ? 1 : 0) + (to.owner ? heroBonusAt(s, to.owner, to.id) : 0);
  if (!style.sims) return power(send, "attack", atkBonus) >= power(to.units, "defense", defBonus) * style.ratio ? 1 : 0;
  let wins = 0;
  for (let i = 0; i < style.sims; i++) {
    const sim = { rng: (s.rng ^ (i * 2654435761)) | 0 } as GameState;
    if (battle(sim, send, atkBonus, { ...to.units }, defBonus).attackerWon) wins++;
  }
  return wins / style.sims;
}

// Walk rested troops from safe back-country regions toward the front along our own lines.
function consolidate(s: GameState, me: () => Player, act: Act) {
  const id = me().id;
  const front = frontline(s, id);
  if (!front) return;
  for (const r of ownedRegions(s, id)) {
    if (r.id === front.id) continue;
    const safe = (rid: string) => NEIGHBORS.get(rid)!.every((n) => s.regions[n].owner === id);
    if (!safe(r.id)) continue;
    // Only step onto a border region, so troops don't shuffle back and forth inland.
    const step = NEIGHBORS.get(r.id)!.find((n) => lineUsable(s, id, r.id, n) && s.regions[n].owner === id && !safe(n));
    const send = rested(r);
    if (step && unitTotal(send) > 0) act({ type: "move", from: r.id, to: step, units: send });
  }
}
