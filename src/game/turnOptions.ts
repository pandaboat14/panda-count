// Everything you could do on your turn, worked out from your own view (so the fog never leaks): what you can
// attack and from where, where your troops can go, what you can build or recruit and where, and what ending
// the turn now would leave unused. The stepped turn menu is built on these.
import { emptyUnits, unitTotal, type GameView, type RegionView, type Units } from "./engine";
import { fillCost } from "./advisor";
import { restedIn } from "./army";
import { attackOdds, type Odds } from "./odds";
import { NEIGHBORS, REGION_BY_ID, lineId, placeName } from "./regions";
import {
  BUILDINGS,
  BUILDING_TYPES,
  COIN_PER_REGION,
  GOODS,
  GYM_CAMCOIN,
  HERO_IDS,
  MARKET_COIN,
  NACAM_UPKEEP,
  PANDAS_PER_PANDACOIN,
  RAID_THRESHOLD,
  RESOURCES,
  SANCTUARY_PANDACOIN,
  UNITS,
  type BuildingType,
  type Cost,
  type HeroId,
  type Sanction,
} from "./rules";
import { attackCost, ballotsDue, sanctionedIn, tribunalSits } from "./tribunal";

export const regionIn = (view: GameView, id: string) => view.regions.find((r) => r.id === id);
export const myRegions = (view: GameView) => view.regions.filter((r) => r.owner === view.me);
export const meIn = (view: GameView) => view.players.find((p) => p.id === view.me)!;
export const unitsOf = (r?: RegionView): Units => ({ ...emptyUnits(), ...r?.units });

export function atPeace(view: GameView, other: string | null | undefined) {
  return Boolean(other) && view.pacts.some((p) => (p.a === view.me && p.b === other) || (p.b === view.me && p.a === other));
}

export const scaleCost = (c: Cost, k: number): Cost => Object.fromEntries(Object.entries(c).map(([g, n]) => [g, (n ?? 0) * k])) as Cost;

// Chance that two dice roll this number (7 never produces).
export const rollChance = (n: number) => (n === 7 ? 0 : (6 - Math.abs(7 - n)) / 36);

// What a region is called now: a conqueror may have renamed it.
export const nameIn = (view: GameView, id: string) => placeName(id, regionIn(view, id)?.name);
const byName = (view: GameView) => (a: string, b: string) => nameIn(view, a).localeCompare(nameIn(view, b));

// Regions you hold that touch land that isn't yours come first: that's where the action is.
export function frontFirst(view: GameView, ids: string[]) {
  const cap = meIn(view).capital;
  const border = (id: string) => (NEIGHBORS.get(id) ?? []).some((n) => regionIn(view, n)?.owner !== view.me);
  return [...ids].sort((a, b) => Number(b === cap) - Number(a === cap) || Number(border(b)) - Number(border(a)) || byName(view)(a, b));
}

// Your regions in a steady order for hopping between them: capital first, then A to Z.
export function territoryOrder(view: GameView) {
  const cap = meIn(view).capital;
  return myRegions(view)
    .map((r) => r.id)
    .sort((a, b) => Number(b === cap) - Number(a === cap) || byName(view)(a, b));
}

// What a war crimes sentence has taken from you.
export const barred = (view: GameView, k: Sanction) => sanctionedIn(view, view.me, k);

// What attacking `target` would do to your Bloodthirst (null for natives, empty land, or a world without a Tribunal).
export function thirstFor(view: GameView, target: string) {
  return tribunalSits(view) ? attackCost(view, regionIn(view, target)?.owner) : null;
}

// ---------------------------------------------------------------- money

// Can you pay: outright, after buying the missing resources with Coin, or not at all (and what's missing)?
export type Afford = { status: "yes" } | { status: "buy"; buy: Cost; coin: number } | { status: "no"; short: Cost };

export function afford(view: GameView, cost: Cost): Afford {
  const goods: Cost = meIn(view).goods ?? {};
  if (GOODS.every((g) => (goods[g] ?? 0) >= (cost[g] ?? 0))) return { status: "yes" };
  // Under Trade sanctions the Bank won't sell you what's missing.
  const fill = barred(view, "trade") ? null : fillCost(goods, cost, view.prices.buyPrice);
  if (fill) return { status: "buy", ...fill };
  const short: Cost = {};
  for (const g of GOODS) {
    const n = (cost[g] ?? 0) - (goods[g] ?? 0);
    if (n > 0) short[g] = n;
  }
  return { status: "no", short };
}

// ---------------------------------------------------------------- gondolas

// A line you can ride ("ours"), no line yet ("none"), or someone else's line you can't use ("theirs").
export type LineState = "ours" | "none" | "theirs";

export function lineState(view: GameView, a: string, b: string): LineState {
  const line = view.lines.find((l) => l.id === lineId(a, b));
  if (!line) return "none";
  return line.owner === view.me || (regionIn(view, a)?.owner === view.me && regionIn(view, b)?.owner === view.me) ? "ours" : "theirs";
}

export const onStrike = (view: GameView) => view.modifiers.some((m) => m.kind === "gondolaStrike");
// No new lines: the workers are on strike this round, or a war crimes sentence banned you from building them.
export const linesClosed = (view: GameView) => onStrike(view) || barred(view, "gondolas");

// Neighbours of one of your regions that have no line to it yet.
export function lineTargets(view: GameView, from: string): RegionView[] {
  if (regionIn(view, from)?.owner !== view.me) return [];
  return (NEIGHBORS.get(from) ?? []).filter((n) => lineState(view, from, n) === "none").map((n) => regionIn(view, n)!);
}

export function lineSources(view: GameView) {
  return frontFirst(
    view,
    myRegions(view)
      .filter((r) => lineTargets(view, r.id).length > 0)
      .map((r) => r.id),
  );
}

// ---------------------------------------------------------------- attacking

// ready: a line and rested troops. needLine: rested troops, but build a line first. resting: nobody rested.
// blocked: another Kird's line already runs there, and you can't ride it. pact: you're at peace with the owner.
// ceasefire: a war crimes sentence keeps you out of other Kirds' land.
export type SourceStatus = "ready" | "needLine" | "resting" | "blocked";
export type TargetStatus = SourceStatus | "pact" | "ceasefire";
export type AttackSource = { from: string; status: SourceStatus; line: LineState; rested: Units; odds: Odds | null };
export type AttackTarget = { id: string; region: RegionView; status: TargetStatus; sources: AttackSource[]; best: AttackSource | null };

const RANK: Record<TargetStatus, number> = { ready: 0, needLine: 1, resting: 2, pact: 3, ceasefire: 3, blocked: 4 };
// Anything that needs a new line waits while lines can't be built (see linesClosed).
export const canChoose = (s: TargetStatus, noNewLines = false) => s === "ready" || (s === "needLine" && !noNewLines);

// Why you can't attack whoever holds `target` at all: a pact, or a Ceasefire (the natives are always fair game).
export function attackBar(view: GameView, target: string): "pact" | "ceasefire" | null {
  const owner = regionIn(view, target)?.owner;
  if (!owner || owner === view.me) return null;
  if (atPeace(view, owner)) return "pact";
  return barred(view, "ceasefire") ? "ceasefire" : null;
}

// Your regions next to `target`, best first. Odds assume everyone rested there goes, bar one left home if
// nobody else would be (the troop step's starting pick).
export function attackSources(view: GameView, target: string, withOdds = true): AttackSource[] {
  const t = regionIn(view, target);
  if (!t || t.fog || t.owner === view.me) return [];
  return (NEIGHBORS.get(target) ?? [])
    .map((n) => regionIn(view, n))
    .filter((r): r is RegionView => r?.owner === view.me)
    .map((r) => {
      const rested = restedIn(r);
      const line = lineState(view, r.id, target);
      const status: SourceStatus = line === "theirs" ? "blocked" : !unitTotal(rested) ? "resting" : line === "ours" ? "ready" : "needLine";
      const send = keepOneHome(r, rested);
      return { from: r.id, status, line, rested, odds: withOdds && unitTotal(send) ? attackOdds(view, r.id, target, send) : null };
    })
    .sort((a, b) => RANK[a.status] - RANK[b.status] || (b.odds?.win ?? 0) - (a.odds?.win ?? 0) || unitTotal(b.rested) - unitTotal(a.rested));
}

// Every region next to yours that isn't yours, with whether (and from where) you could attack it now.
export function attackTargets(view: GameView, opts: { from?: string; odds?: boolean } = {}): AttackTarget[] {
  const mine = new Set(myRegions(view).map((r) => r.id));
  const seen = new Set<string>();
  const out: AttackTarget[] = [];
  for (const id of opts.from ? [opts.from] : mine) {
    for (const n of NEIGHBORS.get(id) ?? []) {
      if (seen.has(n) || mine.has(n)) continue;
      seen.add(n);
      const region = regionIn(view, n);
      if (!region || region.fog) continue;
      const sources = attackSources(view, n, opts.odds ?? true).filter((s) => !opts.from || s.from === opts.from);
      const status: TargetStatus =
        attackBar(view, n) ?? (["ready", "needLine", "resting", "blocked"] as const).find((st) => sources.some((s) => s.status === st)) ?? "blocked";
      out.push({ id: n, region, status, sources, best: sources[0] ?? null });
    }
  }
  return out.sort((a, b) => RANK[a.status] - RANK[b.status] || (b.best?.odds?.win ?? 0) - (a.best?.odds?.win ?? 0));
}

// Leave one unit home when everyone there could go: an empty region is anyone's for the taking.
export function keepOneHome(r: RegionView | undefined, send: Units): Units {
  const out = { ...send };
  if (unitTotal(out) > 1 && unitTotal(out) === unitTotal(unitsOf(r))) {
    const keep = (["panda", "armedPanda", "nacam", "cam"] as const).find((t) => out[t] > 0)!;
    out[keep] -= 1;
  }
  return out;
}

// ---------------------------------------------------------------- moving

export type MoveRoute = { to: string; line: LineState; units: Units };
export type MoveSource = { id: string; rested: Units; routes: MoveRoute[]; status: "ready" | "needLine" | "resting" };

// Your own regions next to `from`, the ones you can ride to first.
export function moveRoutes(view: GameView, from: string): MoveRoute[] {
  return (NEIGHBORS.get(from) ?? [])
    .map((n) => regionIn(view, n))
    .filter((r): r is RegionView => r?.owner === view.me)
    .map((r) => ({ to: r.id, line: lineState(view, from, r.id), units: unitsOf(r) }))
    .sort((a, b) => Number(b.line === "ours") - Number(a.line === "ours") || byName(view)(a.to, b.to));
}

export function moveSources(view: GameView): MoveSource[] {
  const rank = { ready: 0, needLine: 1, resting: 2 };
  return myRegions(view)
    .map((r) => {
      const rested = restedIn(r);
      const routes = moveRoutes(view, r.id);
      const status: MoveSource["status"] = !unitTotal(rested) ? "resting" : routes.some((x) => x.line === "ours") ? "ready" : "needLine";
      return { id: r.id, rested, routes, status };
    })
    .filter((s) => s.routes.length > 0)
    .sort((a, b) => rank[a.status] - rank[b.status] || unitTotal(b.rested) - unitTotal(a.rested));
}

// Where each of your armies could be dragged right now: along your own gondola lines, to reinforce your land or
// to invade (never a friend's).
export function dragRoutes(view: GameView) {
  const out = new Map<string, string[]>();
  for (const r of myRegions(view)) {
    if (!unitTotal(restedIn(r))) continue;
    const to = (NEIGHBORS.get(r.id) ?? []).filter((n) => {
      const x = regionIn(view, n);
      return x && !x.fog && lineState(view, r.id, n) === "ours" && (x.owner === view.me || !attackBar(view, n));
    });
    if (to.length) out.set(r.id, to);
  }
  return out;
}

// ---------------------------------------------------------------- building

export type BuildOption = { building: BuildingType; cost: Cost; afford: Afford; where: string[] };

export function buildWhere(view: GameView, b: BuildingType) {
  return frontFirst(
    view,
    myRegions(view)
      .filter((r) => !r.buildings?.includes(b))
      .map((r) => r.id),
  );
}

export function buildOptions(view: GameView): BuildOption[] {
  return BUILDING_TYPES.map((b) => ({ building: b, cost: BUILDINGS[b].cost, afford: afford(view, BUILDINGS[b].cost), where: buildWhere(view, b) }));
}

// ---------------------------------------------------------------- recruiting

// "arm" upgrades pandas you already have; the rest are new troops.
export type RecruitKind = "panda" | "nacam" | "cam" | "arm";
export const RECRUIT_KINDS: RecruitKind[] = ["panda", "nacam", "cam", "arm"];

export const recruitCost = (view: GameView, kind: RecruitKind): Cost => (kind === "arm" ? UNITS.armedPanda.cost : view.prices.units[kind]);

export function recruitPlaces(view: GameView, kind: RecruitKind) {
  const ok = (r: RegionView) => (kind === "cam" ? Boolean(r.buildings?.includes("gym")) : kind === "arm" ? (r.units?.panda ?? 0) > 0 : true);
  return frontFirst(view, myRegions(view).filter(ok).map((r) => r.id));
}

// The most you can recruit (buying missing resources with Coin if need be): 20 at a time, or up to 50 of the
// pandas there to arm. None under an Arms embargo.
export function recruitLimit(view: GameView, kind: RecruitKind, region?: string) {
  if (barred(view, "arms")) return 0;
  const cap =
    kind === "arm"
      ? Math.min(50, region ? regionIn(view, region)?.units?.panda ?? 0 : Math.max(0, ...myRegions(view).map((r) => r.units?.panda ?? 0)))
      : 20;
  const cost = recruitCost(view, kind);
  let n = 0;
  while (n < cap && afford(view, scaleCost(cost, n + 1)).status !== "no") n++;
  return n;
}

// ---------------------------------------------------------------- heroes

export type HeroOption = { id: HeroId; owner: string | null; region: string | null; cost: Cost; afford: Afford; moved: boolean };

export function heroOptions(view: GameView): HeroOption[] {
  return HERO_IDS.map((h) => {
    const hero = view.heroes[h];
    return { id: h, owner: hero.owner, region: hero.region, cost: view.prices.heroes[h], afford: afford(view, view.prices.heroes[h]), moved: hero.movedTurn === view.turn };
  });
}

// Your regions a hero could ride to from where he stands (a hero moves once a turn).
export function heroMoves(view: GameView, h: HeroId) {
  const from = view.heroes[h].region;
  if (!from || view.heroes[h].owner !== view.me || view.heroes[h].movedTurn === view.turn) return [];
  return (NEIGHBORS.get(from) ?? []).filter((n) => regionIn(view, n)?.owner === view.me && lineState(view, from, n) === "ours");
}

// Anywhere you can see that isn't yours or a friend's (under a Ceasefire, only the natives' and empty land).
export function thunderTargets(view: GameView) {
  if (barred(view, "heroes")) return [];
  return view.regions.filter((r) => !r.fog && r.owner !== view.me && !attackBar(view, r.id)).map((r) => r.id);
}

export function pickpocketTargets(view: GameView) {
  return view.players
    .filter((p) => p.id !== view.me)
    .map((p) => ({
      id: p.id,
      ok: !barred(view, "heroes") && !atPeace(view, p.id) && view.regions.some((r) => !r.fog && r.owner === p.id),
      why: barred(view, "heroes")
        ? "Heroes on strike: the Josserkid won't pick pockets for a war criminal"
        : atPeace(view, p.id)
          ? "You have a pact with them"
          : "You can't see any of their land",
    }));
}

// ---------------------------------------------------------------- your turn, in sum

// What you'd collect at the start of your next turn, before the dice: mirrors the engine's startTurn, counting
// only what lasts until then.
export function incomePreview(view: GameView) {
  const mine = myRegions(view);
  const me = meIn(view);
  // The round your next turn falls in: later this round if your seat is still to come, otherwise the next one.
  const next = view.activeSeat < me.seat ? view.round : view.round + 1;
  const blight = view.modifiers.some((m) => m.kind === "blight" && m.untilRound >= next);
  const harvest: Cost = {};
  for (const r of mine) {
    const res = REGION_BY_ID.get(r.id)!.resource;
    if (!(blight && res === "bamboo")) harvest[res] = (harvest[res] ?? 0) + 1;
  }
  const count = (b: BuildingType) => mine.filter((r) => r.buildings?.includes(b)).length;
  const pandas = mine.reduce((n, r) => n + (r.units?.panda ?? 0) + (r.units?.armedPanda ?? 0), 0);
  const ogres = mine.reduce((n, r) => n + (r.units?.nacam ?? 0), 0);
  const due = view.heroes.cockpenis.owner === view.me ? 0 : ogres * NACAM_UPKEEP;
  const loans = view.loans.filter((l) => l.from === view.me || l.to === view.me).reduce((n, l) => n + l.count, 0);
  let pandaCoin = Math.floor(pandas / PANDAS_PER_PANDACOIN) + count("sanctuary") * SANCTUARY_PANDACOIN + (view.heroes.ping.owner === view.me ? 2 : 0) + loans;
  if ((me.oathbreakerUntilRound ?? (me.oathbreaker ? next : 0)) >= next) pandaCoin = Math.floor(pandaCoin / 2);
  // Ogres you can't pay walk off, and take their wages with them.
  let coin = mine.length * COIN_PER_REGION + count("market") * MARKET_COIN - due;
  let deserters = 0;
  const purse = me.goods?.coin ?? 0;
  if (due && purse + coin < 0) {
    deserters = Math.min(ogres, Math.ceil(-(purse + coin) / NACAM_UPKEEP));
    coin += deserters * NACAM_UPKEEP;
  }
  return {
    harvest,
    coin,
    pandaCoin,
    camCoin: count("gym") * GYM_CAMCOIN,
    upkeep: due - deserters * NACAM_UPKEEP,
    deserters,
  };
}

// What ending your turn now would leave on the table.
export function turnLeftovers(view: GameView) {
  const goods: Cost = meIn(view).goods ?? {};
  const ready = myRegions(view).map((r) => ({ id: r.id, n: unitTotal(restedIn(r)) }));
  const cards = RESOURCES.reduce((n, g) => n + (goods[g] ?? 0), 0);
  return {
    attacks: attackTargets(view).filter((t) => t.status === "ready"),
    readyTroops: ready.reduce((n, r) => n + r.n, 0),
    readyRegions: ready.filter((r) => r.n > 0).length,
    offers: view.offers.filter((o) => o.to === view.me).length,
    votes: ballotsDue(view).length,
    cards,
    raid: cards > RAID_THRESHOLD,
  };
}
