// Panda Diplomacy rules engine. Pure functions over a JSON state; the server is the only caller.
// It never ends: there is no victory check, eliminated Kirds respawn, and new rounds keep
// drawing world events so there's always something going on.

import { NEIGHBORS, REGIONS, REGION_BY_ID, lineEnds, lineId, placeName, type NativeNation, type Resource } from "./regions";
import {
  BLOODTHIRST_ROUNDS,
  BUILDINGS,
  BUY_PRICE,
  BUY_PRICE_MARKET,
  COIN_PER_REGION,
  CURRENCIES,
  DEFAULT_ITEM_BUDGET,
  EXCHANGE,
  GEAR_BATTLES,
  GONDOLA_COST,
  GOODS,
  GOOD_INFO,
  GYM_CAMCOIN,
  HEROES,
  HERO_IDS,
  MARKET_COIN,
  MAX_ITEM_BUDGET,
  NACAM_UPKEEP,
  NATIVE_CAP,
  NATIVE_GARRISON,
  PANDAS_PER_PANDACOIN,
  PLAYER_COLORS,
  QUARRY_CHANCE,
  QUARRY_MAX,
  RAID_THRESHOLD,
  REPEAT_OFFENDER_TURNS,
  RESOURCES,
  SANCTIONS,
  SANCTION_INFO,
  SANCTUARY_PANDACOIN,
  SENTENCE_TURNS,
  START_KIT,
  THUNDER_COOLDOWN,
  TRIAL_AT,
  TRIAL_MIN_KIRDS,
  UNITS,
  UNIT_TYPES,
  type BuildingType,
  type Cost,
  type Currency,
  type Good,
  type HeroId,
  type Sanction,
  type UnitType,
} from "./rules";
import { WORLD_EVENTS, type ModifierKind } from "./worldEvents";
import { DOCTRINES, ITEMS, MOVE_BY_ID, RULES as BATTLE_RULES, WEAPONS } from "./battle/codex";
import * as BE from "./battle/engine";
import { battleRecord, legacyRolls, redactBattle, stampSeeds, type BattleRecord } from "./battle/record";
import type {
  Bag,
  BattleAction,
  BattleConfig,
  Battle as EngineBattle,
  ItemId,
  PlayerDoctrineId,
  ReactionId,
  ResultHow,
  SideKey,
  SquadSpec,
  TrapId,
  WeaponId,
  WorldEventId,
} from "./battle/types";

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
  // A new name from a Kird who conquered it (missing: its real-world name). It outlasts their rule.
  name?: string;
  // Whoever last took it by force or rode in unopposed: they may rename it while they hold it.
  conqueror?: string;
  orders?: RegionOrders; // the owner's Standing Orders here (missing in older games: the defaults)
};

// Standing Orders: how a region's defenders fight while its owner is away. Anything left out follows the defaults
// (the owner's doctrine, the first squad in line, DEFAULT_ITEM_BUDGET Bag items, no traps).
export type RegionOrders = { doctrine?: PlayerDoctrineId; lead?: UnitType | HeroId; budget?: number; traps?: TrapId[] };
export type StandingOrders = { doctrine: PlayerDoctrineId; doctrineSet: boolean; lead: UnitType | HeroId | null; budget: number; traps: TrapId[] };

// The Armory: player-wide gear per unit type, one weapon and one piece of armour each, plus a siege catapult for
// the whole army. Every battle a unit type fights in uses a charge of its gear; at 0 it breaks.
export type GearCharge = { id: WeaponId; charges: number };
export type Armory = { units: Partial<Record<UnitType, { weapon?: GearCharge; armor?: GearCharge }>>; army?: GearCharge };

// An invasion being fought round by round (only a person's invasions stay open; the computer's resolve at once).
export type LiveBattle = {
  id: number;
  attacker: string;
  defender: string | null; // a player, or null for natives
  native: NativeNation | null;
  defenderName: string;
  from: string;
  to: string;
  units: Units; // the attackers who rode in
  defenderStart: Units;
  heroes: { atk: HeroId[]; def: HeroId[] }; // heroes who took the field
  atkBonus: number; // hero aura, as the old battle records put it
  defBonus: number; // Fort plus hero aura
  throwBase: number; // mixes the dice-throw seeds
  thirst: number; // the Bloodthirst this invasion cost the attacker (booked when it started)
  // Each player's purse and Bag as last written back to them (the battle spends from copies).
  synced: { atk: { goods: Goods; bag: Bag } | null; def: { goods: Goods; bag: Bag } | null };
  b: EngineBattle;
};

export type BotLevel = "easy" | "medium" | "hard";
export const BOT_LEVELS: BotLevel[] = ["easy", "medium", "hard"];

export type Player = {
  id: string;
  name: string;
  bot?: BotLevel; // played by the computer
  autopilot?: BotLevel | null; // a person who has handed their turns to the computer for a while
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
  // War crimes (missing in older games): the recent attacks that count toward Bloodthirst, the rounds of attacks
  // this Kird hasn't yet answered, by attacker (each one is a free strike back), and any sentence being served.
  crimes?: Crime[];
  grudges?: Record<string, number[]>;
  sentence?: Sentence | null;
  convictions?: number;
  // Battles (missing in older games: an empty Bag, no gear, Counterpunch).
  bag?: Bag;
  armory?: Armory;
  doctrine?: PlayerDoctrineId; // the default doctrine for every region's Standing Orders, and Sun Tzu's when he fights for you
};

// An attack on another Kird that fed the attacker's Bloodthirst.
export type Crime = { round: number; victim: string; region: string; kind: "invasion" | "thunder"; points: number };
export type Vote = { guilty: boolean; sanction?: Sanction };
// Votes are secret: only the voter's own view ever shows theirs.
export type Trial = { id: string; accused: string; openedRound: number; charges: Crime[]; votes: Record<string, Vote> };
export type Sentence = { sanctions: Sanction[]; turnsLeft: number };

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
  // Hold this many regions at the start of your own turn to win; null (or missing, in older games) plays forever.
  goal?: number | null;
  winner?: string | null;
  // Who has reached the goal and must survive a full round to claim it (so everyone gets a warning).
  threat?: string | null;
  // The invasion being fought right now, round by round (missing in older games: none).
  battle?: LiveBattle | null;
  // War crimes trials waiting on a verdict (missing in older games).
  trials?: Trial[];
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
  place?: string; // what the region was called when the battle was fought (older battles don't say)
};

// Battles since Pokémon-style invasions: the legacy fields above (rolls are each round's pairs, bonuses the hero
// aura and Fort), plus everything a viewer needs to re-enact the battle: the setup, the opening and every round's
// actions, reactions and events (each roll and re-roll with its throw seed), and the summary.
export type BattleDataV2 = BattleData &
  BattleRecord & {
    v: 2;
    how: ResultHow;
    rounds: number;
    result: string;
    heroes: { atk: HeroId[]; def: HeroId[] };
  };

// What a start-of-turn roll event carries, so the dice can be re-enacted without reading its text.
// All of it is public (the text already says who collected what). Which region paid whom stays in the
// fog, and so does what the ogres took from each Kird: only the raided Kird gets a RaidData event.
export type RollData = {
  roll: [number, number];
  got?: Record<string, Cost>; // not on a 7: what each player collected
  blight?: boolean; // bamboo blight was on, so bamboo regions paid nothing
  raided?: Record<string, number>; // on a 7: how many resource cards each raided player lost
};

// Private to the raided player: exactly what the ogres took, out of how many cards.
export type RaidData = { lost: Cost; held: number };

// Private to the active player: their start-of-turn harvest and income, as numbers.
export type IncomeData = {
  harvest: Cost;
  quarried: number; // Stone the ogres hauled in
  coin: number; // after ogre wages
  pandaCoin: number;
  camCoin: number;
  wages: number; // Coin paid to the ogres
  deserted: number; // unpaid ogres who walked off
};

export type Action =
  | { type: "build"; region: string; building: BuildingType }
  | { type: "recruit"; region: string; unit: "panda" | "nacam" | "cam"; count: number }
  | { type: "arm"; region: string; count: number }
  | { type: "gondola"; from: string; to: string }
  | { type: "move"; from: string; to: string; units: Partial<Units> }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "buy"; good: Resource; count: number }
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
  | { type: "rename"; region: string; name: string }
  | { type: "vote"; trial: string; guilty: boolean; sanction?: Sanction }
  | { type: "endTurn" }
  | { type: "skipTurn" }
  | { type: "autopilot"; on: boolean; level?: BotLevel }
  // Battles: one round (a move, a Bag item, a switch or a retreat, with an optional prep item), a reaction to the
  // dice while a round waits for one, finishing that round, or handing the rest of the battle to Sun Tzu.
  | { type: "battleRound"; action: BattleAction; prep?: ItemId }
  | { type: "battleReact"; id: ReactionId; die?: number }
  | { type: "battleResolve" }
  | { type: "battleAuto" }
  // The Bank's Bag and Armory, and Standing Orders (region left out: the player-wide default doctrine).
  | { type: "buyItem"; item: ItemId; count: number }
  | { type: "buyGear"; item: WeaponId; unit?: UnitType }
  | { type: "setOrders"; region?: string | null; doctrine?: PlayerDoctrineId | null; lead?: UnitType | HeroId | null; budget?: number; traps?: TrapId[] };

const BATTLE_ACTIONS = new Set<Action["type"]>(["battleRound", "battleReact", "battleResolve", "battleAuto"]);

// Who plays this seat automatically: computer players always, people only while on autopilot.
export const autoLevel = (p: Pick<Player, "bot" | "autopilot">): BotLevel | null => p.bot ?? p.autopilot ?? null;

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
export const regionName = (s: GameState, id: string) => placeName(id, s.regions[id]?.name);
export const ownedRegions = (s: GameState, pid: string) => Object.values(s.regions).filter((r) => r.owner === pid);
const heroesOf = (s: GameState, pid: string) => HERO_IDS.filter((h) => s.heroes[h].owner === pid);
export const hasHero = (s: GameState, pid: string, h: HeroId) => s.heroes[h].owner === pid;
const hasModifier = (s: GameState, k: ModifierKind) => s.modifiers.some((m) => m.kind === k && m.untilRound >= s.round);
export const inPact = (s: GameState, a: string, b: string) => s.pacts.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

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

export function buyPrice(s: GameState, pid: string) {
  return ownedRegions(s, pid).some((r) => r.buildings.includes("market")) ? BUY_PRICE_MARKET : BUY_PRICE;
}

// Natives never grow past their cap (world events and regrowth both respect it).
export function capNatives(r: RegionState) {
  if (r.owner || !r.native) return;
  const cap = NATIVE_CAP[r.native] ?? {};
  for (const t of UNIT_TYPES) {
    const max = cap[t] ?? 0;
    if (r.units[t] > max) r.units[t] = max;
  }
  r.tired = clampTired(r.tired, r.units);
}

export function bankRate(s: GameState, pid: string) {
  if (hasHero(s, pid, "ping")) return 2;
  if (ownedRegions(s, pid).some((r) => r.buildings.includes("market"))) return 3;
  return 4;
}

// ---------------------------------------------------------------- battles: bags, gear, orders

export const PLAYER_DOCTRINES: PlayerDoctrineId[] = ["turtle", "counter", "allin", "diplomat"];
export const DEFAULT_DOCTRINE: PlayerDoctrineId = "counter";
const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const WORLD_EVENT_IDS: WorldEventId[] = ["blight", "gondolaStrike", "mercMarket", "caseySale"];
const NATIVE_COLORS: Record<NativeNation, string> = { pandas: "#f7f4ec", nacams: "#6f8a3a", cams: "#e8b64a", wild: "#c9d6bf" };

export const bagOf = (p: Player): Bag => p.bag ?? {};
const armoryOf = (p: Player): Armory => (p.armory ??= { units: {} });
export const doctrineOf = (p: Player): PlayerDoctrineId => p.doctrine ?? DEFAULT_DOCTRINE;

// A region's Standing Orders with the defaults filled in.
export function ordersFor(s: GameState, r: RegionState): StandingOrders {
  const owner = r.owner ? s.players.find((p) => p.id === r.owner) : undefined;
  const o = r.orders ?? {};
  return {
    doctrine: o.doctrine ?? (owner ? doctrineOf(owner) : DEFAULT_DOCTRINE),
    doctrineSet: Boolean(o.doctrine),
    lead: o.lead ?? null,
    budget: o.budget ?? DEFAULT_ITEM_BUDGET,
    traps: [...(o.traps ?? [])],
  };
}

// Games saved before battles v2 lack the new fields: an empty Bag, no gear and no battle in progress.
// (Standing Orders need nothing: missing orders are the defaults.)
export function upgradeState(s: GameState): GameState {
  if (s.battle === undefined) s.battle = null;
  for (const p of s.players) {
    p.bag ??= {};
    p.armory ??= { units: {} };
  }
  return s;
}

// ---------------------------------------------------------------- events

type Draft = Omit<GameEvent, "seq" | "turn" | "round">;
export function emit(s: GameState, out: GameEvent[], e: Draft) {
  s.seq += 1;
  out.push({ seq: s.seq, turn: s.turn, round: s.round, ...e });
}

// ---------------------------------------------------------------- setup

// Catan's number distribution, stretched over the whole world.
const TOKEN_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export function createGame(seed: number, now: number, goal: number | null = null): GameState {
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
    goal,
    winner: null,
    battle: null,
    trials: [],
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
    // A good start has soft neighbours to grow into and a mix of resources nearby.
    const around = NEIGHBORS.get(r.id)!.map((n) => s.regions[n]);
    const soft = around.filter((n) => !n.owner && (n.native === "wild" || !n.native)).length;
    const mix = new Set(around.map((n) => REGION_BY_ID.get(n.id)!.resource)).size;
    return Math.min(nearest, 6000) + (r.native === "wild" ? 1500 : 0) + Math.min(soft, 3) * 700 + mix * 250 + rand(s) * 800;
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
  // Land you're given isn't land you took: only conquest comes with the right to rename.
  delete r.conqueror;
  p.capital = r.id;
}

export function addPlayer(s: GameState, id: string, name: string, bot?: BotLevel): GameEvent[] {
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
    bag: {},
    armory: { units: {} },
    crimes: [],
    grudges: {},
    sentence: null,
    convictions: 0,
    ...(bot ? { bot } : {}),
  };
  s.players.push(p);
  settle(s, p, r);
  // No free gondola: choosing where to build first is the opening move.
  const out: GameEvent[] = [];
  emit(s, out, { actor: id, type: "join", text: `${bot ? "🤖 " : ""}${p.name} joined the world, landing in ${regionName(s, r.id)}.`, regions: [r.id], public: true });
  // The very first Kird starts playing straight away, dice and all.
  if (s.players.length === 1) startTurn(s, out);
  return out;
}

// A Kird leaves for good: their land goes wild, heroes return to the Hall, their lines come down,
// and every deal involving them is off. The turn passes on if it was theirs.
export function removePlayer(s: GameState, id: string, now: number): GameEvent[] {
  if (!s.players.some((p) => p.id === id)) fail("That Kird isn't in this game.");
  const out: GameEvent[] = [];
  // A battle they're fighting (or defending) is settled by Sun Tzu before their land goes wild.
  if (s.battle && (s.battle.attacker === id || s.battle.defender === id)) finishOpenBattle(s, out);
  const i = s.players.findIndex((p) => p.id === id);
  const leaving = s.players[i];
  const wasActive = s.activeSeat === leaving.seat;
  for (const r of Object.values(s.regions)) {
    if (r.owner !== id) continue;
    r.owner = null;
    r.native = unitTotal(r.units) > 0 ? "wild" : null;
    r.tired = emptyUnits();
    delete r.orders;
    delete r.conqueror;
  }
  for (const h of HERO_IDS) if (s.heroes[h].owner === id) s.heroes[h] = { owner: null, region: null, movedTurn: 0 };
  for (const [lid, line] of Object.entries(s.lines)) if (line.owner === id) delete s.lines[lid];
  s.offers = s.offers.filter((o) => o.from !== id && o.to !== id);
  s.pacts = s.pacts.filter((p) => p.a !== id && p.b !== id);
  s.loans = s.loans.filter((l) => l.from !== id && l.to !== id);
  // The Tribunal drops their trial and tears up their votes.
  s.trials = trialsOf(s).filter((t) => t.accused !== id);
  for (const t of s.trials) delete t.votes[id];
  for (const p of s.players) if (p.grudges) delete p.grudges[id];
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
  if (s.winner) fail("This game is over.");
  // Autopilot can be switched on or off at any time, not just on your turn.
  if (a.type === "autopilot") {
    if (me.bot) fail("Computer players are always on autopilot.");
    if (a.on) {
      const level = a.level ?? "medium";
      if (!BOT_LEVELS.includes(level)) fail("Unknown autopilot setting.");
      // Handing over command mid-invasion: Sun Tzu fights the rest of the battle first.
      if (s.battle?.attacker === me.id) finishOpenBattle(s, out);
      me.autopilot = level;
      emit(s, out, { actor: me.id, type: "autopilot", text: `🤖 ${me.name} put their empire on autopilot. The computer plays their turns until they're back.`, regions: [], public: true });
    } else {
      if (!me.autopilot) fail("Autopilot is already off.");
      me.autopilot = null;
      emit(s, out, { actor: me.id, type: "autopilot", text: `🙋 ${me.name} is back in command.`, regions: [], public: true });
    }
    return out;
  }
  if (a.type === "skipTurn") {
    // The host is the first person at the table (computer players can't be hosts).
    const host = s.players.find((p) => !p.bot) ?? s.players[0];
    if (me.id !== host.id) fail("Only the game's host can skip a turn.");
    if (activePlayer(s).id === me.id) fail("Just end your own turn.");
    if (now - s.turnStartedAt < 12 * 3600 * 1000) fail("You can skip someone after they've had 12 hours.");
    emit(s, out, { actor: me.id, type: "skip", text: `${me.name} skipped ${activePlayer(s).name}'s turn.`, regions: [], public: true });
    endTurn(s, out, now);
    return out;
  }
  // The jury can vote whenever they like, not just on their own turn.
  if (a.type === "vote") {
    castVote(s, out, me, a);
    return out;
  }
  if (activePlayer(s).id !== me.id) fail(`It's ${activePlayer(s).name}'s turn.`);
  // While an invasion is being fought, it's all anyone at the table can do (ending the turn lets Sun Tzu finish it).
  if (s.battle && !BATTLE_ACTIONS.has(a.type) && a.type !== "endTurn") fail(`Finish the battle for ${regionName(s, s.battle.to)} first, or let Sun Tzu fight it for you.`);

  switch (a.type) {
    case "build": {
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("You can only build in your own regions.");
      const b = BUILDINGS[a.building] ?? fail("Unknown building.");
      if (r.buildings.includes(a.building)) fail(`${regionName(s, r.id)} already has a ${b.label}.`);
      pay(me, b.cost, `a ${b.label}`);
      r.buildings.push(a.building);
      emit(s, out, { actor: me.id, type: "build", text: `${me.name} built a ${b.icon} ${b.label} in ${regionName(s, r.id)}.`, regions: [r.id], data: { building: a.building } });
      break;
    }
    case "recruit": {
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("You can only recruit in your own regions.");
      enforce(me, "arms");
      if (!["panda", "nacam", "cam"].includes(a.unit)) fail("You can't recruit that.");
      const n = positiveInt(a.count, 20);
      if (a.unit === "cam" && !r.buildings.includes("gym")) fail("CAMs only train at a CAM Gym.");
      pay(me, scaleCost(unitCost(s, me.id, a.unit), n), `${n} ${UNITS[a.unit].plural}`);
      r.units[a.unit] += n;
      r.tired[a.unit] += n;
      const u = UNITS[a.unit];
      emit(s, out, { actor: me.id, type: "recruit", text: `${me.name} recruited ${n} ${u.icon} ${n === 1 ? u.label : u.plural} in ${regionName(s, r.id)}.`, regions: [r.id], data: { unit: a.unit, count: n } });
      break;
    }
    case "arm": {
      const r = regionOf(s, a.region);
      if (r.owner !== me.id) fail("You can only arm pandas in your own regions.");
      enforce(me, "arms");
      const n = positiveInt(a.count, 50);
      if (r.units.panda < n) fail(`There ${r.units.panda === 1 ? "is" : "are"} only ${r.units.panda} panda${r.units.panda === 1 ? "" : "s"} there.`);
      pay(me, scaleCost(UNITS.armedPanda.cost, n), `arming ${n} panda${n === 1 ? "" : "s"}`);
      const tiredPandas = Math.min(r.tired.panda, n);
      r.units.panda -= n;
      r.tired.panda -= tiredPandas;
      r.units.armedPanda += n;
      r.tired.armedPanda += tiredPandas;
      emit(s, out, { actor: me.id, type: "arm", text: `${me.name} armed ${n} panda${n === 1 ? "" : "s"} in ${regionName(s, r.id)}. 🛡️`, regions: [r.id], data: { count: n } });
      break;
    }
    case "gondola": {
      const from = regionOf(s, a.from);
      regionOf(s, a.to);
      if (from.owner !== me.id) fail("Gondola lines have to start in one of your regions.");
      enforce(me, "gondolas");
      if (!NEIGHBORS.get(a.from)!.includes(a.to)) fail(`${regionName(s, a.to)} is too far from ${regionName(s, a.from)} for a gondola.`);
      if (s.lines[lineId(a.from, a.to)]) fail("There's already a gondola line there.");
      if (hasModifier(s, "gondolaStrike")) fail("The gondola workers are on strike this round.");
      pay(me, gondolaCost(s, me.id), "a gondola line");
      s.lines[lineId(a.from, a.to)] = { owner: me.id, builtTurn: s.turn };
      emit(s, out, { actor: me.id, type: "gondola", text: `${me.name} built an urban gondola 🚡 from ${regionName(s, a.from)} to ${regionName(s, a.to)}.`, regions: [a.from, a.to] });
      break;
    }
    case "move":
      move(s, out, me, a);
      break;
    case "bankTrade": {
      enforce(me, "trade");
      if (!RESOURCES.includes(a.give) || !RESOURCES.includes(a.get) || a.give === a.get) fail("Pick two different resources.");
      const rate = bankRate(s, me.id);
      pay(me, { [a.give]: rate }, `a ${rate}:1 trade`);
      me.goods[a.get] += 1;
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} traded ${rate} ${GOOD_INFO[a.give].icon} for 1 ${GOOD_INFO[a.get].icon} at the World Bank.`, regions: [], only: [me.id] });
      break;
    }
    case "buy": {
      enforce(me, "trade");
      if (!RESOURCES.includes(a.good)) fail("The bank only sells resources.");
      const n = positiveInt(a.count, 20);
      const price = buyPrice(s, me.id);
      pay(me, { coin: price * n }, `${n} ${GOOD_INFO[a.good].label}`);
      me.goods[a.good] += n;
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} bought ${n} ${GOOD_INFO[a.good].icon} for ${price * n} 🪙 at the World Bank.`, regions: [], only: [me.id] });
      break;
    }
    case "exchange": {
      enforce(me, "trade");
      const x = EXCHANGE.find((e) => e.from === a.from && e.to === a.to) ?? fail("The bank doesn't do that exchange.");
      pay(me, { [x.from]: x.pay }, "that exchange");
      me.goods[x.to] += x.get;
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} exchanged ${x.pay} ${GOOD_INFO[x.from].icon} for ${x.get} ${GOOD_INFO[x.to].icon}.`, regions: [], only: [me.id] });
      break;
    }
    case "recruitHero": {
      const h = s.heroes[a.hero] ?? fail("No such hero.");
      if (h.owner) fail(`${HEROES[a.hero].name} already fights for ${playerById(s, h.owner).name}.`);
      enforce(me, "heroes", "no hero will sign up with a war criminal");
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
          ? `⚡ THE HEAVENS SPLIT. ${me.name} has recruited Casey, the Norse God, in ${regionName(s, r.id)}. ⚡`
          : `${me.name} recruited ${info.icon} ${info.name}, ${info.title}, in ${regionName(s, r.id)}.`,
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
      emit(s, out, { actor: me.id, type: "heroMove", text: `${HEROES[a.hero].icon} ${HEROES[a.hero].name} rode the gondola from ${regionName(s, from)} to ${regionName(s, a.to)}.`, regions: [from, a.to], data: { hero: a.hero } });
      break;
    }
    case "thunder": {
      if (!hasHero(s, me.id, "casey")) fail("Only Casey can call down thunder.");
      enforce(me, "heroes", "Casey won't throw thunder for a war criminal");
      if (me.thunderReadyTurn > s.turn) fail("Casey's thunder is still recharging.");
      const r = regionOf(s, a.target);
      if (r.owner === me.id) fail("Casey won't smite your own people.");
      if (!visibleRegions(s, me.id).has(r.id)) fail("Casey can only strike somewhere you can see.");
      if (r.owner && inPact(s, me.id, r.owner)) fail("You have a pact with them. Break it first.");
      const target = r.owner ? playerById(s, r.owner) : null;
      if (target) enforce(me, "ceasefire");
      const judged = target ? sizeUpAttack(s, me, target) : null;
      const killed = removeStrongest(r, 3);
      me.thunderReadyTurn = s.turn + THUNDER_COOLDOWN * Math.max(1, s.players.length);
      const victim = target ? target.name : `the ${r.native ?? "empty"} natives`;
      emit(s, out, { actor: me.id, type: "thunder", text: `⚡ Casey called down thunder on ${regionName(s, r.id)}, destroying ${describeUnits(killed) || "nothing but grass"} belonging to ${victim}.${thirstNote(judged)}`, regions: [r.id], public: true, data: { killed } });
      if (!r.owner && unitTotal(r.units) === 0) r.native = null;
      if (target) bookAttack(s, out, me, target, r.id, "thunder", judged!);
      break;
    }
    case "pickpocket": {
      if (!hasHero(s, me.id, "josserkid")) fail("Only the Josserkid picks pockets.");
      enforce(me, "heroes", "the Josserkid won't pick pockets for a war criminal");
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
      enforce(me, "trade");
      refuseSanctioned(to);
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
      if (r.units.panda - r.tired.panda < n) fail(`${regionName(s, r.id)} doesn't have ${n} rested panda${n === 1 ? "" : "s"}.`);
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
    case "battleRound":
    case "battleReact":
    case "battleResolve":
    case "battleAuto":
      battleStep(s, out, me, a);
      break;
    case "buyItem": {
      enforce(me, "arms");
      const item = Object.hasOwn(ITEMS, a.item) ? ITEMS[a.item] : fail("The Bank doesn't sell that.");
      const n = positiveInt(a.count, 20);
      const cost = scaleCost(item.cost, n);
      pay(me, cost, `${n} ${item.label}`);
      const bag = (me.bag ??= {});
      bag[a.item] = (bag[a.item] ?? 0) + n;
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} put ${n} × ${item.icon} ${item.label} in their Bag for ${costText(cost)}.`, regions: [], only: [me.id], data: { item: a.item, count: n } });
      break;
    }
    case "buyGear": {
      enforce(me, "arms");
      const gear = Object.hasOwn(WEAPONS, a.item) ? WEAPONS[a.item] : fail("The Armory doesn't make that.");
      const armory = armoryOf(me);
      if (gear.slot === "army") {
        pay(me, gear.cost, `a ${gear.label}`);
        armory.army = { id: a.item, charges: GEAR_BATTLES };
        emit(s, out, { actor: me.id, type: "bank", text: `${me.name} built a ${gear.icon} ${gear.label} for ${costText(gear.cost)}. It rolls with your next ${GEAR_BATTLES} invasions.`, regions: [], only: [me.id], data: { item: a.item } });
        break;
      }
      const unit = a.unit && UNIT_TYPES.includes(a.unit) ? a.unit : fail("Pick who carries it.");
      if (!gear.fits.includes(unit)) fail(`${UNITS[unit].plural} can't use a ${gear.label}.`);
      pay(me, gear.cost, `a ${gear.label}`);
      (armory.units[unit] ??= {})[gear.slot as "weapon" | "armor"] = { id: a.item, charges: GEAR_BATTLES };
      emit(s, out, { actor: me.id, type: "bank", text: `${me.name} fitted every ${UNITS[unit].label} with a ${gear.icon} ${gear.label} for ${costText(gear.cost)}. It lasts ${GEAR_BATTLES} battles.`, regions: [], only: [me.id], data: { item: a.item, unit } });
      break;
    }
    case "setOrders":
      setOrders(s, out, me, a);
      break;
    case "rename":
      rename(s, out, me, a);
      break;
    case "endTurn":
      // An invasion still being fought is settled by Sun Tzu before the turn passes.
      finishOpenBattle(s, out);
      emit(s, out, { actor: me.id, type: "endTurn", text: `${me.name} ended their turn.`, regions: [], public: true });
      // Turns played on autopilot don't count as "seen": the replay waits for the person to come back.
      if (!me.autopilot) me.lastTurnEndSeq = s.seq;
      endTurn(s, out, now);
      break;
    default:
      fail("Unknown action.");
  }
  checkThreat(s, out);
  return out;
}

// Reaching the goal isn't winning yet: everyone is warned, and the next round is their chance to stop it.
function checkThreat(s: GameState, out: GameEvent[]) {
  if (!s.goal || s.winner) return;
  const current = s.threat ? s.players.find((p) => p.id === s.threat) : undefined;
  if (s.threat && !current) s.threat = null; // they left the game
  if (current && ownedRegions(s, current.id).length < s.goal) {
    s.threat = null;
    emit(s, out, { actor: null, type: "threatOver", text: `😮‍💨 ${current.name} fell below ${s.goal} regions. The world is safe, for now.`, regions: [], public: true });
  }
  if (s.threat) return;
  const leader = s.players.find((p) => ownedRegions(s, p.id).length >= s.goal!);
  if (!leader) return;
  s.threat = leader.id;
  emit(s, out, {
    actor: leader.id,
    type: "threat",
    text: `⚠️ ${leader.name} holds ${ownedRegions(s, leader.id).length} regions! If they still hold ${s.goal} at the start of their next turn, they win. Stop them!`,
    regions: [leader.capital],
    public: true,
  });
}

// Victory is checked when a Kird's turn begins: they must have held the goal for a whole round.
function checkVictory(s: GameState, out: GameEvent[]) {
  if (!s.goal || s.winner) return false;
  const p = activePlayer(s);
  const held = ownedRegions(s, p.id).length;
  if (held < s.goal) return false;
  s.winner = p.id;
  s.threat = null;
  emit(s, out, {
    actor: p.id,
    type: "victory",
    text: `🏆 ${p.name} held ${held} regions for a whole round and wins the world! The game is over.`,
    regions: [p.capital],
    public: true,
  });
  return true;
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
    enforce(me, "trade");
    refuseSanctioned(from);
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
      text: `🐼🤝 Panda diplomacy: ${from.name} loaned ${o.count} panda${o.count === 1 ? "" : "s"} to ${me.name}, who welcomed them in ${regionName(s, dest.id)}. Both earn PandaCoin from the loan, and they're now at peace.`,
      regions: [r.id, dest.id],
      public: true,
    });
  }
}

// ---------------------------------------------------------------- names

export const NAME_MAX = 24;

// Names that only differ in capitals, spaces or punctuation count as the same name.
export const nameKey = (n: string) => n.normalize("NFKC").toLowerCase().replace(/[\s\u200d'’".,!?&_-]/gu, "");

// Tidies a name a Kird typed and checks it can go on the map: the rules and the rename box share this, so they
// always agree. `nameOf` gives any region's current name.
export function checkRegionName(id: string, raw: unknown, nameOf: (id: string) => string): { name: string; problem?: never } | { problem: string; name?: never } {
  if (typeof raw !== "string" || raw.length > 200) return { problem: `Give it a name of up to ${NAME_MAX} characters.` };
  const name = raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    // Keep the joiner that glues emoji together; drop every other invisible or direction-flipping character.
    .replace(/(?!\u200d)\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...name].length;
  if (length < 2) return { problem: "A name needs at least 2 characters." };
  if (length > NAME_MAX) return { problem: `Names can be up to ${NAME_MAX} characters.` };
  if (!/[\p{L}\p{N}]/u.test(name)) return { problem: "A name needs at least one letter or number." };
  if (/\p{M}{4}/u.test(name)) return { problem: "That's a lot of accents. Try something plainer." };
  const before = nameOf(id);
  if (name === before) return { problem: `It's already called ${before}.` };
  // Two places with the same name would make every order ambiguous, so names are unique, old ones included.
  const key = nameKey(name);
  for (const d of REGIONS) {
    if (d.id === id) continue;
    const now = nameOf(d.id);
    if (nameKey(now) === key) return { problem: `${now} is already on the map. Pick another name.` };
    if (nameKey(d.name) === key) return { problem: `${now} was once called ${d.name}. Pick another name.` };
  }
  return { name };
}

// Conquerors may rename what they took, while they hold it. Regions taken before names existed carry no
// record of who took them; the only land anyone gets without a fight is their home (where they landed,
// or were given asylum), so any other region they hold counts as conquered.
export function mayRename(r: RegionState, p: Player | undefined) {
  if (!p || r.owner !== p.id) return false;
  return r.conqueror !== undefined ? r.conqueror === p.id : r.id !== p.capital;
}

// Conquerors name what they take. The new name is public: everyone sees it, even through the fog.
function rename(s: GameState, out: GameEvent[], me: Player, a: Extract<Action, { type: "rename" }>) {
  const r = regionOf(s, a.region);
  if (r.owner !== me.id) fail("You can only rename land you hold.");
  if (!mayRename(r, me)) fail("Only conquerors rename: take a region to give it a new name.");
  const before = regionName(s, r.id);
  const check = checkRegionName(r.id, a.name, (id) => regionName(s, id));
  if (check.problem !== undefined) fail(check.problem);
  const name = check.name!;
  const original = REGION_BY_ID.get(r.id)!.name;
  if (name === original) delete r.name;
  else r.name = name;
  emit(s, out, {
    actor: me.id,
    type: "rename",
    text: name === original ? `🚩 ${me.name} gave ${before} back its old name, ${name}.` : `🚩 ${me.name} renamed ${before} to ${name}.`,
    regions: [r.id],
    public: true,
    data: { from: before, to: name },
  });
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
  if (!lineUsable(s, me.id, a.from, a.to)) fail(`There's no gondola line of yours between ${regionName(s, a.from)} and ${regionName(s, a.to)}. Build one first: urban gondolas are the only way to move troops.`);
  const units = readUnits(a.units);
  for (const t of UNIT_TYPES) {
    if (from.units[t] - from.tired[t] < units[t]) fail(`Not enough rested ${UNITS[t].plural} in ${regionName(s, from.id)}.`);
  }
  const piecerHere = s.heroes.piecer.owner === me.id && s.heroes.piecer.region === from.id;
  for (const t of UNIT_TYPES) from.units[t] -= units[t];

  if (to.owner === me.id) {
    for (const t of UNIT_TYPES) {
      to.units[t] += units[t];
      if (!piecerHere) to.tired[t] += units[t];
    }
    emit(s, out, { actor: me.id, type: "move", text: `${me.name} sent ${describeUnits(units)} by gondola from ${regionName(s, from.id)} to ${regionName(s, to.id)}.`, regions: [from.id, to.id], data: { units } });
    return;
  }

  // Everything below is an invasion.
  const defender = to.owner ? playerById(s, to.owner) : null;
  if (defender && inPact(s, me.id, defender.id)) fail(`You have a pact with ${defender.name}. Break it first if you really mean it.`);
  if (defender) enforce(me, "ceasefire");
  // Judged before anything changes hands, so "less than half your size" means before they lose the region.
  const judged = defender ? sizeUpAttack(s, me, defender) : null;

  if (unitTotal(to.units) === 0) {
    capture(s, out, me, to, units, defender);
    emit(s, out, { actor: me.id, type: "capture", text: `${me.name} rode into ${regionName(s, to.id)} unopposed and claimed it${defender ? ` from ${defender.name}` : ""}.${thirstNote(judged)}`, regions: [from.id, to.id], public: Boolean(defender), data: { units } });
    if (defender) bookAttack(s, out, me, defender, to.id, "invasion", judged!);
    return;
  }

  // A defended region means a battle. A person fights it round by round (it stays open in s.battle until it ends);
  // computer players and Kirds on autopilot have Sun Tzu fight it out at once.
  const lb = openBattle(s, me, from, to, units, defender);
  lb.thirst = judged?.points ?? 0;
  // The invasion counts toward Bloodthirst as it starts (during a trial it joins the charges), however it ends.
  if (defender) bookAttack(s, out, me, defender, to.id, "invasion", judged!);
  if (autoLevel(me)) {
    finishWithAi(lb);
    endBattle(s, out, lb);
  } else s.battle = lb;
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
  delete to.orders; // the old owner's Standing Orders leave with them
  to.conqueror = me.id;
  for (const h of HERO_IDS) {
    const hero = s.heroes[h];
    if (hero.region !== to.id || !hero.owner || hero.owner === me.id) continue;
    if (h === "casey") {
      hero.owner = me.id;
      emit(s, out, { actor: me.id, type: "heroCaptured", text: `⚡ ${me.name} CAPTURED Casey, the Norse God, in ${regionName(s, to.id)}! He now fights for them.`, regions: [to.id], public: true, data: { hero: h } });
    } else {
      hero.owner = null;
      hero.region = null;
      emit(s, out, { actor: me.id, type: "heroFled", text: `${HEROES[h].icon} ${HEROES[h].name} fled ${regionName(s, to.id)} and is back in the Hall of Heroes, ready to be recruited again.`, regions: [to.id], public: true, data: { hero: h } });
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
  // Heroes on strike won't lift a finger for a war criminal.
  if (sanctioned(playerById(s, pid), "heroes")) return 0;
  let b = 0;
  for (const h of HERO_IDS) {
    const hero = s.heroes[h];
    if (hero.owner === pid && hero.region === regionId) b += HEROES[h].combatBonus;
  }
  return b;
}

// ---------------------------------------------------------------- battles (Pokémon-style invasions)
// The rules live in ./battle/engine.ts. Here: who fights with what, what a round request does, and what the result
// does to the map. The engine battle is plain JSON, so an open battle simply lives in s.battle between requests.

const fromTally = (u: Partial<Record<UnitType, number>>): Units => ({ panda: u.panda ?? 0, armedPanda: u.armedPanda ?? 0, nacam: u.nacam ?? 0, cam: u.cam ?? 0 });
const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const heroLabel = (h: HeroId) => `${HEROES[h].icon} ${HEROES[h].name}`;
const describeForce = (u: Units, heroes: HeroId[]) => [describeUnits(u), ...heroes.map(heroLabel)].filter(Boolean).join(" and ");

// The gear a player's squads of one unit type carry into battle.
function gearFor(p: Player, t: UnitType): WeaponId[] {
  const g = p.armory?.units[t];
  return [g?.weapon, g?.armor].filter((x): x is GearCharge => Boolean(x && x.charges > 0)).map((x) => x.id);
}

// Every unit type that fights uses a charge of its gear, and every invasion a charge of the catapult. At 0 it breaks.
function wearGear(p: Player, present: Units, attacking: boolean) {
  const armory = p.armory;
  if (!armory) return;
  for (const t of UNIT_TYPES) {
    const g = armory.units[t];
    if (!g || present[t] <= 0) continue;
    for (const slot of ["weapon", "armor"] as const) {
      const c = g[slot];
      if (!c) continue;
      c.charges -= 1;
      if (c.charges <= 0) delete g[slot];
    }
    if (!g.weapon && !g.armor) delete armory.units[t];
  }
  if (attacking && armory.army) {
    armory.army.charges -= 1;
    if (armory.army.charges <= 0) delete armory.army;
  }
}

// Sets up the battle for an invasion of a defended region. The attackers have already left `from`.
function openBattle(s: GameState, me: Player, from: RegionState, to: RegionState, units: Units, defender: Player | null): LiveBattle {
  const seed = 1 + Math.floor(rand(s) * 2147483646);
  const throwBase = Math.floor(rand(s) * 4294967296);
  // Heroes fight in the battles fought from or in their region (not while the Tribunal has them on strike).
  const heroesIn = (p: Player | null, region: string) => (p && !sanctioned(p, "heroes") ? HERO_IDS.filter((h) => s.heroes[h].owner === p.id && s.heroes[h].region === region) : []);
  const atkHeroes = heroesIn(me, from.id);
  const defHeroes = heroesIn(defender, to.id);
  const native: NativeNation | null = defender ? null : (to.native ?? "wild");
  const orders = defender ? ordersFor(s, to) : null;
  const defenderStart = { ...to.units };
  const squadsOf = (u: Units, owner: Player | null, heroes: HeroId[]): SquadSpec[] => [
    ...UNIT_TYPES.filter((t) => u[t] > 0).map((t) => ({ unit: t, count: u[t], gear: owner ? gearFor(owner, t) : [] })),
    ...heroes.map((hero) => ({ hero })),
  ];
  const atkSquads = squadsOf(units, me, atkHeroes);
  let defSquads = squadsOf(defenderStart, defender, defHeroes);
  // Standing Orders say who meets the invaders first.
  const lead = orders?.lead ? defSquads.findIndex((q) => q.unit === orders.lead || q.hero === orders.lead) : -1;
  if (lead > 0) defSquads = [defSquads[lead], ...defSquads.filter((_, i) => i !== lead)];
  const cfg: BattleConfig = {
    seed,
    terrain: REGION_BY_ID.get(to.id)!.resource,
    buildings: [...to.buildings],
    events: WORLD_EVENT_IDS.filter((k) => hasModifier(s, k)),
    place: regionName(s, to.id),
    atk: {
      name: me.name,
      color: me.color,
      player: !autoLevel(me),
      doctrine: doctrineOf(me),
      squads: atkSquads,
      bag: { ...bagOf(me) },
      goods: { ...me.goods },
      catapult: Boolean(me.armory?.army && me.armory.army.charges > 0),
      thunderCharged: me.thunderReadyTurn <= s.turn,
    },
    def:
      defender && orders
        ? { name: defender.name, color: defender.color, doctrine: orders.doctrine, squads: defSquads, bag: { ...bagOf(defender) }, goods: { ...defender.goods }, thunderCharged: defender.thunderReadyTurn <= s.turn, traps: orders.traps, budget: orders.budget }
        : { name: NATIVE_NAMES[native!], color: NATIVE_COLORS[native!], native, squads: defSquads },
  };
  // The gear rides into battle (a charge each), and laid traps are sprung.
  wearGear(me, units, true);
  if (defender) wearGear(defender, defenderStart, false);
  if (to.orders?.traps?.length) to.orders.traps = [];
  const b = BE.createBattle(cfg);
  return {
    id: s.nextId++,
    attacker: me.id,
    defender: defender?.id ?? null,
    native,
    defenderName: defender ? defender.name : NATIVE_NAMES[native!],
    from: from.id,
    to: to.id,
    units: { ...units },
    defenderStart,
    heroes: { atk: atkHeroes, def: defHeroes },
    atkBonus: heroBonus(s, me.id, from.id),
    defBonus: (to.buildings.includes("fort") ? 1 : 0) + (defender ? heroBonus(s, defender.id, to.id) : 0),
    throwBase,
    thirst: 0,
    synced: { atk: { goods: { ...b.sides.atk.goods }, bag: { ...b.sides.atk.bag } }, def: defender ? { goods: { ...b.sides.def.goods }, bag: { ...b.sides.def.bag } } : null },
    b,
  };
}

// What a client sends for a round, checked for shape (the engine then checks it's allowed right now).
function readBattleAction(raw: unknown, prep: unknown): BattleAction {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : fail("Pick something to do.");
  const a: BattleAction =
    r.kind === "move" && typeof r.id === "string" && Object.hasOwn(MOVE_BY_ID, r.id)
      ? { kind: "move", id: r.id }
      : r.kind === "item" && typeof r.id === "string" && Object.hasOwn(ITEMS, r.id)
        ? { kind: "item", id: r.id as ItemId }
        : r.kind === "switch" && typeof r.to === "number" && Number.isInteger(r.to)
          ? { kind: "switch", to: r.to }
          : r.kind === "retreat"
            ? { kind: "retreat" }
            : fail("Pick something to do.");
  const p = prep ?? r.prep;
  if (p !== undefined && p !== null) a.prep = typeof p === "string" && Object.hasOwn(ITEMS, p) ? (p as ItemId) : fail("That item isn't in the bag.");
  return a;
}

// The defender's reaction, then the pairs, damage and effects.
function resolveRound(b: EngineBattle) {
  if (b.pending && !b.pending.done) BE.aiReact(b, "def");
  BE.finishRound(b);
}

// Sun Tzu fights whatever is left: the round waiting on the dice, then round after round until it's over.
function finishWithAi(lb: LiveBattle) {
  const b = lb.b;
  if (b.pending) {
    if (!b.pending.done) BE.aiReact(b, "atk");
    resolveRound(b);
  }
  for (let i = 0; !b.over; i++) {
    if (i > BATTLE_RULES.roundLimit) throw new Error("A battle ran past its round limit.");
    BE.autoRound(b);
  }
  stampSeeds(b, lb.throwBase);
}

function finishOpenBattle(s: GameState, out: GameEvent[]) {
  const lb = s.battle;
  if (!lb) return;
  finishWithAi(lb);
  endBattle(s, out, lb);
}

// One request's worth of the attacker's battle: a round, a reaction, resolving a round, or Sun Tzu for the rest.
function battleStep(s: GameState, out: GameEvent[], me: Player, a: Extract<Action, { type: "battleRound" | "battleReact" | "battleResolve" | "battleAuto" }>) {
  const lb = s.battle && s.battle.attacker === me.id ? s.battle : fail("There's no battle going on.");
  const b = lb.b;
  const P = b.pending;
  if (a.type === "battleRound") {
    if (P) fail("Finish this round first: react to the dice, or carry on.");
    const act = readBattleAction(a.action, a.prep);
    try {
      BE.validate(b, "atk", act);
    } catch (e) {
      fail((e as Error).message);
    }
    const round = BE.beginRound(b, act, BE.aiAction(b, "def"));
    // The round waits for the attacker only when there's a reaction to offer; otherwise it's fought out now.
    if (round.done) BE.finishRound(b);
    else if (!BE.reactionsFor(b, "atk").length) resolveRound(b);
  } else if (a.type === "battleReact") {
    const dice = (P && !P.done ? P : fail("There are no dice to react to.")).dice.atk ?? [];
    const opt = BE.reactionsFor(b, "atk").find((o) => o.id === a.id) ?? fail("You can't do that now.");
    const die = !opt.needsDie ? 0 : typeof a.die === "number" && Number.isInteger(a.die) && a.die >= 0 && a.die < dice.length ? a.die : fail("Pick one of your dice.");
    BE.react(b, "atk", opt.id, die);
  } else if (a.type === "battleResolve") {
    if (!P) fail("There's no round to finish.");
    resolveRound(b);
  } else finishWithAi(lb);
  stampSeeds(b, lb.throwBase);
  syncBattle(s, lb);
  if (b.over) endBattle(s, out, lb);
}

// The battle spends from copies of each player's purse and Bag; what changed goes back to the players.
function syncBattle(s: GameState, lb: LiveBattle) {
  for (const key of ["atk", "def"] as const) {
    const was = lb.synced[key];
    if (!was) continue;
    const side = lb.b.sides[key];
    const p = s.players.find((q) => q.id === (key === "atk" ? lb.attacker : lb.defender));
    if (p) {
      for (const g of GOODS) p.goods[g] = Math.max(0, p.goods[g] + side.goods[g] - was.goods[g]);
      const bag = (p.bag ??= {});
      for (const id of ITEM_IDS) {
        const n = Math.max(0, (bag[id] ?? 0) + (side.bag[id] ?? 0) - (was.bag[id] ?? 0));
        if (n) bag[id] = n;
        else delete bag[id];
      }
    }
    lb.synced[key] = { goods: { ...side.goods }, bag: { ...side.bag } };
  }
}

// A hero knocked out of the battle flees to the Hall of Heroes, except Casey, whom the other side takes if it's a Kird.
function heroDown(s: GameState, out: GameEvent[], lb: LiveBattle, h: HeroId, taker: Player | null, prefer: string | null) {
  const place = regionName(s, lb.to);
  const hero = s.heroes[h];
  const was = hero.region;
  const where = h === "casey" && taker ? ([prefer, taker.capital].find((id) => id && s.regions[id]?.owner === taker.id) ?? ownedRegions(s, taker.id)[0]?.id) : undefined;
  if (taker && where) {
    s.heroes[h] = { owner: taker.id, region: where, movedTurn: s.turn };
    emit(s, out, { actor: taker.id, type: "heroCaptured", text: `⚡ ${taker.name} CAPTURED Casey, the Norse God, in the battle for ${place}! He now fights for them.`, regions: [where], public: true, data: { hero: h } });
    return;
  }
  s.heroes[h] = { owner: null, region: null, movedTurn: hero.movedTurn };
  emit(s, out, { actor: lb.attacker, type: "heroFled", text: `${HEROES[h].icon} ${HEROES[h].name} was knocked out in the battle for ${place} and fled to the Hall of Heroes, ready to be recruited again.`, regions: was ? [was] : [lb.to], public: true, data: { hero: h } });
}

// The battle is over: every loss lands on the map, the survivors take the region or go home, and the record is kept.
function endBattle(s: GameState, out: GameEvent[], lb: LiveBattle) {
  const b = lb.b;
  stampSeeds(b, lb.throwBase);
  syncBattle(s, lb);
  s.battle = null;
  const result = b.result!;
  const sm = BE.summary(b);
  const me = playerById(s, lb.attacker);
  const defender = lb.defender ? (s.players.find((p) => p.id === lb.defender) ?? null) : null;
  const from = s.regions[lb.from];
  const to = s.regions[lb.to];
  const won = result.how === "won";
  const atkLeft = fromTally(sm.atk.survivors);
  const defLeft = fromTally(sm.def.survivors);
  const atkLost = fromTally(sm.atk.lost);
  const defLost = fromTally(sm.def.lost);

  // Casey's Thunder, called down in battle, recharges as it does on the map.
  for (const [key, p] of [["atk", me], ["def", defender]] as const) {
    if (p && b.cfg[key].thunderCharged && !b.sides[key].thunderCharged) p.thunderReadyTurn = s.turn + THUNDER_COOLDOWN * Math.max(1, s.players.length);
  }
  if (!won) {
    // The defenders who are left hold on, and the attackers who are left ride home, tired.
    to.units = defLeft;
    to.tired = clampTired(to.tired, to.units);
    if (!to.owner && unitTotal(to.units) === 0) to.native = null;
    for (const t of UNIT_TYPES) {
      from.units[t] += atkLeft[t];
      from.tired[t] += atkLeft[t];
    }
  }

  const place = regionName(s, lb.to);
  const force = describeForce(lb.units, lb.heroes.atk);
  const fell = describeUnits(defLost);
  const lost = describeUnits(atkLost);
  const rounds = `${b.round} round${b.round === 1 ? "" : "s"}`;
  const text: Record<ResultHow, string> = {
    won: `⚔️ ${me.name} invaded ${place} with ${force} and defeated ${lb.defenderName} in ${rounds}${fell ? ` (${fell} fell)` : ""}. ${place} is theirs.`,
    held: `⚔️ ${me.name} invaded ${place} with ${force}, but ${lb.defenderName} held the line. Every attacker fell${fell ? `, taking ${fell} with them` : ""}.`,
    retreat: `⚔️ ${me.name} invaded ${place} with ${force} and pulled back after ${rounds}${lost ? `, losing ${lost}` : ""}. ${capFirst(lb.defenderName)} held.`,
    truce: `🕊️ ${me.name} invaded ${place} with ${force}, and after ${rounds} both sides settled it over tea. Everyone went home.`,
    stalled: `⚔️ ${me.name}'s invasion of ${place} stalled after ${rounds}. ${capFirst(lb.defenderName)} held, and the attackers went home.`,
  };
  const data: BattleDataV2 = {
    attacker: { ...lb.units },
    attackerLost: atkLost,
    defenderStart: { ...lb.defenderStart },
    defenderLost: defLost,
    won,
    rolls: legacyRolls(b),
    atkBonus: lb.atkBonus,
    defBonus: lb.defBonus,
    defender: lb.defender ?? lb.native,
    defenderName: lb.defenderName,
    from: lb.from,
    to: lb.to,
    place,
    v: 2,
    how: result.how,
    rounds: b.round,
    result: result.text,
    heroes: lb.heroes,
    ...battleRecord(b, sm),
  };
  emit(s, out, { actor: me.id, type: "battle", text: text[result.how] + thirstNote({ points: lb.thirst, excuse: null }), regions: [lb.from, lb.to], public: Boolean(lb.defender), data });

  // The region changes hands (the defender's heroes there flee, and Casey is captured, as always).
  if (won) capture(s, out, me, to, atkLeft, defender);
  const fallen = (key: SideKey) => sm[key].heroes.filter((h) => !h.standing).map((h) => h.hero);
  for (const h of fallen("atk")) if (s.heroes[h].owner === me.id) heroDown(s, out, lb, h, defender, lb.to);
  for (const h of fallen("def")) if (defender && s.heroes[h].owner === defender.id) heroDown(s, out, lb, h, me, lb.from);
  // The attackers' heroes still standing march in with the survivors.
  if (won) {
    for (const h of lb.heroes.atk) {
      if (s.heroes[h].owner === me.id && sm.atk.heroes.some((x) => x.hero === h && x.standing)) s.heroes[h] = { owner: me.id, region: to.id, movedTurn: s.turn };
    }
  }
}

const leadLabel = (l: UnitType | HeroId) => ((UNIT_TYPES as string[]).includes(l) ? UNITS[l as UnitType].plural : HEROES[l as HeroId].name);

// Standing Orders for one region, or (no region) the doctrine every region follows unless told otherwise.
function setOrders(s: GameState, out: GameEvent[], me: Player, a: Extract<Action, { type: "setOrders" }>) {
  if (a.doctrine !== undefined && a.doctrine !== null && !PLAYER_DOCTRINES.includes(a.doctrine)) fail("Pick one of the four doctrines.");
  if (a.region === undefined || a.region === null) {
    if (a.lead !== undefined || a.budget !== undefined || a.traps !== undefined) fail("Pick a region for those orders.");
    if (a.doctrine === undefined) fail("Pick a doctrine.");
    if (a.doctrine === null) delete me.doctrine;
    else me.doctrine = a.doctrine;
    const d = DOCTRINES[doctrineOf(me)];
    emit(s, out, { actor: me.id, type: "orders", text: `${d.icon} ${me.name}'s troops now defend by ${d.label} wherever a region's orders don't say otherwise.`, regions: [], only: [me.id] });
    return;
  }
  const r = regionOf(s, a.region);
  if (r.owner !== me.id) fail("You can only give orders in your own regions.");
  const o: RegionOrders = { ...(r.orders ?? {}) };
  if (a.doctrine === null) delete o.doctrine;
  else if (a.doctrine !== undefined) o.doctrine = a.doctrine;
  if (a.lead === null) delete o.lead;
  else if (a.lead !== undefined) o.lead = (UNIT_TYPES as string[]).includes(a.lead) || (HERO_IDS as string[]).includes(a.lead) ? a.lead : fail("Pick who meets the invaders first.");
  if (a.budget !== undefined) {
    if (typeof a.budget !== "number" || !Number.isInteger(a.budget) || a.budget < 0 || a.budget > MAX_ITEM_BUDGET) fail(`The item budget is 0 to ${MAX_ITEM_BUDGET}.`);
    o.budget = a.budget;
  }
  if (a.traps !== undefined) {
    if (!Array.isArray(a.traps) || a.traps.some((t) => t !== "caltrops")) fail("Only caltrops can be laid in advance.");
    const want = a.traps.length > 0;
    const laid = (o.traps ?? []).includes("caltrops");
    const bag = (me.bag ??= {});
    if (want && !laid) {
      // Laid now and paid now: from the Bag if there are some, otherwise bought on the spot.
      if ((bag.caltrops ?? 0) > 0) {
        bag.caltrops! -= 1;
        if (!bag.caltrops) delete bag.caltrops;
      } else pay(me, ITEMS.caltrops.cost, "caltrops");
      o.traps = ["caltrops"];
    } else if (!want && laid) {
      // Picked up again, they go back in the Bag.
      bag.caltrops = (bag.caltrops ?? 0) + 1;
      o.traps = [];
    }
  }
  r.orders = o;
  const f = ordersFor(s, r);
  const d = DOCTRINES[f.doctrine];
  emit(s, out, {
    actor: me.id,
    type: "orders",
    text: `${d.icon} Standing Orders for ${regionName(s, r.id)}: ${d.label}, ${f.lead ? `${leadLabel(f.lead)} first, ` : ""}up to ${f.budget} Bag item${f.budget === 1 ? "" : "s"}${f.traps.length ? ", caltrops laid" : ""}.`,
    regions: [r.id],
    only: [me.id],
  });
}

type BattleResult = {
  attackerWon: boolean;
  attacker: Units;
  defender: Units;
  attackerLost: Units;
  defenderLost: Units;
  rolls: { a: number[]; d: number[] }[];
};

// Unit types strongest first for each stat (ties keep UNIT_TYPES order).
const BEST_FIRST = {
  attack: [...UNIT_TYPES].sort((x, y) => UNITS[y].attack - UNITS[x].attack),
  defense: [...UNIT_TYPES].sort((x, y) => UNITS[y].defense - UNITS[x].defense),
};

// The `n` best units for a stat, strongest first. Picked straight from the counts, so huge armies stay cheap to fight.
function best(u: Units, stat: "attack" | "defense", n: number) {
  const out: UnitType[] = [];
  for (const t of BEST_FIRST[stat]) for (let i = 0; i < u[t] && out.length < n; i++) out.push(t);
  return out;
}

// Risk-style: up to 3 attacking dice vs 2 defending, highest against highest, ties go to the defender.
// Each die gets the unit's attack/defence bonus plus heroes and forts. Fought to the last unit.
export function battle(s: GameState, attacker: Units, atkBonus: number, defender: Units, defBonus: number): BattleResult {
  const a = { ...attacker };
  const d = { ...defender };
  const attackerLost = emptyUnits();
  const defenderLost = emptyUnits();
  const rolls: BattleResult["rolls"] = [];
  let guard = 0;
  while (unitTotal(a) > 0 && unitTotal(d) > 0 && guard++ < 1000) {
    const aUnits = best(a, "attack", 3);
    const dUnits = best(d, "defense", 2);
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

// ---------------------------------------------------------------- war crimes
// Attack other Kirds too often and your Bloodthirst builds. At TRIAL_AT the Kirds' Tribunal puts you on trial:
// everyone else votes, secretly, and each guilty vote picks a punishment. Convicted war criminals lose those
// abilities for a few turns, and attacking them is no crime until they've served their sentence.

export type Excuse = "threat" | "criminal" | "defence";
export type Judgement = { points: number; excuse: Excuse | null };

// How much an attack on another Kird weighs: nothing if it's excused, 2 if they hold less than half as many
// regions as you, otherwise 1. An eye for an eye is no crime: every attack you suffer earns one free strike
// back at that attacker, but escalating past that counts. Pure, so your own view can preview it.
export function judgeAttack(
  attacker: { regions: number; grudges?: Record<string, number[]> },
  victim: { id: string; regions: number; threat: boolean; criminal: boolean },
  round: number,
): Judgement {
  if (victim.threat) return { points: 0, excuse: "threat" };
  if (victim.criminal) return { points: 0, excuse: "criminal" };
  if (grudgeAgainst(attacker, victim.id, round) > 0) return { points: 0, excuse: "defence" };
  return { points: victim.regions * 2 < attacker.regions ? 2 : 1, excuse: null };
}

// Unanswered attacks by `from` that still entitle this Kird to strike back.
export const grudgeAgainst = (p: { grudges?: Record<string, number[]> }, from: string, round: number) =>
  (p.grudges?.[from] ?? []).filter((r) => r > round - BLOODTHIRST_ROUNDS).length;

export const trialsOf = (s: GameState) => s.trials ?? [];
export const trialFor = (s: GameState, pid: string) => trialsOf(s).find((t) => t.accused === pid);
export const sentenceOf = (p: Pick<Player, "sentence">) => (p.sentence && p.sentence.turnsLeft > 0 ? p.sentence : null);
export const sanctioned = (p: Pick<Player, "sentence">, k: Sanction) => Boolean(sentenceOf(p)?.sanctions.includes(k));
// Attacks count for this round and the two before.
export const recentCrimes = (p: Pick<Player, "crimes">, round: number) => (p.crimes ?? []).filter((c) => c.round > round - BLOODTHIRST_ROUNDS);
export const bloodthirst = (p: Pick<Player, "crimes">, round: number) => recentCrimes(p, round).reduce((n, c) => n + c.points, 0);
const recentGrudges = (rounds: number[] | undefined, round: number) => (rounds ?? []).filter((r) => r > round - BLOODTHIRST_ROUNDS);

export function sizeUpAttack(s: GameState, attacker: Player, victim: Player): Judgement {
  return judgeAttack(
    { regions: ownedRegions(s, attacker.id).length, grudges: attacker.grudges },
    { id: victim.id, regions: ownedRegions(s, victim.id).length, threat: s.threat === victim.id, criminal: Boolean(sentenceOf(victim)) },
    s.round,
  );
}

const thirstNote = (j: Judgement | null) => (j?.points ? ` 🩸+${j.points}` : "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
const sanctionList = (ks: Sanction[]) => ks.map((k) => `${SANCTION_INFO[k].icon} ${SANCTION_INFO[k].label}`).join(", ");

// Stops a war criminal doing what the Tribunal took away.
function enforce(p: Player, k: Sanction, why?: string) {
  const sentence = sentenceOf(p);
  if (!sentence?.sanctions.includes(k)) return;
  const info = SANCTION_INFO[k];
  fail(`${info.icon} ${info.label}: ${why ?? `war criminals can't ${info.rule}`}. Your sentence has ${plural(sentence.turnsLeft, "turn")} left.`);
}

function refuseSanctioned(other: Player) {
  if (sanctioned(other, "trade")) fail(`${SANCTION_INFO.trade.icon} ${SANCTION_INFO.trade.label}: nobody can trade with ${other.name}, a convicted war criminal.`);
}

// Every attack on another Kird gives the victim a free strike back, and unless it's excused it feeds the
// attacker's Bloodthirst. During an open trial it's added to the charges.
function bookAttack(s: GameState, out: GameEvent[], me: Player, victim: Player, region: string, kind: Crime["kind"], judged: Judgement) {
  const grudges = (victim.grudges ??= {});
  grudges[me.id] = [...(grudges[me.id] ?? []), s.round];
  // Striking back uses up the oldest grudge.
  if (judged.excuse === "defence") me.grudges![victim.id] = recentGrudges(me.grudges![victim.id], s.round).slice(1);
  if (!judged.points) return;
  const crime: Crime = { round: s.round, victim: victim.id, region, kind, points: judged.points };
  (me.crimes ??= []).push(crime);
  const open = trialFor(s, me.id);
  if (open) open.charges.push({ ...crime });
  else openTrialIfDue(s, out, me);
}

function openTrialIfDue(s: GameState, out: GameEvent[], p: Player) {
  const heat = bloodthirst(p, s.round);
  if (heat < TRIAL_AT || s.players.length < TRIAL_MIN_KIRDS || trialFor(s, p.id)) return;
  const charges = recentCrimes(p, s.round).map((c) => ({ ...c }));
  const trial: Trial = { id: `t${s.nextId++}`, accused: p.id, openedRound: s.round, charges, votes: {} };
  (s.trials ??= []).push(trial);
  const victims = [...new Set(charges.map((c) => c.victim))].map((id) => s.players.find((q) => q.id === id)?.name ?? "a Kird who left");
  emit(s, out, {
    actor: null,
    type: "trial",
    text: `🚨 WAR CRIMES! ${p.name}'s Bloodthirst hit ${heat} after ${plural(charges.length, "attack")} on ${listNames(victims)}. The Kirds' Tribunal puts ${p.name} on trial: everyone else votes Guilty or Not guilty before ${p.name}'s next turn.`,
    regions: [...new Set(charges.map((c) => c.region))],
    public: true,
    data: { accused: p.id, trial: trial.id },
  });
}

function castVote(s: GameState, out: GameEvent[], me: Player, a: Extract<Action, { type: "vote" }>) {
  const trial = trialsOf(s).find((t) => t.id === a.trial) ?? fail("That trial is over.");
  if (trial.accused === me.id) fail("You can't vote in your own trial. Plead your case in chat instead.");
  if (typeof a.guilty !== "boolean") fail("Guilty or not guilty?");
  if (a.guilty && !SANCTIONS.includes(a.sanction as Sanction)) fail("A guilty vote comes with a punishment. Pick one.");
  const accused = playerById(s, trial.accused);
  const again = Boolean(trial.votes[me.id]);
  trial.votes[me.id] = a.guilty ? { guilty: true, sanction: a.sanction } : { guilty: false };
  const asked = a.guilty ? `, asking for ${sanctionList([a.sanction!])}` : "";
  emit(s, out, {
    actor: me.id,
    type: "vote",
    text: `⚖️ You ${again ? "changed your vote to" : "voted"} ${a.guilty ? "GUILTY" : "NOT GUILTY"} in ${accused.name}'s war crimes trial${asked}. Only you can see how you voted.`,
    regions: [],
    only: [me.id],
    data: { trial: trial.id },
  });
  settleTrials(s, out);
}

// A trial ends early once the whole jury has voted, but never in the middle of the accused's own turn:
// then the verdict waits until that turn ends.
function settleTrials(s: GameState, out: GameEvent[]) {
  const active = activePlayer(s)?.id;
  for (const t of [...trialsOf(s)]) {
    if (t.accused !== active && s.players.every((p) => p.id === t.accused || t.votes[p.id])) closeTrial(s, out, t);
  }
}

function closeTrial(s: GameState, out: GameEvent[], t: Trial) {
  s.trials = trialsOf(s).filter((x) => x !== t);
  const accused = s.players.find((p) => p.id === t.accused);
  if (!accused) return;
  // Whatever the verdict, the slate is wiped: these attacks have been judged.
  accused.crimes = [];
  const ballots = Object.entries(t.votes)
    .filter(([id]) => id !== accused.id && s.players.some((p) => p.id === id))
    .map(([, v]) => v);
  const guilty = ballots.filter((v) => v.guilty);
  const innocent = ballots.length - guilty.length;
  const data = { accused: accused.id, trial: t.id, guilty: guilty.length > innocent, votes: [guilty.length, innocent] };
  if (guilty.length <= innocent) {
    const text = !ballots.length
      ? `⚖️ Nobody voted, so the Tribunal threw out the case against ${accused.name}. Their Bloodthirst is wiped clean.`
      : guilty.length === innocent
        ? `⚖️ NOT GUILTY: the jury split ${guilty.length} to ${innocent}, and a tie goes to the accused. ${accused.name} walks free, Bloodthirst wiped clean.`
        : `⚖️ NOT GUILTY, ${innocent} to ${guilty.length}. ${accused.name} walks free, Bloodthirst wiped clean.`;
    emit(s, out, { actor: null, type: "verdict", text, regions: [], public: true, data });
    return;
  }
  // Every punishment a guilty juror asked for is imposed. Repeat offenders serve longer.
  const sanctions = SANCTIONS.filter((k) => guilty.some((v) => v.sanction === k));
  const prior = accused.convictions ?? 0;
  const turns = SENTENCE_TURNS + REPEAT_OFFENDER_TURNS * prior;
  const serving = sentenceOf(accused);
  accused.sentence = {
    sanctions: SANCTIONS.filter((k) => sanctions.includes(k) || serving?.sanctions.includes(k)),
    turnsLeft: Math.max(turns, serving?.turnsLeft ?? 0),
  };
  accused.convictions = prior + 1;
  if (sanctioned(accused, "trade")) s.offers = s.offers.filter((o) => o.kind !== "trade" || (o.from !== accused.id && o.to !== accused.id));
  emit(s, out, {
    actor: null,
    type: "verdict",
    text: `⚖️ GUILTY, ${guilty.length} to ${innocent}. ${accused.name} is a convicted war criminal for ${plural(accused.sentence.turnsLeft, "turn")}${prior ? ` (a repeat offender: conviction #${prior + 1})` : ""}. Punishment: ${sanctionList(accused.sentence.sanctions)}. Until it's served, attacking ${accused.name} is no crime.`,
    regions: [],
    public: true,
    data: { ...data, sanctions: accused.sentence.sanctions },
  });
}

// A sentence ticks down at the end of each of the war criminal's turns.
function serveSentence(s: GameState, out: GameEvent[], p: Player) {
  const sentence = sentenceOf(p);
  if (!sentence) return;
  sentence.turnsLeft -= 1;
  if (sentence.turnsLeft > 0) return;
  p.sentence = null;
  emit(s, out, { actor: null, type: "pardon", text: `🕊️ ${p.name} has served their sentence for war crimes. The Tribunal lifts its sanctions.`, regions: [], public: true, data: { player: p.id } });
}

// ---------------------------------------------------------------- turns

function endTurn(s: GameState, out: GameEvent[], now: number) {
  // A battle can't outlast the turn it started in (a skipped turn, say): Sun Tzu finishes it.
  finishOpenBattle(s, out);
  // Rest everyone who just played.
  const prev = activePlayer(s);
  for (const r of ownedRegions(s, prev.id)) r.tired = emptyUnits();
  serveSentence(s, out, prev);
  s.turn += 1;
  const nextSeat = (s.activeSeat + 1) % s.players.length;
  if (nextSeat === 0) newRound(s, out);
  s.activeSeat = nextSeat;
  s.turnStartedAt = now;
  // A jury that finished voting during the accused's turn gives its verdict now that the turn is over.
  settleTrials(s, out);
  startTurn(s, out);
}

function newRound(s: GameState, out: GameEvent[]) {
  s.round += 1;
  s.modifiers = s.modifiers.filter((m) => m.untilRound >= s.round);
  // Old attacks stop counting toward Bloodthirst, and old grudges are forgotten.
  for (const p of s.players) {
    if (p.crimes?.length) p.crimes = recentCrimes(p, s.round);
    for (const [id, rounds] of Object.entries(p.grudges ?? {})) {
      const left = recentGrudges(rounds, s.round);
      if (left.length) p.grudges![id] = left;
      else delete p.grudges![id];
    }
  }
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
  // Older games may hold garrisons above today's caps; this brings them back into line.
  for (const r of Object.values(s.regions)) capNatives(r);
  emit(s, out, { actor: null, type: "world", text: `🌍 Round ${s.round} — ${card.title}: ${text}`, regions: [], public: true, data: { card: card.id } });
}

function startTurn(s: GameState, out: GameEvent[]) {
  const p = activePlayer(s);
  if (checkVictory(s, out)) return;

  // The Tribunal reads its verdict as the accused's next turn begins.
  const trial = trialFor(s, p.id);
  if (trial) closeTrial(s, out, trial);

  // Exiles get a fresh start: Panda Asylum.
  if (!ownedRegions(s, p.id).length) {
    const r = spawnRegion(s);
    if (r) {
      settle(s, p, r);
      r.units = { ...emptyUnits(), panda: 2 };
      p.respawns += 1;
      emit(s, out, { actor: p.id, type: "asylum", text: `🕊️ ${p.name} lost everything, and was granted Panda Asylum in ${regionName(s, r.id)} with 2 pandas.`, regions: [r.id], public: true });
    }
  }

  // Catan dice: everyone's matching regions produce.
  const roll: [number, number] = [d6(s), d6(s)];
  s.lastRoll = roll;
  const total = roll[0] + roll[1];
  if (total === 7) {
    const raids: { q: Player; lost: Cost; held: number }[] = [];
    for (const q of s.players) {
      const held = RESOURCES.reduce((n, g) => n + q.goods[g], 0);
      if (held <= RAID_THRESHOLD) continue;
      const before = { ...q.goods };
      let lose = Math.floor(held / 2);
      while (lose > 0) {
        const g = pick(s, RESOURCES.filter((x) => q.goods[x] > 0));
        q.goods[g] -= 1;
        lose -= 1;
      }
      const lost: Cost = {};
      for (const g of RESOURCES) if (before[g] > q.goods[g]) lost[g] = before[g] - q.goods[g];
      raids.push({ q, lost, held });
    }
    const hit = raids.map((r) => r.q.name);
    emit(s, out, {
      actor: p.id,
      type: "roll",
      text: `🎲 ${p.name} rolled 7: OGRE RAID! 👹 ${hit.length ? `${hit.join(", ")} lost half their resources.` : "Nobody was carrying enough to raid."}`,
      regions: [],
      public: true,
      data: { roll, raided: Object.fromEntries(raids.map((r) => [r.q.id, Math.floor(r.held / 2)])) } satisfies RollData,
    });
    // Each raided Kird learns exactly what the ogres took; everyone else only learns how many cards.
    for (const { q, lost, held } of raids) {
      emit(s, out, {
        actor: p.id,
        type: "raid",
        text: `👹 The ogres raided you and took ${costText(lost)}: ${Math.floor(held / 2)} of your ${held} resource cards.`,
        regions: [],
        only: [q.id],
        data: { lost, held } satisfies RaidData,
      });
    }
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
      data: { roll, got, ...(blight ? { blight } : {}) } satisfies RollData,
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

  // Ogre quarries: the more NACAMs you have, the likelier some Stone turns up.
  let quarried = 0;
  const haulers = ownedRegions(s, p.id).reduce((n, r) => n + r.units.nacam, 0);
  for (let i = 0; i < haulers && quarried < QUARRY_MAX; i++) if (rand(s) < QUARRY_CHANCE) quarried++;
  p.goods.stone += quarried;

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
  let wages = 0;
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
    wages = due - deserted * NACAM_UPKEEP;
  }
  p.goods.coin += coin;
  p.goods.pandaCoin += pandaCoin;
  p.goods.camCoin += camCoin;
  emit(s, out, { actor: p.id, type: "turn", text: `It's ${p.name}'s turn.`, regions: [], public: true });
  emit(s, out, {
    actor: p.id,
    type: "income",
    text: `Harvest: ${costText(harvest) || "nothing"}.${quarried ? ` 👹 Ogre quarry: +${quarried} 🪨.` : ""} Income: ${coin >= 0 ? "+" : ""}${coin} 🪙, +${pandaCoin} 🐼, +${camCoin} 💪${ogres && !hasHero(s, p.id, "cockpenis") ? ` (after ${ogres} 🪙 ogre upkeep)` : ""}.${deserted ? ` 👹 ${deserted} unpaid ogre${deserted === 1 ? "" : "s"} deserted!` : ""}`,
    regions: [],
    only: [p.id],
    data: { harvest, quarried, coin, pandaCoin, camCoin, wages, deserted } satisfies IncomeData,
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
  name?: string; // a conqueror's new name: public, so it shows through the fog too
  renamable?: boolean; // you conquered it and still hold it
  owner?: string | null;
  native?: NativeNation | null;
  units?: Units;
  tired?: Units;
  buildings?: BuildingType[];
  orders?: StandingOrders; // only your own regions
};

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  seat: number;
  bot?: BotLevel;
  autopilot?: BotLevel | null;
  regions: number;
  cards: number; // total resources held, like Catan's hand size
  heroes: HeroId[];
  goods?: Goods; // only your own
  capital?: string;
  thunderReadyTurn?: number;
  pickpocketTurn?: number;
  oathbreaker: boolean;
  lastTurnEndSeq?: number;
  // War crimes are public: every attack between Kirds is announced anyway.
  bloodthirst: number;
  sentence: Sentence | null;
  convictions: number;
  // Only your own: the attacks still counting against you, and the free strikes back you're owed.
  crimes?: Crime[];
  grudges?: Record<string, number[]>;
  // Only your own:
  bag?: Bag;
  armory?: Armory;
  doctrine?: PlayerDoctrineId;
};

// The invasion you're fighting: the whole engine battle (run actionsFor / preview / estimate on `b` locally), with the
// RNG states and the defender's purse, Bag and item budget hidden. Rounds play out from b.log; a round waiting on
// your reaction is b.pending.
export type BattleView = {
  id: number;
  from: string;
  to: string;
  defender: string | null;
  native: NativeNation | null;
  defenderName: string;
  heroes: { atk: HeroId[]; def: HeroId[] };
  b: EngineBattle;
};

// A trial as one juror sees it: who has voted, but only their own ballot.
export type TrialView = { id: string; accused: string; openedRound: number; charges: Crime[]; voters: string[]; myVote: Vote | null };

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
  prices: { gondola: Cost; units: Record<UnitType, Cost>; heroes: Record<HeroId, Cost>; bankRate: number; buyPrice: number };
  goal: number | null;
  winner: string | null;
  threat: string | null;
  battle: BattleView | null; // only the attacker sees a battle in progress
  trials: TrialView[];
};

export function viewFor(s: GameState, pid: string): GameView {
  const vis = visibleRegions(s, pid);
  const viewer = s.players.find((p) => p.id === pid);
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
      ...(p.bot ? { bot: p.bot } : {}),
      ...(p.autopilot ? { autopilot: p.autopilot } : {}),
      regions: ownedRegions(s, p.id).length,
      cards: RESOURCES.reduce((n, g) => n + p.goods[g], 0),
      heroes: heroesOf(s, p.id),
      oathbreaker: p.oathbreakerUntilRound >= s.round,
      bloodthirst: bloodthirst(p, s.round),
      sentence: sentenceOf(p) ? { sanctions: [...p.sentence!.sanctions], turnsLeft: p.sentence!.turnsLeft } : null,
      convictions: p.convictions ?? 0,
      ...(p.id === pid
        ? {
            goods: { ...p.goods },
            capital: p.capital,
            thunderReadyTurn: p.thunderReadyTurn,
            pickpocketTurn: p.pickpocketTurn,
            lastTurnEndSeq: p.lastTurnEndSeq,
            crimes: recentCrimes(p, s.round).map((c) => ({ ...c })),
            grudges: Object.fromEntries(
              Object.entries(p.grudges ?? {})
                .map(([id, r]) => [id, recentGrudges(r, s.round)] as const)
                .filter(([, r]) => r.length),
            ),
            bag: { ...bagOf(p) },
            armory: structuredClone(p.armory ?? { units: {} }),
            doctrine: doctrineOf(p),
          }
        : {}),
    })),
    regions: Object.values(s.regions).map((r) => {
      const named = r.name ? { name: r.name } : {};
      if (!vis.has(r.id)) return { id: r.id, token: r.token, fog: true, ...named };
      const mine = r.owner === pid;
      return {
        id: r.id,
        token: r.token,
        fog: false,
        ...named,
        ...(mayRename(r, viewer) ? { renamable: true } : {}),
        owner: r.owner,
        native: r.native,
        units: { ...r.units },
        tired: mine ? { ...r.tired } : undefined,
        buildings: [...r.buildings],
        ...(mine ? { orders: ordersFor(s, r) } : {}),
      };
    }),
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
      buyPrice: buyPrice(s, pid),
    },
    goal: s.goal ?? null,
    winner: s.winner ?? null,
    threat: s.threat ?? null,
    battle: s.battle && s.battle.attacker === pid ? battleView(s.battle) : null,
    trials: trialsOf(s).map((t) => ({
      id: t.id,
      accused: t.accused,
      openedRound: t.openedRound,
      charges: t.charges.map((c) => ({ ...c })),
      voters: Object.keys(t.votes),
      myVote: t.votes[pid] ? { ...t.votes[pid] } : null,
    })),
  };
}

function battleView(lb: LiveBattle): BattleView {
  return { id: lb.id, from: lb.from, to: lb.to, defender: lb.defender, native: lb.native, defenderName: lb.defenderName, heroes: { atk: [...lb.heroes.atk], def: [...lb.heroes.def] }, b: redactBattle(lb.b) };
}

export { CURRENCIES };
