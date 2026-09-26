// The Army tab's numbers: what you have, where it stands, what threatens it, and how your battles went.
// Everything is worked out from the player's own view, so nothing hidden by the fog leaks.
import { emptyUnits, unitTotal, type BattleData, type GameEvent, type GameView, type RegionView, type Units } from "./engine";
import { defenseOdds } from "./odds";
import { NEIGHBORS, REGION_BY_ID, lineId } from "./regions";
import { HEROES, HERO_IDS, NACAM_UPKEEP, PANDAS_PER_PANDACOIN, UNITS, UNIT_TYPES, type HeroId } from "./rules";

export type ArmySummary = {
  total: Units;
  ready: Units; // rested: can move or attack this turn
  regions: number;
  attackPower: number; // expected dice total if everyone attacked
  defensePower: number;
  upkeep: number; // Coin a turn for ogre wages
  pandaCoinFromPandas: number;
  heroes: { id: HeroId; region: string | null }[];
};

const add = (a: Units, b: Partial<Units>) => {
  for (const t of UNIT_TYPES) a[t] += b[t] ?? 0;
};

export function restedIn(r: RegionView): Units {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) u[t] = Math.max(0, (r.units?.[t] ?? 0) - (r.tired?.[t] ?? 0));
  return u;
}

// Expected value of each unit's die in battle: a d6 averages 3.5, plus the unit's bonus.
export const power = (u: Partial<Units>, stat: "attack" | "defense") =>
  UNIT_TYPES.reduce((n, t) => n + (u[t] ?? 0) * (3.5 + UNITS[t][stat]), 0);

export function armySummary(view: GameView): ArmySummary {
  const mine = view.regions.filter((r) => r.owner === view.me);
  const total = emptyUnits();
  const ready = emptyUnits();
  for (const r of mine) {
    add(total, r.units ?? {});
    add(ready, restedIn(r));
  }
  const heroes = HERO_IDS.filter((h) => view.heroes[h].owner === view.me).map((id) => ({ id, region: view.heroes[id].region }));
  const warlord = heroes.some((h) => h.id === "cockpenis");
  return {
    total,
    ready,
    regions: mine.length,
    attackPower: Math.round(power(total, "attack")),
    defensePower: Math.round(power(total, "defense")),
    upkeep: warlord ? 0 : total.nacam * NACAM_UPKEEP,
    pandaCoinFromPandas: Math.floor((total.panda + total.armedPanda) / PANDAS_PER_PANDACOIN),
    heroes,
  };
}

export type RegionReport = {
  region: RegionView;
  ready: Units;
  heroes: HeroId[];
  lines: number; // gondola lines out of here you can use
  border: boolean; // touches land that isn't yours
  // The biggest visible danger: a neighbouring Kird's army that could invade, and its odds of winning.
  danger: { from: string; owner: string; win: number } | null;
};

export function regionReports(view: GameView): RegionReport[] {
  const byId = new Map(view.regions.map((r) => [r.id, r]));
  const pact = (pid: string) => view.pacts.some((p) => (p.a === view.me && p.b === pid) || (p.b === view.me && p.a === pid));
  const usable = (a: string, b: string) => {
    const l = view.lines.find((x) => x.id === lineId(a, b));
    return Boolean(l) && (l!.owner === view.me || (byId.get(a)?.owner === view.me && byId.get(b)?.owner === view.me));
  };
  return view.regions
    .filter((r) => r.owner === view.me)
    .map((r) => {
      const around = NEIGHBORS.get(r.id) ?? [];
      let danger: RegionReport["danger"] = null;
      for (const n of around) {
        const nb = byId.get(n);
        // Natives never attack; only other Kirds' armies you can see count.
        if (!nb || nb.fog || !nb.owner || nb.owner === view.me || pact(nb.owner) || !nb.units) continue;
        const send = { ...nb.units };
        const keep = (["panda", "armedPanda", "nacam", "cam"] as const).find((t) => send[t] > 0);
        if (!keep || unitTotal(send) < 2) continue;
        send[keep] -= 1;
        // Fought by the real battle rules, with your Standing Orders defending.
        const odds = defenseOdds(view, nb.owner, n, send, r.id, 60);
        if (!odds) continue;
        if (!danger || odds.win > danger.win) danger = { from: n, owner: nb.owner, win: odds.win };
      }
      return {
        region: r,
        ready: restedIn(r),
        heroes: HERO_IDS.filter((h) => view.heroes[h].owner === view.me && view.heroes[h].region === r.id),
        lines: around.filter((n) => usable(r.id, n)).length,
        border: around.some((n) => byId.get(n)?.owner !== view.me),
        danger: danger && danger.win >= 0.05 ? danger : null,
      };
    })
    .sort((a, b) => (b.danger?.win ?? 0) - (a.danger?.win ?? 0) || unitTotal(b.region.units ?? emptyUnits()) - unitTotal(a.region.units ?? emptyUnits()));
}

export type BattleRecord = {
  event: GameEvent;
  role: "attack" | "defend";
  won: boolean;
  place: string;
  opponent: string;
  lost: Units;
  killed: Units;
};

// Your battles, newest first, from the events this player has loaded.
export function battleRecord(view: GameView, events: GameEvent[]): BattleRecord[] {
  const name = (id: string | null | undefined, fallback: string) => view.players.find((p) => p.id === id)?.name ?? fallback;
  const out: BattleRecord[] = [];
  for (const e of events) {
    if (e.type !== "battle" || !e.data) continue;
    const d = e.data as unknown as BattleData;
    if (!d.attacker || !d.attackerLost || !d.defenderLost) continue;
    const place = REGION_BY_ID.get(d.to)?.name ?? d.to;
    if (e.actor === view.me) {
      out.push({ event: e, role: "attack", won: d.won, place, opponent: name(d.defender, d.defenderName), lost: d.attackerLost, killed: d.defenderLost });
    } else if (d.defender === view.me) {
      out.push({ event: e, role: "defend", won: !d.won, place, opponent: name(e.actor, "someone"), lost: d.defenderLost, killed: d.attackerLost });
    }
  }
  return out.reverse();
}

export const heroBonusText = (h: HeroId) => `+${HEROES[h].combatBonus} to every die in battles fought from or in his region`;
