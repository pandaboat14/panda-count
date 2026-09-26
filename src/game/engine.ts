// Panda Diplomacy rules engine. Pure functions over a JSON state; the server is the only caller.
// It never ends: there is no victory check, eliminated Kirds respawn, and new rounds keep
// drawing world events so there's always something going on.

import { NEIGHBORS, REGIONS, REGION_BY_ID, lineEnds, lineId, type NativeNation, type Resource } from "./regions";
import {
  BUILDINGS,
  COIN_PER_REGION,
  CURRENCIES,
  EXCHANGE,
  GONDOLA_COST,
  GOODS,
  GOOD_INFO,
  GYM_CAMCOIN,
  HEROES,
  HERO_IDS,
  MARKET_COIN,
  NACAM_UPKEEP,
  NATIVE_GARRISON,
  PANDAS_PER_PANDACOIN,
  PLAYER_COLORS,
  RAID_THRESHOLD,
  RESOURCES,
  SANCTUARY_PANDACOIN,
  START_KIT,
  THUNDER_COOLDOWN,
  UNITS,
  UNIT_TYPES,
  type BuildingType,
  type Cost,
  type Currency,
  type Good,
  type HeroId,
  type UnitType,
} from "./rules";
import { WORLD_EVENTS, type ModifierKind } from "./worldEvents";

// ---------------------------------------------------------------- types

export type Units = Record<UnitType, number>;
export type Goods = Record<Good, number>;

export type RegionState = {
  id: string;
  owner: string | null; // player id
  native: NativeNation | null; // natives holding an unowned region
  units: Units;
  tired: Units; // units that already moved (or were just recruited) this turn
  buildings: BuildingType[];
  token: number; // Catan-style production number, 2–12 except 7
};

export type Player = {
  id: string;
  name: string;
  color: string;
  seat: number;
  goods: Goods;
  capital: string;
  joinedRound: number;
  lastTurnEndSeq: number;
  thunderReadyTurn: number;
  pickpocketTurn: number;
  oathbreakerUntilRound: number;
  respawns: number;
};

export type Hero = { owner: string | null; region: string | null; movedTurn: number };

export type Offer =
  | { id: string; kind: "trade"; from: string; to: string; give: Cost; get: Cost; turn: number }
  | { id: string; kind: "pact"; from: string; to: string; turn: number }
  | { id: string; kind: "loan"; from: string; to: string; region: string; count: number; turn: number };

export type Pact = { a: string; b: string; sinceRound: number };
export type Loan = { id: string; from: string; to: string; count: number; sinceRound: number };
export type Modifier = { kind: ModifierKind; untilRound: number };

export type GameState = {
  version: 1;
  season: number;
  turn: number; // increases every time a player ends their turn
  round: number; // increases every time play wraps back to the first seat
  activeSeat: number;
  turnStartedAt: number;
  players: Player[];
  regions: Record<string, RegionState>;
  lines: Record<string, { owner: string; builtTurn: number }>;
  heroes: Record<HeroId, Hero>;
  offers: Offer[];
  pacts: Pact[];
  loans: Loan[];
  modifiers: Modifier[];
  lastRoll: [number, number] | null;
  rng: number;
  seq: number; // last event number handed out
  nextId: number;
};

export type GameEvent = {
  seq: number;
  turn: number;
  round: number;
  actor: string | null;
  type: string;
  text: string;
  regions: string[];
  // Visible to everyone regardless of fog (world news, diplomacy between named players…).
  public?: boolean;
  // Only these players can see it (private trades, pickpockets…).
  only?: string[];
  data?: Record<string, unknown>;
};

// What a battle event carries, so the board can re-enact it.
export type BattleData = {
  attacker: Units;
  attackerLost: Units;
  defenderStart: Units;
  defenderLost: Units;
  won: boolean;
  rolls: { a: number[]; d: number[] }[];
  atkBonus: number;
  defBonus: number;
  defender: string | null;
  defenderName: string;
  from: string;
  to: string;
};

export type Action =
  | { type: "build"; region: string; building: BuildingType }
  | { type: "recruit"; region: string; unit: "panda" | "nacam" | "cam"; count: number }
  | { type: "arm"; region: string; count: number }
  | { type: "gondola"; from: string; to: string }
  | { type: "move"; from: string; to: string; units: Partial<Units> }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "exchange"; from: Currency; to: Currency }
  | { type: "recruitHero"; hero: HeroId; region: string }
  | { type: "moveHero"; hero: HeroId; to: string }
  | { type: "thunder"; target: string }
  | { type: "pickpocket"; target: string }
  | { type: "offerTrade"; to: string; give: Cost; get: Cost }
  | { type: "offerPact"; to: string }
  | { type: "offerLoan"; to: string; region: string; count: number }
  | { type: "respond"; offerId: string; accept: boolean }
  | { type: "cancelOffer"; offerId: string }
  | { type: "breakPact"; with: string }
  | { type: "endTurn" }
  | { type: "skipTurn" };

export class GameError extends Error {}
const fail = (msg: string): never => {
  throw new GameError(msg);
};

// ---------------------------------------------------------------- helpers

export const emptyUnits = (): Units => ({ panda: 0, armedPanda: 0, nacam: 0, cam: 0 });
export const unitTotal = (u: Units) => u.panda + u.armedPanda + u.nacam + u.cam;

function rand(s: GameState) {
  // mulberry32
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const d6 = (s: GameState) => 1 + Math.floor(rand(s) * 6);
const pick = <T>(s: GameState, arr: T[]) => arr[Math.floor(rand(s) * arr.length)];
function shuffle<T>(s: GameState, arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const activePlayer = (s: GameState) => s.players.find((p) => p.seat === s.activeSeat)!;
const playerById = (s: GameState, id: string) => s.players.find((p) => p.id === id) ?? fail("No such player.");
const regionOf = (s: GameState, id: string) => s.regions[id] ?? fail("No such region.");
export const regionName = (id: string) => REGION_BY_ID.get(id)?.name ?? id;
export const ownedRegions = (s: GameState, pid: string) => Object.values(s.regions).filter((r) => r.owner === pid);
const heroesOf = (s: GameState, pid: string) => HERO_IDS.filter((h) => s.heroes[h].owner === pid);
const hasHero = (s: GameState, pid: string, h: HeroId) => s.heroes[h].owner === pid;
const hasModifier = (s: GameState, k: ModifierKind) => s.modifiers.some((m) => m.kind === k && m.untilRound >= s.round);
const inPact = (s: GameState, a: string, b: string) => s.pacts.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

export function costText(c: Cost) {
  return Object.entries(c)
    .filter(([, n]) => n)
    .map(([g, n]) => `${n} ${GOOD_INFO[g as Good].icon}`)
    .join(" ");
}

function canAfford(p: Player, c: Cost) {
  return Object.entries(c).every(([g, n]) => p.goods[g as Good] >= (n ?? 0));
}
function pay(p: Player, c: Cost, what: string) {
  if (!canAfford(p, c)) fail(`You can't afford ${what} (needs ${costText(c)}).`);
  for (const [g, n] of Object.entries(c)) p.goods[g as Good] -= n ?? 0;
}
function gain(p: Player, c: Cost) {
  for (const [g, n] of Object.entries(c)) p.goods[g as Good] += n ?? 0;
}
const scaleCost = (c: Cost, k: number): Cost =>
  Object.fromEntries(Object.entries(c).map(([g, n]) => [g, (n ?? 0) * k])) as Cost;

function cleanCost(raw: unknown): Cost {
  if (!raw || typeof raw !== "object") return {};
  const out: Cost = {};
  for (const g of GOODS) {
    const n = (raw as Record<string, unknown>)[g];
    if (n === undefined || n === 0) continue;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 999) fail("Amounts must be whole numbers.");
    out[g] = n as number;
  }
  return out;
}

function positiveInt(n: unknown, max = 99) {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > max) fail("That number doesn't work.");
  return n as number;
}

export function lineUsable(s: GameState, pid: string, a: string, b: string) {
  const line = s.lines[lineId(a, b)];
  if (!line) return false;
  return line.owner === pid || (s.regions[a]?.owner === pid && s.regions[b]?.owner === pid);
}

export function gondolaCost(s: GameState, pid: string): Cost {
  if (!hasHero(s, pid, "piecer")) return GONDOLA_COST;
  return Object.fromEntries(Object.entries(GONDOLA_COST).map(([g, n]) => [g, Math.ceil((n ?? 0) / 2)])) as Cost;
}

export function unitCost(s: GameState, pid: string, unit: UnitType): Cost {
  const c = { ...UNITS[unit].cost };
  if (unit === "nacam") {
    let coin = c.coin ?? 0;
    if (hasHero(s, pid, "cockpenis")) coin -= 1;
    if (hasModifier(s, "mercMarket")) coin -= 1;
    c.coin = Math.max(1, coin);
  }
  return c;
}

export function heroCost(s: GameState, h: HeroId): Cost {
  const c = HEROES[h].cost;
  if (h === "casey" && hasModifier(s, "caseySale")) {
    return Object.fromEntries(Object.entries(c).map(([g, n]) => [g, Math.ceil((n ?? 0) * 0.75)])) as Cost;
  }
  return c;
}

export function bankRate(s: GameState, pid: string) {
  if (hasHero(s, pid, "ping")) return 2;
  if (ownedRegions(s, pid).some((r) => r.buildings.includes("market"))) return 3;
  return 4;
}

// ---------------------------------------------------------------- events

type Draft = Omit<GameEvent, "seq" | "turn" | "round">;
function emit(s: GameState, out: GameEvent[], e: Draft) {
  s.seq += 1;
  out.push({ seq: s.seq, turn: s.turn, round: s.round, ...e });
}

// ---------------------------------------------------------------- setup

// Catan's number distribution, stretched over the whole world.
const TOKEN_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export function createGame(seed: number, now: number): GameState {
  const s: GameState = {
    version: 1,
    season: 1,
    turn: 1,
    round: 1,
    activeSeat: 0,
    turnStartedAt: now,
    players: [],
    regions: {},
    lines: {},
    heroes: Object.fromEntries(HERO_IDS.map((h) => [h, { owner: null, region: null, movedTurn: 0 }])) as Record<HeroId, Hero>,
    offers: [],
    pacts: [],
    loans: [],
    modifiers: [],
    lastRoll: null,
    rng: seed | 0,
    seq: 0,
    nextId: 1,
  };
  const tokens: number[] = [];
  while (tokens.length < REGIONS.length) tokens.push(...TOKEN_BAG);
  shuffle(s, tokens);
  REGIONS.forEach((r, i) => {
    s.regions[r.id] = {
      id: r.id,
      owner: null,
      native: r.native,
      units: { ...emptyUnits(), ...NATIVE_GARRISON[r.native] },
      tired: emptyUnits(),
      buildings: r.native === "pandas" ? ["sanctuary"] : r.native === "cams" ? ["gym"] : [],
      token: tokens[i],
    };
  });
  return s;
}

// Pick a starting region: a lightly held "wild" region as far as possible from other Kirds.
function spawnRegion(s: GameState) {
  const taken = Object.values(s.regions).filter((r) => r.owner);
  const candidates = Object.values(s.regions).filter((r) => !r.owner && r.native !== "pandas" && r.native !== "cams");
  if (!candidates.length) return null;
  const score = (r: RegionState) => {
    const def = REGION_BY_ID.get(r.id)!;
    const nearest = taken.length ? Math.min(...taken.map((t) => approxDist(def, REGION_BY_ID.get(t.id)!))) : 10000;
    return nearest + (r.native === "wild" ? 1500 : 0) + rand(s) * 800;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0];
}
function approxDist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

function settle(s: GameState, p: Player, r: RegionState) {
  r.owner = p.id;
  r.native = null;
  r.units = { ...START_KIT.units };
  r.tired = emptyUnits();
  p.capital = r.id;
}

export function addPlayer(s: GameState, id: string, name: string): GameEvent[] {
  if (s.players.some((p) => p.id === id)) fail("You're already in this game.");
  if (s.players.length >= PLAYER_COLORS.length) fail("This game is full (8 Kirds max).");
  const r = spawnRegion(s) ?? fail("There's no room left on the map to join.");
  const p: Player = {
    id,
    name: name.slice(0, 40) || "Kird",
    color: PLAYER_COLORS.find((c) => !s.players.some((q) => q.color === c))!,
    seat: s.players.length,
    goods: { ...START_KIT.goods },
    capital: r.id,
    joinedRound: s.round,
    lastTurnEndSeq: s.seq,
    thunderReadyTurn: 0,
    pickpocketTurn: 0,
    oathbreakerUntilRound: 0,
    respawns: 0,
  };
  s.players.push(p);
  settle(s, p, r);
  const out: GameEvent[] = [];
  emit(s, out, { actor: id, type: "join", text: `${p.name} joined the world, landing in ${regionName(r.id)}.`, regions: [r.id], public: true });
  // The very first Kird starts playing straight away, dice and all.
  if (s.players.length === 1) startTurn(s, out);
  return out;
}

// A Kird leaves for good: their land goes wild, heroes return to the Hall, their lines come down,
// and every deal involving them is off. The turn passes on if it was theirs.
export function removePlayer(s: GameState, id: string, now: number): GameEvent[] {
  const i = s.players.findIndex((p) => p.id === id);
  if (i < 0) fail("That Kird isn't in this game.");
  const out: GameEvent[] = [];
  const leaving = s.players[i];
  const wasActive = s.activeSeat === leaving.seat;
  for (const r of Object.values(s.regions)) {
    if (r.owner !== id) continue;
    r.owner = null;
    r.native = unitTotal(r.units) > 0 ? "wild" : null;
    r.tired = emptyUnits();
  }
  for (const h of HERO_IDS) if (s.heroes[h].owner === id) s.heroes[h] = { owner: null, region: null, movedTurn: 0 };
  for (const [lid, line] of Object.entries(s.lines)) if (line.owner === id) delete s.lines[lid];
  s.offers = s.offers.filter((o) => o.from !== id && o.to !== id);
  s.pacts = s.pacts.filter((p) => p.a !== id && p.b !== id);
  s.loans = s.loans.filter((l) => l.from !== id && l.to !== id);
  s.players.splice(i, 1);
  s.players.forEach((p, seat) => (p.seat = seat));
  emit(s, out, { actor: id, type: "leave", text: `👋 ${leaving.name} left the world. Their land went back to the wild pandas.`, regions: [], public: true });
  if (!s.players.length) return out;
  if (wasActive) {
    s.activeSeat = i % s.players.length;
    if (s.activeSeat === 0) newRound(s, out);
    s.turn += 1;
    s.turnStartedAt = now;
    startTurn(s, out);
  } else if (i < s.activeSeat) {
    s.activeSeat -= 1;
  }
  return out;
}

// ---------------------------------------------------------------- actions

// Actions are all-or-nothing: they run on a copy, which only replaces the real state if nothing failed.
export function applyAction(s: GameState, actorId: string, a: Action, now: number): GameEvent[] {
  const draft = structuredClone(s);
  const out = applyActionTo(draft, actorId, a, now);
  Object.assign(s, draft);
  return out;
}

function applyActionTo(s: GameState, actorId: string, a: Action, now: number): GameEvent[] {
  const out: GameEvent[] = [];
  const me = playerById(s, actorId);
  if (a.type === "skipTurn") {
    const host = s.players[0];
    if (me.id !== host.id) fail("Only the game's host can skip a turn.");
    if (activePlayer(s).id === me.id) fail("Just end your own turn.");
    if (now - s.turnStartedAt < 12 * 3600 * 1000) fail("You can skip someone after they've had 12 hours.");
    emit(s, out, { actor: me.id, type: "skip", text: `${me.name} skipped ${activePlayer(s).name}'s turn.`, regions: [], public: true });
    endTurn(s, out, now);
    return out;
  }
  if (activePlayer(s).id !== me.id) fail(`It's ${activePlayer(s).name}'s turn.`);

  switch (a.type) {
    case "build": {
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("You can only build in your own regions.");
      const b = BUILDINGS[a.building] ?? fail("Unknown building.");
      if (r.buildings.includes(a.building)) fail(`${regionName(r.id)} already has a ${b.label}.`);
      pay(me, b.cost, `a ${b.label}`);
      r.buildings.push(a.building);
      emit(s, out, { actor: me.id, type: "build", text: `${me.name} built a ${b.icon} ${b.label} in ${regionName(r.id)}.`, regions: [r.id], data: { building: a.building } });
      break;
    }
    case "recruit": {
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("You can only recruit in your own regions.");
      if (!["panda", "nacam", "cam"].includes(a.unit)) fail("You can't recruit that.");
      const n = positiveInt(a.count, 20);
      if (a.unit === "cam" && !r.buildings.includes("gym")) fail("CAMs only train at a CAM Gym.");
      pay(me, scaleCost(unitCost(s, me.id, a.unit), n), `${n} ${UNITS[a.unit].plural}`);
      r.units[a.unit] += n;
      r.tired[a.unit] += n;
      const u = UNITS[a.unit];
      emit(s, out, { actor: me.id, type: "recruit", text: `${me.name} recruited ${n} ${u.icon} ${n === 1 ? u.label : u.plural} in ${regionName(r.id)}.`, regions: [r.id], data: { unit: a.unit, count: n } });
      break;
    }
    case "arm": {
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("You can only arm pandas in your own regions.");
      const n = positiveInt(a.count, 50);
      if (r.units.panda < n) fail(`There ${r.units.panda === 1 ? "is" : "are"} only ${r.units.panda} panda${r.units.panda === 1 ? "" : "s"} there.`);
      pay(me, scaleCost(UNITS.armedPanda.cost, n), `arming ${n} panda${n === 1 ? "" : "s"}`);
      const tiredPandas = Math.min(r.tired.panda, n);
      r.units.panda -= n;
      r.tired.panda -= tiredPandas;
      r.units.armedPanda += n;
      r.tired.armedPanda += tiredPandas;
      emit(s, out, { actor: me.id, type: "arm", text: `${me.name} armed ${n} panda${n === 1 ? "" : "s"} in ${regionName(r.id)}. 🛡️`, regions: [r.id], data: { count: n } });
      break;
    }
    case "gondola": {
      const from = regionOf(s, a.from);
      regionOf(s, a.to);
      if (from.owner !== me.id) fail("Gondola lines have to start in one of your regions.");
      if (!NEIGHBORS.get(a.from)!.includes(a.to)) fail(`${regionName(a.to)} is too far from ${regionName(a.from)} for a gondola.`);
      if (s.lines[lineId(a.from, a.to)]) fail("There's already a gondola line there.");
      if (hasModifier(s, "gondolaStrike")) fail("The gondola workers are on strike this round.");
      pay(me, gondolaCost(s, me.id), "a gondola line");
      s.lines[lineId(a.from, a.to)] = { owner: me.id, builtTurn: s.turn };
      emit(s, out, { actor: me.id, type: "gondola", text: `${me.name} built an urban gondola 🚡 from ${regionName(a.from)} to ${regionName(a.to)}.`, regions: [a.from, a.to] });
      break;
    }
    case "move":
      move(s, out, me, a);
      break;
    case "bankTrade": {
      if (!RESOURCES.includes(a.give) || !RESOURCES.includes(a.get) || a.give === a.get) fail("Pick two different resources.");
      const rate = bankRate(s, me.id);
      pay(me, { [a.give]: rate }, `a ${rate}:1 trade`);
      me.goods[a.get] += 1;
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} traded ${rate} ${GOOD_INFO[a.give].icon} for 1 ${GOOD_INFO[a.get].icon} at the World Bank.`, regions: [], only: [me.id] });
      break;
    }
    case "exchange": {
      const x = EXCHANGE.find((e) => e.from === a.from && e.to === a.to) ?? fail("The bank doesn't do that exchange.");
      pay(me, { [x.from]: x.pay }, "that exchange");
      me.goods[x.to] += x.get;
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} exchanged ${x.pay} ${GOOD_INFO[x.from].icon} for ${x.get} ${GOOD_INFO[x.to].icon}.`, regions: [], only: [me.id] });
      break;
    }
    case "recruitHero": {
      const h = s.heroes[a.hero] ?? fail("No such hero.");
      if (h.owner) fail(`${HEROES[a.hero].name} already fights for ${playerById(s, h.owner).name}.`);
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("Heroes have to arrive in one of your regions.");
      pay(me, heroCost(s, a.hero), HEROES[a.hero].name);
      h.owner = me.id;
      h.region = r.id;
      h.movedTurn = s.turn;
      const info = HEROES[a.hero];
      emit(s, out, {
        actor: me.id,
        type: "hero",
        text: a.hero === "casey"
          ? `⚡ THE HEAVENS SPLIT. ${me.name} has recruited Casey, the Norse God, in ${regionName(r.id)}. ⚡`
          : `${me.name} recruited ${info.icon} ${info.name}, ${info.title}, in ${regionName(r.id)}.`,
        regions: [r.id],
        public: true,
        data: { hero: a.hero },
      });
      break;
    }
    case "moveHero": {
      const h = s.heroes[a.hero] ?? fail("No such hero.");
      if (h.owner !== me.id) fail("That hero doesn't fight for you.");
      const from = h.region ?? fail("That hero isn't on the map.");
      if (h.movedTurn === s.turn) fail(`${HEROES[a.hero].name} has already moved this turn.`);
      const to = regionOf(s, a.to);
      if (to.owner !== me.id) fail("Heroes only travel within your own territory. Send troops first.");
      if (!lineUsable(s, me.id, from, a.to)) fail("Heroes ride gondolas too, and there's no line of yours there.");
      h.region = a.to;
      h.movedTurn = s.turn;
      emit(s, out, { actor: me.id, type: "heroMove", text: `${HEROES[a.hero].icon} ${HEROES[a.hero].name} rode the gondola from ${regionName(from)} to ${regionName(a.to)}.`, regions: [from, a.to], data: { hero: a.hero } });
      break;
    }
    case "thunder": {
      if (!hasHero(s, me.id, "casey")) fail("Only Casey can call down thunder.");
      if (me.thunderReadyTurn > s.turn) fail("Casey's thunder is still recharging.");
      const r = regionOf(s, a.target);
      if (r.owner === me.id) fail("Casey won't smite your own people.");
      if (!visibleRegions(s, me.id).has(r.id)) fail("Casey can only strike somewhere you can see.");
      if (r.owner && inPact(s, me.id, r.owner)) fail("You have a pact with them. Break it first.");
      const killed = removeStrongest(r, 3);
      me.thunderReadyTurn = s.turn + THUNDER_COOLDOWN * Math.max(1, s.players.length);
      const victim = r.owner ? playerById(s, r.owner).name : `the ${r.native ?? "empty"} natives`;
      emit(s, out, { actor: me.id, type: "thunder", text: `⚡ Casey called down thunder on ${regionName(r.id)}, destroying ${describeUnits(killed) || "nothing but grass"} belonging to ${victim}.`, regions: [r.id], public: true, data: { killed } });
      if (!r.owner && unitTotal(r.units) === 0) r.native = null;
      break;
    }
    case "pickpocket": {
      if (!hasHero(s, me.id, "josserkid")) fail("Only the Josserkid picks pockets.");
      if (me.pickpocketTurn === s.turn) fail("The Josserkid already struck this turn.");
      const target = playerById(s, a.target);
      if (target.id === me.id) fail("You can't pickpocket yourself.");
      const vis = visibleRegions(s, me.id);
      if (!ownedRegions(s, target.id).some((r) => vis.has(r.id))) fail(`You can't see any of ${target.name}'s land.`);
      if (inPact(s, me.id, target.id)) fail("You have a pact with them. Break it first.");
      me.pickpocketTurn = s.turn;
      const pool = RESOURCES.flatMap((g) => Array(target.goods[g]).fill(g) as Resource[]);
      if (!pool.length) {
        emit(s, out, { actor: me.id, type: "pickpocket", text: `🃏 The Josserkid rifled through ${target.name}'s pockets and found nothing.`, regions: [], only: [me.id, target.id] });
        break;
      }
      const g = pick(s, pool);
      target.goods[g] -= 1;
      me.goods[g] += 1;
      emit(s, out, { actor: me.id, type: "pickpocket", text: `🃏 The Josserkid pickpocketed 1 ${GOOD_INFO[g].icon} from ${target.name}.`, regions: [], only: [me.id, target.id] });
      break;
    }
    case "offerTrade": {
      const to = playerById(s, a.to);
      if (to.id === me.id) fail("Trade with someone else.");
      const give = cleanCost(a.give);
      const get = cleanCost(a.get);
      if (!Object.keys(give).length && !Object.keys(get).length) fail("Put something in the deal.");
      if (!canAfford(me, give)) fail("You don't have what you're offering.");
      s.offers.push({ id: `o${s.nextId++}`, kind: "trade", from: me.id, to: to.id, give, get, turn: s.turn });
      emit(s, out, { actor: me.id, type: "offer", text: `${me.name} offered ${to.name} a trade: ${costText(give) || "nothing"} for ${costText(get) || "nothing"}.`, regions: [], only: [me.id, to.id] });
      break;
    }
    case "offerPact": {
      const to = playerById(s, a.to);
      if (to.id === me.id) fail("You can't make a pact with yourself.");
      if (inPact(s, me.id, to.id)) fail("You already have a pact.");
      if (s.offers.some((o) => o.kind === "pact" && ((o.from === me.id && o.to === to.id) || (o.from === to.id && o.to === me.id)))) fail("A pact offer is already on the table.");
      s.offers.push({ id: `o${s.nextId++}`, kind: "pact", from: me.id, to: to.id, turn: s.turn });
      emit(s, out, { actor: me.id, type: "offer", text: `${me.name} proposed a non-aggression pact to ${to.name}. 🤝`, regions: [], public: true });
      break;
    }
    case "offerLoan": {
      const to = playerById(s, a.to);
      if (to.id === me.id) fail("Loan your pandas to someone else.");
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("Loaned pandas have to come from your own region.");
      const n = positiveInt(a.count, 10);
      if (r.units.panda - r.tired.panda < n) fail(`${regionName(r.id)} doesn't have ${n} rested panda${n === 1 ? "" : "s"}.`);
      s.offers.push({ id: `o${s.nextId++}`, kind: "loan", from: me.id, to: to.id, region: r.id, count: n, turn: s.turn });
      emit(s, out, { actor: me.id, type: "offer", text: `🐼 Panda diplomacy! ${me.name} offered to loan ${n} panda${n === 1 ? "" : "s"} to ${to.name}.`, regions: [], public: true });
      break;
    }
    case "respond":
      respond(s, out, me, a.offerId, a.accept);
      break;
    case "cancelOffer": {
      const i = s.offers.findIndex((o) => o.id === a.offerId && o.from === me.id);
      if (i < 0) fail("That offer is gone.");
      s.offers.splice(i, 1);
      break;
    }
    case "breakPact": {
      const other = playerById(s, a.with);
      breakPact(s, out, me, other);
      break;
    }
    case "endTurn":
      emit(s, out, { actor: me.id, type: "endTurn", text: `${me.name} ended their turn.`, regions: [], public: true });
      me.lastTurnEndSeq = s.seq;
      endTurn(s, out, now);
      break;
    default:
      fail("Unknown action.");
  }
  return out;
}

function breakPact(s: GameState, out: GameEvent[], me: Player, other: Player) {
  const i = s.pacts.findIndex((p) => (p.a === me.id && p.b === other.id) || (p.a === other.id && p.b === me.id));
  if (i < 0) fail(`You don't have a pact with ${other.name}.`);
  s.pacts.splice(i, 1);
  const loans = s.loans.filter((l) => (l.from === me.id && l.to === other.id) || (l.from === other.id && l.to === me.id));
  s.loans = s.loans.filter((l) => !loans.includes(l));
  me.oathbreakerUntilRound = s.round + 3;
  emit(s, out, {
    actor: me.id,
    type: "betrayal",
    text: `💔 ${me.name} broke their pact with ${other.name}!${loans.length ? " The loaned pandas stay where they are, heartbroken." : ""} ${me.name} is an Oathbreaker: half PandaCoin for 3 rounds.`,
    regions: [],
    public: true,
  });
}

function respond(s: GameState, out: GameEvent[], me: Player, offerId: string, accept: boolean) {
  const i = s.offers.findIndex((o) => o.id === offerId && o.to === me.id);
  if (i < 0) fail("That offer is gone.");
  const o = s.offers[i];
  const from = playerById(s, o.from);
  s.offers.splice(i, 1);
  if (!accept) {
    emit(s, out, { actor: me.id, type: "decline", text: `${me.name} turned down ${from.name}'s ${o.kind === "loan" ? "panda loan" : o.kind}.`, regions: [], only: o.kind === "trade" ? [me.id, from.id] : undefined, public: o.kind !== "trade" });
    return;
  }
  if (o.kind === "trade") {
    if (!canAfford(from, o.give)) fail(`${from.name} can't cover their side any more.`);
    if (!canAfford(me, o.get)) fail("You can't cover your side of that deal.");
    pay(from, o.give, "the trade");
    gain(me, o.give);
    pay(me, o.get, "the trade");
    gain(from, o.get);
    emit(s, out, { actor: me.id, type: "trade", text: `${me.name} and ${from.name} traded: ${costText(o.give) || "nothing"} ↔ ${costText(o.get) || "nothing"}.`, regions: [], only: [me.id, from.id] });
  } else if (o.kind === "pact") {
    if (!inPact(s, me.id, from.id)) s.pacts.push({ a: from.id, b: me.id, sinceRound: s.round });
    emit(s, out, { actor: me.id, type: "pact", text: `🤝 ${me.name} and ${from.name} signed a non-aggression pact.`, regions: [], public: true });
  } else {
    const r = s.regions[o.region];
    const available = r && r.owner === from.id ? r.units.panda - r.tired.panda : 0;
    if (available < o.count) fail(`${from.name} no longer has those pandas to loan.`);
    const dest = ownedRegions(s, me.id).sort((a, b) => (a.id === me.capital ? -1 : b.id === me.capital ? 1 : 0))[0];
    if (!dest) fail("You need a region to host the pandas.");
    r.units.panda -= o.count;
    dest.units.panda += o.count;
    dest.tired.panda += o.count;
    s.loans.push({ id: `l${s.nextId++}`, from: from.id, to: me.id, count: o.count, sinceRound: s.round });
    if (!inPact(s, me.id, from.id)) s.pacts.push({ a: from.id, b: me.id, sinceRound: s.round });
    emit(s, out, {
      actor: me.id,
      type: "loan",
      text: `🐼🤝 Panda diplomacy: ${from.name} loaned ${o.count} panda${o.count === 1 ? "" : "s"} to ${me.name}, who welcomed them in ${regionName(dest.id)}. Both earn PandaCoin from the loan, and they're now at peace.`,
      regions: [r.id, dest.id],
      public: true,
    });
  }
}

// ---------------------------------------------------------------- movement & combat

function readUnits(raw: Partial<Units>): Units {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) {
    const n = raw?.[t] ?? 0;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 999) fail("Unit counts must be whole numbers.");
    u[t] = n;
  }
  if (unitTotal(u) === 0) fail("Pick some units to send.");
  return u;
}

export function describeUnits(u: Partial<Units>) {
  return UNIT_TYPES.filter((t) => (u[t] ?? 0) > 0)
    .map((t) => `${u[t]} ${UNITS[t].icon}`)
    .join(" ");
}

function move(s: GameState, out: GameEvent[], me: Player, a: Extract<Action, { type: "move" }>) {
  const from = regionOf(s, a.from);
  const to = regionOf(s, a.to);
  if (from.owner !== me.id) fail("You can only send troops from your own regions.");
  if (a.from === a.to) fail("Pick a different region.");
  if (!lineUsable(s, me.id, a.from, a.to)) fail(`There's no gondola line of yours between ${regionName(a.from)} and ${regionName(a.to)}. Build one first: urban gondolas are the only way to move troops.`);
  const units = readUnits(a.units);
  for (const t of UNIT_TYPES) {
    if (from.units[t] - from.tired[t] < units[t]) fail(`Not enough rested ${UNITS[t].plural} in ${regionName(from.id)}.`);
  }
  const piecerHere = s.heroes.piecer.owner === me.id && s.heroes.piecer.region === from.id;
  for (const t of UNIT_TYPES) from.units[t] -= units[t];

  if (to.owner === me.id) {
    for (const t of UNIT_TYPES) {
      to.units[t] += units[t];
      if (!piecerHere) to.tired[t] += units[t];
    }
    emit(s, out, { actor: me.id, type: "move", text: `${me.name} sent ${describeUnits(units)} by gondola from ${regionName(from.id)} to ${regionName(to.id)}.`, regions: [from.id, to.id], data: { units } });
    return;
  }

  // Everything below is an invasion.
  const defender = to.owner ? playerById(s, to.owner) : null;
  if (defender && inPact(s, me.id, defender.id)) fail(`You have a pact with ${defender.name}. Break it first if you really mean it.`);
  const defenderName = defender ? defender.name : to.native ? NATIVE_NAMES[to.native] : "nobody";

  if (unitTotal(to.units) === 0) {
    capture(s, out, me, to, units, defender);
    emit(s, out, { actor: me.id, type: "capture", text: `${me.name} rode into ${regionName(to.id)} unopposed and claimed it${defender ? ` from ${defender.name}` : ""}.`, regions: [from.id, to.id], public: Boolean(defender), data: { units } });
    return;
  }

  const atkBonus = heroBonus(s, me.id, from.id);
  const defBonus = (to.buildings.includes("fort") ? 1 : 0) + (defender ? heroBonus(s, defender.id, to.id) : 0);
  const defenderStart = { ...to.units };
  const result = battle(s, units, atkBonus, { ...to.units }, defBonus);
  to.units = result.defender;
  to.tired = clampTired(to.tired, to.units);
  const text = result.attackerWon
    ? `⚔️ ${me.name} invaded ${regionName(to.id)} with ${describeUnits(units)} and defeated ${defenderName}${describeUnits(result.defenderLost) ? ` (${describeUnits(result.defenderLost)} fell)` : ""}. ${regionName(to.id)} is theirs.`
    : `⚔️ ${me.name} invaded ${regionName(to.id)} with ${describeUnits(units)}, but ${defenderName} held the line. Every attacker fell${describeUnits(result.defenderLost) ? `, taking ${describeUnits(result.defenderLost)} with them` : ""}.`;
  emit(s, out, {
    actor: me.id,
    type: "battle",
    text,
    regions: [from.id, to.id],
    public: Boolean(defender),
    data: {
      attacker: units,
      attackerLost: result.attackerLost,
      defenderStart,
      defenderLost: result.defenderLost,
      won: result.attackerWon,
      rolls: result.rolls,
      atkBonus,
      defBonus,
      defender: defender?.id ?? to.native,
      defenderName,
      from: from.id,
      to: to.id,
    } satisfies BattleData,
  });
  if (result.attackerWon) capture(s, out, me, to, result.attacker, defender);
  else if (!to.owner && unitTotal(to.units) === 0) to.native = null;
}

const NATIVE_NAMES: Record<NativeNation, string> = {
  pandas: "the Panda Nation",
  nacams: "the NACAM Ogre Nation",
  cams: "the CAM Nation",
  wild: "the wild pandas",
};

function clampTired(t: Units, u: Units): Units {
  const out = emptyUnits();
  for (const k of UNIT_TYPES) out[k] = Math.min(t[k], u[k]);
  return out;
}

function capture(s: GameState, out: GameEvent[], me: Player, to: RegionState, arrivals: Units, defender: Player | null) {
  to.owner = me.id;
  to.native = null;
  to.units = { ...arrivals };
  to.tired = { ...arrivals };
  for (const h of HERO_IDS) {
    const hero = s.heroes[h];
    if (hero.region !== to.id || !hero.owner || hero.owner === me.id) continue;
    if (h === "casey") {
      hero.owner = me.id;
      emit(s, out, { actor: me.id, type: "heroCaptured", text: `⚡ ${me.name} CAPTURED Casey, the Norse God, in ${regionName(to.id)}! He now fights for them.`, regions: [to.id], public: true, data: { hero: h } });
    } else {
      hero.owner = null;
      hero.region = null;
      emit(s, out, { actor: me.id, type: "heroFled", text: `${HEROES[h].icon} ${HEROES[h].name} fled ${regionName(to.id)} and is back in the Hall of Heroes, ready to be recruited again.`, regions: [to.id], public: true, data: { hero: h } });
    }
  }
  if (defender) {
    // The attacker can't be at peace with someone they just invaded; nothing to do (pacts block attacks).
    if (defender.capital === to.id) {
      const next = ownedRegions(s, defender.id)[0];
      defender.capital = next?.id ?? defender.capital;
    }
  }
}

function heroBonus(s: GameState, pid: string, regionId: string) {
  let b = 0;
  for (const h of HERO_IDS) {
    const hero = s.heroes[h];
    if (hero.owner === pid && hero.region === regionId) b += HEROES[h].combatBonus;
  }
  return b;
}

type BattleResult = {
  attackerWon: boolean;
  attacker: Units;
  defender: Units;
  attackerLost: Units;
  defenderLost: Units;
  rolls: { a: number[]; d: number[] }[];
};

// Risk-style: up to 3 attacking dice vs 2 defending, highest against highest, ties go to the defender.
// Each die gets the unit's attack/defence bonus plus heroes and forts. Fought to the last unit.
export function battle(s: GameState, attacker: Units, atkBonus: number, defender: Units, defBonus: number): BattleResult {
  const a = { ...attacker };
  const d = { ...defender };
  const attackerLost = emptyUnits();
  const defenderLost = emptyUnits();
  const rolls: BattleResult["rolls"] = [];
  const order = (u: Units, stat: "attack" | "defense") =>
    UNIT_TYPES.flatMap((t) => Array(u[t]).fill(t) as UnitType[]).sort((x, y) => UNITS[y][stat] - UNITS[x][stat]);
  let guard = 0;
  while (unitTotal(a) > 0 && unitTotal(d) > 0 && guard++ < 1000) {
    const aUnits = order(a, "attack").slice(0, 3);
    const dUnits = order(d, "defense").slice(0, 2);
    const aDice = aUnits.map((t) => d6(s) + UNITS[t].attack + atkBonus).sort((x, y) => y - x);
    const dDice = dUnits.map((t) => d6(s) + UNITS[t].defense + defBonus).sort((x, y) => y - x);
    if (rolls.length < 6) rolls.push({ a: aDice, d: dDice });
    for (let i = 0; i < Math.min(aDice.length, dDice.length); i++) {
      if (aDice[i] > dDice[i]) {
        const t = weakest(d, "defense");
        d[t] -= 1;
        defenderLost[t] += 1;
      } else {
        const t = weakest(a, "attack");
        a[t] -= 1;
        attackerLost[t] += 1;
      }
      if (!unitTotal(a) || !unitTotal(d)) break;
    }
  }
  return { attackerWon: unitTotal(d) === 0, attacker: a, defender: d, attackerLost, defenderLost, rolls };
}

function weakest(u: Units, stat: "attack" | "defense"): UnitType {
  return UNIT_TYPES.filter((t) => u[t] > 0).sort((x, y) => UNITS[x][stat] - UNITS[y][stat])[0];
}

function removeStrongest(r: RegionState, n: number): Units {
  const killed = emptyUnits();
  for (let i = 0; i < n; i++) {
    const t = (["cam", "armedPanda", "nacam", "panda"] as UnitType[]).find((k) => r.units[k] > 0);
    if (!t) break;
    r.units[t] -= 1;
    killed[t] += 1;
  }
  r.tired = clampTired(r.tired, r.units);
  return killed;
}

// ---------------------------------------------------------------- turns

function endTurn(s: GameState, out: GameEvent[], now: number) {
  // Rest everyone who just played.
  const prev = activePlayer(s);
  for (const r of ownedRegions(s, prev.id)) r.tired = emptyUnits();
  s.turn += 1;
  const nextSeat = (s.activeSeat + 1) % s.players.length;
  if (nextSeat === 0) newRound(s, out);
  s.activeSeat = nextSeat;
  s.turnStartedAt = now;
  startTurn(s, out);
}

function newRound(s: GameState, out: GameEvent[]) {
  s.round += 1;
  s.modifiers = s.modifiers.filter((m) => m.untilRound >= s.round);
  // The natives never stop coming back.
  if (s.round % 3 === 0) {
    for (const r of Object.values(s.regions)) {
      if (r.owner || !r.native) continue;
      if (r.native === "nacams" && r.units.nacam < 6) r.units.nacam += 1;
      if (r.native === "pandas" && r.units.panda < 8) r.units.panda += 1;
      if (r.native === "cams" && r.units.cam < 4) r.units.cam += 1;
    }
  }
  const card = pick(s, WORLD_EVENTS.filter((e) => e.season <= s.season));
  const text = card.apply(s, { rand: () => rand(s), emptyUnits });
  emit(s, out, { actor: null, type: "world", text: `🌍 Round ${s.round} — ${card.title}: ${text}`, regions: [], public: true, data: { card: card.id } });
}

function startTurn(s: GameState, out: GameEvent[]) {
  const p = activePlayer(s);

  // Exiles get a fresh start: Panda Asylum.
  if (!ownedRegions(s, p.id).length) {
    const r = spawnRegion(s);
    if (r) {
      settle(s, p, r);
      r.units = { ...emptyUnits(), panda: 2 };
      p.respawns += 1;
      emit(s, out, { actor: p.id, type: "asylum", text: `🕊️ ${p.name} lost everything, and was granted Panda Asylum in ${regionName(r.id)} with 2 pandas.`, regions: [r.id], public: true });
    }
  }

  // Catan dice: everyone's matching regions produce.
  const roll: [number, number] = [d6(s), d6(s)];
  s.lastRoll = roll;
  const total = roll[0] + roll[1];
  if (total === 7) {
    const hit: string[] = [];
    for (const q of s.players) {
      const held = RESOURCES.reduce((n, g) => n + q.goods[g], 0);
      if (held <= RAID_THRESHOLD) continue;
      let lose = Math.floor(held / 2);
      while (lose > 0) {
        const g = pick(s, RESOURCES.filter((x) => q.goods[x] > 0));
        q.goods[g] -= 1;
        lose -= 1;
      }
      hit.push(q.name);
    }
    emit(s, out, { actor: p.id, type: "roll", text: `🎲 ${p.name} rolled 7: OGRE RAID! 👹 ${hit.length ? `${hit.join(", ")} lost half their resources.` : "Nobody was carrying enough to raid."}`, regions: [], public: true, data: { roll } });
  } else {
    const blight = hasModifier(s, "blight");
    const got: Record<string, Cost> = {};
    for (const r of Object.values(s.regions)) {
      if (r.token !== total || !r.owner) continue;
      const res = REGION_BY_ID.get(r.id)!.resource;
      if (blight && res === "bamboo") continue;
      const owner = playerById(s, r.owner);
      owner.goods[res] += 1;
      (got[owner.id] ??= {})[res] = ((got[owner.id][res] as number) ?? 0) + 1;
    }
    const summary = Object.entries(got).map(([id, c]) => `${playerById(s, id).name} ${costText(c)}`).join(", ");
    emit(s, out, {
      actor: p.id,
      type: "roll",
      text: `🎲 ${p.name} rolled ${total}. ${summary ? `Harvest: ${summary}.` : "Nobody's regions produced."}${blight ? " (Bamboo blight: no bamboo.)" : ""}`,
      regions: Object.values(s.regions).filter((r) => r.token === total).map((r) => r.id),
      public: true,
      data: { roll },
    });
  }

  // Every region you hold yields its resource at the start of your turn.
  const harvest: Cost = {};
  for (const r of ownedRegions(s, p.id)) {
    const res = REGION_BY_ID.get(r.id)!.resource;
    if (hasModifier(s, "blight") && res === "bamboo") continue;
    p.goods[res] += 1;
    harvest[res] = (harvest[res] ?? 0) + 1;
  }

  // Income for the active player.
  const mine = ownedRegions(s, p.id);
  const pandas = mine.reduce((n, r) => n + r.units.panda + r.units.armedPanda, 0);
  let coin = mine.length * COIN_PER_REGION + mine.filter((r) => r.buildings.includes("market")).length * MARKET_COIN;
  let pandaCoin =
    Math.floor(pandas / PANDAS_PER_PANDACOIN) +
    mine.filter((r) => r.buildings.includes("sanctuary")).length * SANCTUARY_PANDACOIN +
    (hasHero(s, p.id, "ping") ? 2 : 0) +
    s.loans.filter((l) => l.from === p.id || l.to === p.id).reduce((n, l) => n + l.count, 0);
  if (p.oathbreakerUntilRound >= s.round) pandaCoin = Math.floor(pandaCoin / 2);
  const camCoin = mine.filter((r) => r.buildings.includes("gym")).length * GYM_CAMCOIN;

  // Ogre upkeep.
  const ogres = mine.reduce((n, r) => n + r.units.nacam, 0);
  let deserted = 0;
  if (ogres && !hasHero(s, p.id, "cockpenis")) {
    const due = ogres * NACAM_UPKEEP;
    coin -= due;
    if (p.goods.coin + coin < 0) {
      deserted = Math.min(ogres, Math.ceil(-(p.goods.coin + coin) / NACAM_UPKEEP));
      coin += deserted * NACAM_UPKEEP;
      let left = deserted;
      for (const r of [...mine].sort((a, b) => b.units.nacam - a.units.nacam)) {
        const n = Math.min(left, r.units.nacam);
        r.units.nacam -= n;
        left -= n;
      }
    }
  }
  p.goods.coin += coin;
  p.goods.pandaCoin += pandaCoin;
  p.goods.camCoin += camCoin;
  emit(s, out, { actor: p.id, type: "turn", text: `It's ${p.name}'s turn.`, regions: [], public: true });
  emit(s, out, {
    actor: p.id,
    type: "income",
    text: `Harvest: ${costText(harvest) || "nothing"}. Income: ${coin >= 0 ? "+" : ""}${coin} 🪙, +${pandaCoin} 🐼, +${camCoin} 💪${ogres && !hasHero(s, p.id, "cockpenis") ? ` (after ${ogres} 🪙 ogre upkeep)` : ""}.${deserted ? ` 👹 ${deserted} unpaid ogre${deserted === 1 ? "" : "s"} deserted!` : ""}`,
    regions: [],
    only: [p.id],
  });
}

// ---------------------------------------------------------------- fog of war

export function visibleRegions(s: GameState, pid: string): Set<string> {
  const vis = new Set<string>();
  for (const r of ownedRegions(s, pid)) {
    vis.add(r.id);
    for (const n of NEIGHBORS.get(r.id)!) vis.add(n);
  }
  for (const [id, line] of Object.entries(s.lines)) {
    if (line.owner === pid) for (const end of lineEnds(id)) vis.add(end);
  }
  // The Josserkid sees everything within 3 hops of wherever he's lurking.
  const jk = s.heroes.josserkid;
  if (jk.owner === pid && jk.region) {
    let frontier = [jk.region];
    vis.add(jk.region);
    for (let hop = 0; hop < 3; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of NEIGHBORS.get(id)!) {
          if (!vis.has(n)) next.push(n);
          vis.add(n);
        }
      }
      frontier = next;
    }
  }
  return vis;
}

export function eventVisible(s: GameState, e: GameEvent, pid: string) {
  if (e.only) return e.only.includes(pid);
  if (e.public || e.actor === pid) return true;
  if (!e.regions.length) return false;
  const vis = visibleRegions(s, pid);
  return e.regions.some((r) => vis.has(r));
}

export type RegionView = {
  id: string;
  token: number;
  fog: boolean;
  owner?: string | null;
  native?: NativeNation | null;
  units?: Units;
  tired?: Units;
  buildings?: BuildingType[];
};

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  seat: number;
  regions: number;
  cards: number; // total resources held, like Catan's hand size
  heroes: HeroId[];
  goods?: Goods; // only your own
  capital?: string;
  thunderReadyTurn?: number;
  pickpocketTurn?: number;
  oathbreaker: boolean;
  lastTurnEndSeq?: number;
};

export type GameView = {
  me: string;
  turn: number;
  round: number;
  season: number;
  activeSeat: number;
  turnStartedAt: number;
  lastRoll: [number, number] | null;
  players: PlayerView[];
  regions: RegionView[];
  lines: { id: string; owner: string }[];
  heroes: Record<HeroId, { owner: string | null; region: string | null; movedTurn: number }>;
  offers: Offer[];
  pacts: Pact[];
  loans: Loan[];
  modifiers: Modifier[];
  prices: { gondola: Cost; units: Record<UnitType, Cost>; heroes: Record<HeroId, Cost>; bankRate: number };
};

export function viewFor(s: GameState, pid: string): GameView {
  const vis = visibleRegions(s, pid);
  return {
    me: pid,
    turn: s.turn,
    round: s.round,
    season: s.season,
    activeSeat: s.activeSeat,
    turnStartedAt: s.turnStartedAt,
    lastRoll: s.lastRoll,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      seat: p.seat,
      regions: ownedRegions(s, p.id).length,
      cards: RESOURCES.reduce((n, g) => n + p.goods[g], 0),
      heroes: heroesOf(s, p.id),
      oathbreaker: p.oathbreakerUntilRound >= s.round,
      ...(p.id === pid
        ? { goods: { ...p.goods }, capital: p.capital, thunderReadyTurn: p.thunderReadyTurn, pickpocketTurn: p.pickpocketTurn, lastTurnEndSeq: p.lastTurnEndSeq }
        : {}),
    })),
    regions: Object.values(s.regions).map((r) =>
      vis.has(r.id)
        ? { id: r.id, token: r.token, fog: false, owner: r.owner, native: r.native, units: { ...r.units }, tired: r.owner === pid ? { ...r.tired } : undefined, buildings: [...r.buildings] }
        : { id: r.id, token: r.token, fog: true },
    ),
    lines: Object.entries(s.lines)
      .filter(([id]) => lineEnds(id).some((e) => vis.has(e)))
      .map(([id, l]) => ({ id, owner: l.owner })),
    heroes: Object.fromEntries(
      HERO_IDS.map((h) => {
        const hero = s.heroes[h];
        return [h, { owner: hero.owner, region: hero.region && (hero.owner === pid || vis.has(hero.region)) ? hero.region : null, movedTurn: hero.movedTurn }];
      }),
    ) as GameView["heroes"],
    offers: s.offers.filter((o) => o.from === pid || o.to === pid),
    pacts: s.pacts,
    loans: s.loans,
    modifiers: s.modifiers.filter((m) => m.untilRound >= s.round),
    prices: {
      gondola: gondolaCost(s, pid),
      units: Object.fromEntries(UNIT_TYPES.map((t) => [t, unitCost(s, pid, t)])) as Record<UnitType, Cost>,
      heroes: Object.fromEntries(HERO_IDS.map((h) => [h, heroCost(s, h)])) as Record<HeroId, Cost>,
      bankRate: bankRate(s, pid),
    },
  };
}

export { CURRENCIES };
