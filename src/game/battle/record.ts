// What the game keeps and shows of a battle: physics seeds for every throw, the compact record a finished battle
// leaves behind (enough for any viewer to re-enact it), the legacy dice the old BattleView reads, and the view of a
// battle in progress (the defender's private fields hidden). Pure functions over engine battles.
import { mulberry } from "./engine";
import type { Battle, BattleAction, BattleConfig, BattleEvent, BattleSummary, ReactionId, RoundLog, SideConfig, SideKey } from "./types";

// ---------------------------------------------------------------- dice throws

// The physics seed for the k-th throw (a roll or a re-roll) of a round, so every viewer's dice tumble the same way.
// Mixed from a per-battle base drawn from the game's RNG, so the seeds say nothing about the dice to come.
export function throwSeed(base: number, round: number, k: number) {
  const mixed = (base ^ Math.imul(round + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) | 0;
  return Math.floor(mulberry(mixed)() * 4294967296) >>> 0;
}

// Gives every roll and re-roll that doesn't have one yet its throw seed (the opening has no throws).
export function stampSeeds(b: Battle, base: number) {
  const stamp = (round: number, events: BattleEvent[]) => {
    let k = 0;
    for (const e of events) {
      if (e.t !== "roll" && e.t !== "reroll") continue;
      if (e.seed === undefined) e.seed = throwSeed(base, round, k);
      k++;
    }
  };
  for (const r of b.log) stamp(r.round, r.events);
  if (b.pending) stamp(b.pending.round, b.pending.events);
}

// ---------------------------------------------------------------- the finished battle's record

export type Reaction = { side: SideKey; id: ReactionId; die?: number };

export type RoundRecord = {
  round: number;
  actions: { atk: BattleAction; def: BattleAction };
  reactions: Reaction[];
  // The engine's events, in order. Rolls and re-rolls carry their throw `seed`.
  events: BattleEvent[];
};

export type BattleRecord = {
  // createBattle(setup) rebuilds the starting armies (no dice are thrown before round 1).
  setup: BattleConfig;
  opening: BattleEvent[];
  log: RoundRecord[];
  summary: BattleSummary;
};

// What anyone may see of a side's setup: no purse, no Bag, no item budget.
const publicSide = (c: SideConfig): SideConfig => {
  const { bag: _bag, goods: _goods, budget: _budget, ...rest } = c;
  void _bag;
  void _goods;
  void _budget;
  return rest;
};
export const publicSetup = (cfg: BattleConfig): BattleConfig => {
  const { seed: _seed, ...rest } = cfg;
  void _seed;
  return { ...rest, atk: publicSide(cfg.atk), def: publicSide(cfg.def) };
};

// Every event names its squad's state right after it (`after`). The full roster (`squads`) is only kept where the
// armies change shape or several squads change at once; elsewhere a client rebuilds it from the setup and `after`.
const ROSTER_EVENTS = new Set<BattleEvent["t"]>(["reinforce", "convert", "smite"]);
export function compactEvent(e: BattleEvent): BattleEvent {
  if (!e.squads || ROSTER_EVENTS.has(e.t) || (e.t === "heal" && !e.squad)) return e;
  const { squads: _squads, ...rest } = e;
  void _squads;
  return rest as BattleEvent;
}

export function reactionsOf(events: BattleEvent[]): Reaction[] {
  const out: Reaction[] = [];
  for (const e of events) {
    if (e.t === "reroll") out.push({ side: e.side, id: e.item, die: e.die });
    else if (e.t === "blessing") out.push({ side: e.side, id: "blessing" });
  }
  return out;
}

// The dice and plans in the engine's log repeat what the roll, re-roll and pairs events already say.
export const roundRecord = (r: RoundLog): RoundRecord => ({ round: r.round, actions: r.actions, reactions: reactionsOf(r.events), events: r.events.map(compactEvent) });

export function battleRecord(b: Battle, summary: BattleSummary): BattleRecord {
  return { setup: publicSetup(b.cfg), opening: b.opening.map(compactEvent), log: b.log.map(roundRecord), summary };
}

// Each round's pairs, highest against highest, as the old Risk-style BattleView expects its dice.
export function legacyRolls(b: Battle): { a: number[]; d: number[] }[] {
  const out: { a: number[]; d: number[] }[] = [];
  for (const r of b.log) {
    const p = r.events.find((e) => e.t === "pairs");
    if (p && p.t === "pairs" && p.pairs.length) out.push({ a: p.pairs.map((x) => x.a), d: p.pairs.map((x) => x.d) });
  }
  return out;
}

// ---------------------------------------------------------------- the battle in progress, as the attacker sees it

// The whole engine battle, so the client can run actionsFor / preview / estimate locally, minus what would let it
// peek: the RNG states and seed (no predicting the dice or the defender's choices) and the defender's purse,
// Bag and item budget.
export function redactBattle(b: Battle): Battle {
  const c: Battle = JSON.parse(JSON.stringify(b));
  c.seed = 0;
  c.rng = 0;
  c.aiRng = 0;
  c.cfg = { ...publicSetup(c.cfg), atk: c.cfg.atk };
  const d = c.sides.def;
  d.bag = {};
  d.goods = { bamboo: 0, stone: 0, iron: 0, rice: 0, gems: 0, coin: 0, pandaCoin: 0, camCoin: 0 };
  d.budget = null;
  return c;
}
