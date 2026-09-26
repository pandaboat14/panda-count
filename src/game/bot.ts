// Computer-controlled Kirds. A bot plays its whole turn through applyAction, so it follows exactly
// the same rules as people do; anything illegal simply fails and the bot moves on.
// Easy bots are timid and wasteful, medium bots play a sensible economy and pick good fights,
// hard bots simulate battles before committing, trade at the bank, hire heroes and gang up on humans.
// On the Tribunal's juries they vote with their interests, and they can be bought.

import { NEIGHBORS, REGION_BY_ID, lineId } from "./regions";
import {
  BUILDINGS,
  GOODS,
  HEROES,
  HERO_IDS,
  RESOURCES,
  TRIAL_AT,
  TRIAL_MIN_KIRDS,
  UNITS,
  UNIT_TYPES,
  type BuildingType,
  type Cost,
  type Good,
  type HeroId,
  type Sanction,
  type UnitType,
} from "./rules";
import {
  GameError,
  activePlayer,
  autoLevel,
  emit,
  applyAction,
  battle,
  bankRate,
  bloodthirst,
  buyPrice,
  emptyUnits,
  gondolaCost,
  heroCost,
  inPact,
  lineUsable,
  ownedRegions,
  recentCrimes,
  sanctioned,
  sizeUpAttack,
  trialFor,
  trialsOf,
  unitCost,
  unitTotal,
  visibleRegions,
  type Action,
  type BotLevel,
  type Crime,
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
  easy: { ratio: 2.2, winPct: 0, sims: 0, attackChance: 0.6, maxAttacks: 1, maxRecruits: 2, bankTrades: 1, heroes: 0, build: 0.3, arm: false, consolidate: false, preferHumans: false },
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
  const p = s.players.find((q) => q.id === pid);
  if (p && sanctioned(p, "heroes")) return 0;
  return HERO_IDS.reduce((n, h) => n + (s.heroes[h].owner === pid && s.heroes[h].region === regionId ? HEROES[h].combatBonus : 0), 0);
}

// How a juror leans before conscience (the dice) has its say: above 0.5 is guilty. Victims want justice,
// pact partners look away, everyone fears whoever is about to win or is bigger than them, a long list of
// charges hardens hearts, easy bots forgive, and hard bots side with fellow machines against people.
// People in command are assumed to convict, unless they're friends; on autopilot they judge like the computer.
function leaning(s: GameState, juror: Player, accused: Player, charges: Crime[]) {
  const hurt = charges.filter((c) => c.victim === juror.id).reduce((n, c) => n + c.points, 0);
  const charged = charges.reduce((n, c) => n + c.points, 0);
  let lean = hurt * 1.5 + Math.max(0, charged - TRIAL_AT) * 0.4;
  if (inPact(s, juror.id, accused.id)) lean -= 3;
  const level = autoLevel(juror);
  if (!level) return lean + 1;
  if (s.threat === accused.id) lean += 2;
  if (ownedRegions(s, accused.id).length > ownedRegions(s, juror.id).length) lean += 1;
  if (level === "hard") lean += accused.bot ? -1 : 1.5;
  if (level === "easy") lean -= 1;
  return lean;
}

// Would attacking `owner` land this bot in front of a jury that convicts? Easy and medium bots are too
// hot-headed to wonder. Hard bots count the votes first, and cross the line only when they expect to walk.
// (Once on trial, there's nothing left to lose.)
function fearsTrial(s: GameState, me: Player, owner: string | null, level: BotLevel) {
  if (!owner || level !== "hard" || s.players.length < TRIAL_MIN_KIRDS || trialFor(s, me.id)) return false;
  const victim = s.players.find((p) => p.id === owner);
  if (!victim) return false;
  const points = sizeUpAttack(s, me, victim).points;
  if (bloodthirst(me, s.round) + points < TRIAL_AT) return false;
  const charges = [...recentCrimes(me, s.round), { round: s.round, victim: owner, region: "", kind: "invasion" as const, points }];
  const jury = s.players.filter((p) => p.id !== me.id);
  return jury.filter((j) => leaning(s, j, me, charges) > 0.5).length * 2 > jury.length;
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
  const level = me ? autoLevel(me) : null;
  if (!me || !level || s.winner) return [];
  const style = STYLE[level];
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

  const bribes = answerOffers(s, self, style, level, roll, tryAct);
  judge(s, self, level, roll, bribes, tryAct);
  propose(s, self, level, roll, tryAct);
  heroPowers(s, self, style, level, tryAct);
  if (style.bankTrades) bankUp(s, self, style, tryAct);
  // Fight with what's rested first, then spend what's left on the future.
  if (roll() < style.attackChance) expand(s, self, style, level, roll, tryAct);
  if (style.bankTrades) layLine(s, self, tryAct);
  if (roll() < style.heroes) hireHero(s, self, tryAct);
  if (roll() < style.build) putUpBuilding(s, self, level, tryAct);
  recruit(s, self, style, tryAct);
  if (style.consolidate) consolidate(s, self, tryAct);
  lobby(s, self, level, tryAct);

  // A person on autopilot gets a private note of what was done in their name.
  if (!me.bot) {
    const done = out.filter((e) => e.actor === me.id && RECAP_TYPES.has(e.type)).map((e) => e.text);
    emit(s, out, {
      actor: null,
      type: "autopilotRecap",
      text: `🤖 Autopilot played your turn: ${done.length ? done.slice(0, 6).join(" ") + (done.length > 6 ? ` …and ${done.length - 6} more.` : "") : "it saved up and waited."}`,
      regions: [],
      only: [me.id],
    });
  }

  // Always hand the turn on, even if the bot couldn't afford to do anything.
  if (activePlayer(s).id === me.id) tryAct({ type: "endTurn" });
  return out;
}

const RECAP_TYPES = new Set(["build", "recruit", "arm", "gondola", "move", "capture", "battle", "hero", "heroMove", "thunder", "pickpocket", "offer", "pact", "loan", "trade", "decline", "vote"]);

// Plays computer turns until it's a person's turn again (or a safety limit is hit).
export function runBots(s: GameState, now: number, limit = 24): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < limit; i++) {
    const p = activePlayer(s);
    // Stop at the first person in command, and never auto-play a game where nobody is.
    if (s.winner || !p || !autoLevel(p) || !s.players.some((q) => !autoLevel(q))) break;
    out.push(...playBotTurn(s, now));
  }
  return out;
}

type Act = (a: Action) => boolean;

// How much more a trade has to give than it takes (in rough worth) before a juror warms to the accused.
const BRIBE: Record<BotLevel, number> = { easy: 1.5, medium: 3, hard: 5 };

// Answers every offer, and returns who has just bought this bot's goodwill ahead of their trial.
function answerOffers(s: GameState, me: () => Player, style: Style, level: BotLevel, roll: () => number, act: Act) {
  const bribes = new Set<string>();
  for (const o of s.offers.filter((x) => x.to === me().id)) {
    let yes = false;
    if (o.kind === "loan") yes = true; // free PandaCoin for both of us
    else if (o.kind === "pact") {
      const them = ownedRegions(s, o.from).length;
      const mine = ownedRegions(s, me().id).length;
      yes = style.preferHumans ? them >= mine : roll() < 0.6;
    } else {
      const fair = style.preferHumans ? 1.2 : style.bankTrades ? 1 : 0.8;
      const from = s.players.find((p) => p.id === o.from);
      const embargo = sanctioned(me(), "trade") || (from && sanctioned(from, "trade"));
      yes = !embargo && affordable(me(), o.get) && worth(o.give) >= worth(o.get) * fair;
      const juror = trialsOf(s).some((t) => t.accused === o.from && !t.votes[me().id]);
      if (yes && juror && worth(o.give) - worth(o.get) >= BRIBE[level]) {
        if (act({ type: "respond", offerId: o.id, accept: true })) bribes.add(o.from);
        continue;
      }
    }
    act({ type: "respond", offerId: o.id, accept: yes });
  }
  return bribes;
}

// Jury duty: the bot's leaning, a roll of conscience, and a bribe goes a long way.
function judge(s: GameState, me: () => Player, level: BotLevel, roll: () => number, bribes: Set<string>, act: Act) {
  const id = me().id;
  for (const t of trialsOf(s).filter((x) => x.accused !== id && !x.votes[id])) {
    const accused = s.players.find((p) => p.id === t.accused);
    if (!accused) continue;
    const lean = leaning(s, me(), accused, t.charges) + roll() * 2 - 1 - (bribes.has(accused.id) ? 4 : 0);
    const guilty = lean > 0.5;
    const hurt = t.charges.some((c) => c.victim === id);
    act({ type: "vote", trial: t.id, guilty, ...(guilty ? { sanction: punishment(s, accused, hurt, level, roll) } : {}) });
  }
}

function punishment(s: GameState, accused: Player, hurt: boolean, level: BotLevel, roll: () => number): Sanction {
  // Victims just want the attacks to stop.
  if (hurt) return "ceasefire";
  if (HERO_IDS.some((h) => s.heroes[h].owner === accused.id) && roll() < 0.5) return "heroes";
  if (level === "hard") return roll() < 0.5 ? "arms" : "gondolas";
  const pool: Sanction[] = ["ceasefire", "arms", "gondolas", "trade"];
  return pool[Math.floor(roll() * pool.length)];
}

// On trial, a cunning bot sends a human juror a little gift before the verdict. No strings attached, of course.
function lobby(s: GameState, me: () => Player, level: BotLevel, act: Act) {
  const id = me().id;
  const t = trialFor(s, id);
  if (!t || level === "easy" || sanctioned(me(), "trade") || s.offers.some((o) => o.from === id)) return;
  const juror = s.players.find((p) => !p.bot && p.id !== id && !t.votes[p.id] && !sanctioned(p, "trade"));
  const p = me();
  const spare = RESOURCES.filter((g) => p.goods[g] >= 3).sort((a, b) => p.goods[b] - p.goods[a])[0];
  if (juror && spare) act({ type: "offerTrade", to: juror.id, give: { [spare]: 2 }, get: {} });
}

// Computer players do diplomacy too: pacts when they're the smaller neighbour, trades for what they lack.
// One open offer at a time, and stale ones are withdrawn so nobody's inbox fills with junk.
const PROPOSE_CHANCE: Record<BotLevel, number> = { easy: 0.3, medium: 0.2, hard: 0.15 };

function propose(s: GameState, me: () => Player, level: BotLevel, roll: () => number, act: Act) {
  const id = me().id;
  for (const o of s.offers.filter((x) => x.from === id && s.turn - x.turn >= s.players.length * 2)) act({ type: "cancelOffer", offerId: o.id });
  if (s.offers.some((o) => o.from === id) || roll() >= PROPOSE_CHANCE[level]) return;
  const mine = ownedRegions(s, id);
  const neighbours = s.players.filter(
    (p) => !p.bot && p.id !== id && !inPact(s, id, p.id) && mine.some((r) => NEIGHBORS.get(r.id)!.some((n) => s.regions[n].owner === p.id)),
  );
  const human = neighbours[Math.floor(roll() * neighbours.length)];
  if (!human) return;
  if (ownedRegions(s, human.id).length > mine.length || level === "easy") {
    act({ type: "offerPact", to: human.id });
    return;
  }
  const p = me();
  const spare = RESOURCES.filter((g) => p.goods[g] >= 4).sort((a, b) => p.goods[b] - p.goods[a])[0];
  const want = RESOURCES.filter((g) => g !== spare).sort((a, b) => p.goods[a] - p.goods[b])[0];
  if (spare && want) act({ type: "offerTrade", to: human.id, give: { [spare]: level === "hard" ? 1 : 2 }, get: { [want]: 1 } });
}

function heroPowers(s: GameState, me: () => Player, style: Style, level: BotLevel, act: Act) {
  if (sanctioned(me(), "heroes")) return;
  const id = me().id;
  const vis = visibleRegions(s, id);
  if (s.heroes.casey.owner === id && me().thunderReadyTurn <= s.turn) {
    const ceasefire = sanctioned(me(), "ceasefire");
    const target = Object.values(s.regions)
      .filter((r) => vis.has(r.id) && r.owner !== id && (!r.owner || !inPact(s, id, r.owner)) && unitTotal(r.units) > 0)
      .filter((r) => !r.owner || (!ceasefire && !fearsTrial(s, me(), r.owner, level)))
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
  // Then buy whatever is still missing with Coin, keeping enough back to pay the ogres.
  const ogres = ownedRegions(s, me().id).reduce((n, r) => n + r.units.nacam, 0);
  for (const g of RESOURCES) {
    const short = (want[g] ?? 0) - me().goods[g];
    if (short <= 0) continue;
    if (me().goods.coin - buyPrice(s, me().id) * short < ogres + 1) break;
    act({ type: "buy", good: g, count: short });
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
  if (sanctioned(me(), "heroes")) return;
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

function expand(s: GameState, me: () => Player, style: Style, level: BotLevel, roll: () => number, act: Act) {
  const id = me().id;
  const ceasefire = sanctioned(me(), "ceasefire");
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
        if (to.owner && (ceasefire || fearsTrial(s, me(), to.owner, level))) continue;
        const odds = winChance(s, id, from, to, send, style);
        if (odds < (style.sims ? style.winPct / 100 : 1)) continue;
        const def = REGION_BY_ID.get(n)!;
        const human = to.owner && !s.players.find((p) => p.id === to.owner)?.bot;
        const hot = to.token === 6 || to.token === 8 ? 1.5 : to.token === 5 || to.token === 9 ? 1 : 0;
        // Whoever is one round from winning becomes everyone's target.
        const stopThem = to.owner && to.owner === s.threat && style.consolidate ? 6 : 0;
        const value = odds * 4 + hot + (to.owner ? 1 : 0) + (style.preferHumans && human ? 2 : 0) + (def.native === "pandas" ? 1 : 0) + stopThem + roll();
        plans.push({ from, to, send, value });
      }
    }
    // Work down the list: a target we already have a line to beats a better one we can't reach this turn.
    let attacked = false;
    for (const plan of plans.sort((a, b) => b.value - a.value)) {
      if (!lineUsable(s, id, plan.from.id, plan.to.id)) {
        if (s.lines[lineId(plan.from.id, plan.to.id)] || !act({ type: "gondola", from: plan.from.id, to: plan.to.id })) continue;
      }
      if (act({ type: "move", from: plan.from.id, to: plan.to.id, units: plan.send })) {
        attacked = true;
        break;
      }
    }
    if (!attacked) return;
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
