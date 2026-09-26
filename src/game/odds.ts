// Battle odds for the attack preview and the advisor: replays the engine's own battle rules many times.
import { battle, emptyUnits, unitTotal, type GameState, type GameView, type Units } from "./engine";
import { HEROES, HERO_IDS, UNIT_TYPES } from "./rules";

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

// Hero bonus a player gets for battles in a region, from what the view shows.
export function viewHeroBonus(view: GameView, pid: string | null | undefined, regionId: string) {
  if (!pid) return 0;
  return HERO_IDS.reduce((n, h) => n + (view.heroes[h].owner === pid && view.heroes[h].region === regionId ? HEROES[h].combatBonus : 0), 0);
}

// Odds of sending `send` from one region into another, as far as this player can see.
export function attackOdds(view: GameView, from: string, to: string, send: Units, sims = SIMS): Odds | null {
  const target = view.regions.find((r) => r.id === to);
  if (!target || target.fog || !target.units) return null;
  const atkBonus = viewHeroBonus(view, view.me, from);
  const defBonus = (target.buildings?.includes("fort") ? 1 : 0) + viewHeroBonus(view, target.owner, to);
  return battleOdds(send, atkBonus, target.units, defBonus, sims);
}

export function units(partial: Partial<Units>): Units {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) u[t] = partial[t] ?? 0;
  return u;
}
