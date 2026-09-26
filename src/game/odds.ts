// Battle odds for the attack preview, the advisor and the Army tab, worked out from what this player can see.
// Since Pokémon-style battles, previews play the real battle rules (./battle/engine.ts) out many times, both sides
// making their likely move each round. The old Risk-style estimate (battleOdds) stays for the computer players' quick
// sums and the Try-a-battle calculator.
import { battle, emptyUnits, unitTotal, type Armory, type GameState, type GameView, type Units } from "./engine";
import { REGION_BY_ID, type NativeNation } from "./regions";
import { HEROES, HERO_IDS, UNIT_TYPES, type BuildingType, type HeroId, type UnitType } from "./rules";
import * as BE from "./battle/engine";
import type { Battle, BattleAction, BattleConfig, PlayerDoctrineId, SideKey, SquadSpec, TerrainId, WeaponId, WorldEventId } from "./battle/types";
import { sanctionedIn } from "./tribunal";

export type Odds = { win: number; attackerLoss: number; defenderLoss: number };

const SIMS = 240;

export function battleOdds(attacker: Units, atkBonus: number, defender: Units, defBonus: number, sims = SIMS): Odds {
  if (unitTotal(attacker) === 0) return { win: 0, attackerLoss: 0, defenderLoss: 0 };
  if (unitTotal(defender) === 0) return { win: 1, attackerLoss: 0, defenderLoss: 0 };
  let wins = 0;
  let aLoss = 0;
  let dLoss = 0;
  for (let i = 0; i < sims; i++) {
    // Fixed seeds: the same matchup always shows the same number.
    const sim = { rng: (i * 2654435761) | 0 } as GameState;
    const r = battle(sim, attacker, atkBonus, { ...defender }, defBonus);
    if (r.attackerWon) wins++;
    aLoss += unitTotal(r.attackerLost);
    dLoss += unitTotal(r.defenderLost);
  }
  return { win: wins / sims, attackerLoss: aLoss / sims, defenderLoss: dLoss / sims };
}

// Hero bonus a player gets for battles in a region, from what the view shows. (None while their heroes are on strike.)
export function viewHeroBonus(view: GameView, pid: string | null | undefined, regionId: string) {
  if (!pid || sanctionedIn(view, pid, "heroes")) return 0;
  return HERO_IDS.reduce((n, h) => n + (view.heroes[h].owner === pid && view.heroes[h].region === regionId ? HEROES[h].combatBonus : 0), 0);
}

// ---------------------------------------------------------------- the real battle rules, played out

export type ArmySetup = { units: Units; heroes?: HeroId[]; gear?: Partial<Record<UnitType, WeaponId[]>>; catapult?: boolean };
export type OddsSetup = {
  atk: ArmySetup;
  // Natives fight by their nation's doctrine; a Kird's defenders by their Standing Orders (Counterpunch if unknown).
  def: ArmySetup & { native?: NativeNation | null; doctrine?: PlayerDoctrineId; lead?: string | null; traps?: boolean };
  terrain: TerrainId;
  buildings?: BuildingType[];
  events?: WorldEventId[];
};

// Real battles cost far more to play out than the old Risk sums, so previews play at most this many (enough to
// rank fights and show a percentage, cheap enough for a phone), whatever a caller asks for.
export const PREVIEW_SIMS = 60;
const MAX_CACHE = 500;
const cache = new Map<string, Odds>();

function squadsOf(a: ArmySetup, lead?: string | null): SquadSpec[] {
  const out: SquadSpec[] = [...UNIT_TYPES.filter((t) => a.units[t] > 0).map((t) => ({ unit: t, count: a.units[t], gear: a.gear?.[t] ?? [] })), ...(a.heroes ?? []).map((hero) => ({ hero }))];
  const i = lead ? out.findIndex((q) => q.unit === lead || q.hero === lead) : -1;
  return i > 0 ? [out[i], ...out.filter((_, j) => j !== i)] : out;
}

function configFor(setup: OddsSetup, i: number): BattleConfig {
  const d = setup.def;
  return {
    seed: 1 + i * 7919,
    terrain: setup.terrain,
    buildings: setup.buildings ?? [],
    events: setup.events ?? [],
    atk: { name: "Attackers", squads: squadsOf(setup.atk), catapult: Boolean(setup.atk.catapult) },
    def: d.native ? { name: "Natives", native: d.native, squads: squadsOf(d) } : { name: "Defenders", doctrine: d.doctrine ?? "counter", squads: squadsOf(d, d.lead), traps: d.traps ? ["caltrops"] : [] },
  };
}

// The move a side most likely makes (its best Strike, or a Guard if its doctrine prefers). likelyAction only ever
// names moves the squad can make; when there are none it falls back to a Rice Ball, and then the computer picks.
function likely(b: Battle, key: SideKey): BattleAction {
  const a = BE.likelyAction(b, key);
  return a.kind === "item" && !b.sides[key].bag[a.id] ? BE.aiAction(b, key) : a;
}

// Plays the battle out `sims` times with fixed seeds, so the same matchup always shows the same number.
export function simulateOdds(setup: OddsSetup, sims = PREVIEW_SIMS): Odds {
  if (unitTotal(setup.atk.units) === 0 && !setup.atk.heroes?.length) return { win: 0, attackerLoss: 0, defenderLoss: 0 };
  // Nobody home: the region is captured unopposed.
  if (unitTotal(setup.def.units) === 0) return { win: 1, attackerLoss: 0, defenderLoss: 0 };
  const key = JSON.stringify([setup, sims]);
  const known = cache.get(key);
  if (known) return known;
  let wins = 0;
  let aLoss = 0;
  let dLoss = 0;
  const lostOf = (u: Partial<Record<UnitType, number>>) => Object.values(u).reduce((n: number, v) => n + (v ?? 0), 0);
  for (let i = 0; i < sims; i++) {
    const b = BE.createBattle(configFor(setup, i));
    for (let r = 0; !b.over && r < 40; r++) {
      BE.beginRound(b, likely(b, "atk"), likely(b, "def"));
      BE.finishRound(b);
    }
    if (b.result?.winner === "atk") wins++;
    const sm = BE.summary(b);
    aLoss += lostOf(sm.atk.lost);
    dLoss += lostOf(sm.def.lost);
  }
  const odds = { win: wins / sims, attackerLoss: aLoss / sims, defenderLoss: dLoss / sims };
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, odds);
  return odds;
}

// The heroes who'd take the field (none while that Kird's heroes are on strike).
const heroesIn = (view: GameView, owner: string | null | undefined, region: string) =>
  owner && !sanctionedIn(view, owner, "heroes") ? HERO_IDS.filter((h) => view.heroes[h].owner === owner && view.heroes[h].region === region) : [];
const activeEvents = (view: GameView) => [...new Set(view.modifiers.filter((m) => m.untilRound >= view.round).map((m) => m.kind))] as WorldEventId[];

// The gear each unit type carries, from an Armory (the viewer only knows their own).
export function armoryGear(armory: Armory | undefined): Partial<Record<UnitType, WeaponId[]>> {
  const out: Partial<Record<UnitType, WeaponId[]>> = {};
  for (const t of UNIT_TYPES) {
    const g = armory?.units[t];
    const ids = [g?.weapon, g?.armor].filter((x) => x && x.charges > 0).map((x) => x!.id);
    if (ids.length) out[t] = ids;
  }
  return out;
}

// Odds of sending `send` from one region into another, as far as this player can see.
export function attackOdds(view: GameView, from: string, to: string, send: Units, sims = PREVIEW_SIMS): Odds | null {
  const target = view.regions.find((r) => r.id === to);
  if (!target || target.fog || !target.units) return null;
  const me = view.players.find((p) => p.id === view.me);
  return simulateOdds(
    {
      atk: { units: send, heroes: heroesIn(view, view.me, from), gear: armoryGear(me?.armory), catapult: Boolean(me?.armory?.army && me.armory.army.charges > 0) },
      def: { units: { ...emptyUnits(), ...target.units }, heroes: heroesIn(view, target.owner, to), native: target.owner ? null : (target.native ?? "wild") },
      terrain: REGION_BY_ID.get(to)!.resource,
      buildings: target.buildings ?? [],
      events: activeEvents(view),
    },
    Math.min(sims, PREVIEW_SIMS),
  );
}

// Odds of a neighbour's army taking one of your regions, fought by your Standing Orders there.
export function defenseOdds(view: GameView, attacker: string, from: string, send: Units, to: string, sims = PREVIEW_SIMS): Odds | null {
  const mine = view.regions.find((r) => r.id === to);
  if (!mine || !mine.units) return null;
  const me = view.players.find((p) => p.id === view.me);
  return simulateOdds(
    {
      atk: { units: send, heroes: heroesIn(view, attacker, from) },
      def: {
        units: { ...emptyUnits(), ...mine.units },
        heroes: heroesIn(view, mine.owner, to),
        gear: mine.owner === view.me ? armoryGear(me?.armory) : undefined,
        doctrine: mine.orders?.doctrine,
        lead: mine.orders?.lead,
        traps: Boolean(mine.orders?.traps.length),
      },
      terrain: REGION_BY_ID.get(to)!.resource,
      buildings: mine.buildings ?? [],
      events: activeEvents(view),
    },
    Math.min(sims, PREVIEW_SIMS),
  );
}

export function units(partial: Partial<Units>): Units {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) u[t] = partial[t] ?? 0;
  return u;
}
