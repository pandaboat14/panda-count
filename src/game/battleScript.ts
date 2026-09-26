// Turns a recorded battle into a step-by-step script the board can animate.
// It replays the dice with the engine's rules (highest vs highest, ties to the defender,
// each loss taking that side's weakest unit) so the animation shows exactly what happened.
import type { BattleData, Units } from "./engine";
import { UNITS, UNIT_TYPES, type UnitType } from "./rules";

export type Soldier = { id: string; side: "atk" | "def"; type: UnitType; diesAt: number | null };
export type Step = { a: number[]; d: number[]; kills: string[]; summary?: string };

const expand = (u: Units, side: "atk" | "def"): Soldier[] =>
  UNIT_TYPES.flatMap((t) => Array.from({ length: u[t] }, (_, i) => ({ id: `${side}-${t}-${i}`, side, type: t, diesAt: null })));

function weakest(alive: Soldier[], stat: "attack" | "defense") {
  return [...alive].sort((x, y) => UNITS[x.type][stat] - UNITS[y.type][stat])[0];
}

// Battles fought before replays existed carry no dice, so they can't be re-enacted.
export function canReplay(e: { type: string; data?: Record<string, unknown> }) {
  const d = e.data as Partial<BattleData> | undefined;
  return e.type === "battle" && Boolean(d?.attacker && d.defenderStart && d.attackerLost && d.defenderLost && Array.isArray(d.rolls));
}

export function battleScript(b: BattleData) {
  const soldiers = [...expand(b.attacker, "atk"), ...expand(b.defenderStart, "def")];
  const alive = (side: "atk" | "def") => soldiers.filter((s) => s.side === side && s.diesAt === null);
  const steps: Step[] = [];

  // Nobody dies beyond the recorded losses: in Pokémon-style battles (v2) a lost pair doesn't always cost a unit.
  const dead = (side: "atk" | "def", t: UnitType) => soldiers.filter((s) => s.side === side && s.type === t && s.diesAt !== null).length;
  const canLose = (s: Soldier) => dead(s.side, s.type) < (s.side === "atk" ? b.attackerLost : b.defenderLost)[s.type];

  for (const round of b.rolls) {
    const kills: string[] = [];
    const n = Math.min(round.a.length, round.d.length);
    for (let i = 0; i < n; i++) {
      const loserSide = round.a[i] > round.d[i] ? "def" : "atk";
      if (!alive(loserSide).length) break;
      const pool = alive(loserSide).filter(canLose);
      if (!pool.length) continue;
      const victim = weakest(pool, loserSide === "atk" ? "attack" : "defense");
      victim.diesAt = steps.length;
      kills.push(victim.id);
      if (!alive("atk").length || !alive("def").length) break;
    }
    steps.push({ a: round.a, d: round.d, kills });
  }

  // Only the first rounds' dice are recorded; the rest of the losses fall in one last clash.
  const remaining = (side: "atk" | "def", lost: Units) => {
    const out: string[] = [];
    for (const t of UNIT_TYPES) {
      const already = soldiers.filter((s) => s.side === side && s.type === t && s.diesAt !== null).length;
      const more = Math.max(0, lost[t] - already);
      const pool = soldiers.filter((s) => s.side === side && s.type === t && s.diesAt === null).slice(0, more);
      for (const s of pool) {
        s.diesAt = steps.length;
        out.push(s.id);
      }
    }
    return out;
  };
  const lateKills = [...remaining("atk", b.attackerLost), ...remaining("def", b.defenderLost)];
  if (lateKills.length) steps.push({ a: [], d: [], kills: lateKills, summary: "…and the fighting raged on until one side broke." });

  return { soldiers, steps };
}
