import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CODEX, ITEMS, RULES, TERRAIN, typeMult } from "./battle/codex";
import {
  actionsFor,
  aiAction,
  aiReact,
  autoRound,
  beginRound,
  createBattle,
  finishRound,
  mulberry,
  pairsNow,
  planDice,
  react,
  reactionsFor,
  summary,
  validate,
} from "./battle/engine";
import type { Battle, BattleAction, BattleConfig, BattleEvent, ItemId, SideKey, UnitId, WeaponId } from "./battle/types";

// ---------------------------------------------------------------- helpers

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function duel(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    seed: 11,
    terrain: "iron",
    place: "Testland",
    buildings: [],
    events: [],
    atk: { name: "Mei", squads: [{ unit: "panda", count: 5 }], goods: { coin: 5 } },
    def: { name: "Otto", doctrine: "counter", squads: [{ unit: "panda", count: 5 }] },
    ...over,
  };
}

// Plays a round with the dice the test wants (the battle is plain data, so the dice can be set before the pairs).
function fixedRound(b: Battle, atk: BattleAction, def: BattleAction, atkDice: number[], defDice: number[]) {
  beginRound(b, atk, def);
  b.pending!.dice.atk = atkDice;
  b.pending!.dice.def = defDice;
  return finishRound(b);
}
const move = (id: string): BattleAction => ({ kind: "move", id });
const damageTo = (ev: BattleEvent[], side: SideKey) => ev.find((e) => e.t === "damage" && e.side === side && !e.source) as Extract<BattleEvent, { t: "damage" }> | undefined;

// A random battle setup (like design/battles/fuzz.cjs).
function randomConfig(rng: () => number, i: number): BattleConfig {
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const units: UnitId[] = ["panda", "armedPanda", "nacam", "cam"];
  const side = (native: BattleConfig["def"]["native"]) => {
    const squads: NonNullable<BattleConfig["atk"]["squads"]> = [];
    for (const u of units) {
      if (rng() < 0.5) continue;
      const fits = (Object.keys(CODEX.WEAPONS) as WeaponId[]).filter((w) => CODEX.WEAPONS[w].fits.includes(u));
      const gear: WeaponId[] = [];
      const weapons = fits.filter((w) => CODEX.WEAPONS[w].slot === "weapon");
      const armour = fits.filter((w) => CODEX.WEAPONS[w].slot === "armor");
      if (rng() < 0.5 && weapons.length) gear.push(pick(weapons));
      if (rng() < 0.3 && armour.length) gear.push(pick(armour));
      squads.push({ unit: u, count: 1 + Math.floor(rng() * 8), gear });
    }
    if (!squads.length) squads.push({ unit: pick(units), count: 1 + Math.floor(rng() * 4) });
    if (!native && rng() < 0.5) squads.push({ hero: pick(["casey", "ping", "cockpenis", "piecer", "josserkid"] as const) });
    const bag: Partial<Record<ItemId, number>> = {};
    for (const it of Object.keys(ITEMS) as ItemId[]) if (rng() < 0.3) bag[it] = 1 + Math.floor(rng() * 2);
    return {
      name: native ? "N" : `P${i}`,
      native,
      squads,
      bag: native ? {} : bag,
      goods: native ? {} : { bamboo: 3, stone: 3, iron: 3, rice: 3, gems: 3, coin: 12, pandaCoin: 4, camCoin: 2 },
      catapult: rng() < 0.2,
      doctrine: native ? undefined : pick(["turtle", "counter", "allin", "diplomat"] as const),
      traps: rng() < 0.2 ? (["caltrops"] as const).slice() : [],
      budget: rng() < 0.3 ? Math.floor(rng() * 3) : null,
    };
  };
  const native = rng() < 0.3 ? pick(["pandas", "nacams", "cams", "wild"] as const) : null;
  return {
    seed: i + 1,
    terrain: pick(Object.keys(TERRAIN) as (keyof typeof TERRAIN)[]),
    place: "Fuzzland",
    buildings: (["fort", "sanctuary", "gym", "market"] as const).filter(() => rng() < 0.3),
    events: (["blight", "gondolaStrike", "mercMarket", "caseySale"] as const).filter(() => rng() < 0.2),
    atk: side(null),
    def: side(native),
  };
}

// A random legal action for a side, or the computer's.
function randomAction(b: Battle, key: SideKey, rng: () => number): BattleAction {
  const g = actionsFor(b, key);
  const all = [...g.attack, ...g.defend, ...g.tactics, ...g.signature, ...g.bag.filter((x) => x.when === "action"), ...g.squads, ...(key === "atk" && rng() < 0.04 ? g.retreat : [])].filter((x) => x.enabled);
  if (!all.length || rng() < 0.3) return aiAction(b, key);
  const a = all[Math.floor(rng() * all.length)];
  const act: BattleAction = a.kind === "move" ? { kind: "move", id: a.id } : a.kind === "item" ? { kind: "item", id: a.id } : a.kind === "switch" ? { kind: "switch", to: a.to } : { kind: "retreat" };
  const preps = g.bag.filter((x) => x.when === "prep" && x.enabled);
  if (act.kind === "move" && preps.length && rng() < 0.3) act.prep = preps[Math.floor(rng() * preps.length)].id;
  return act;
}

function checkBattle(b: Battle) {
  for (const k of ["atk", "def"] as const) {
    const side = b.sides[k];
    for (const s of side.squads) {
      assert.ok(s.hp >= 0 && !Number.isNaN(s.hp), `hp ${JSON.stringify(s)}`);
      assert.equal(s.count, s.hp <= 0 ? 0 : Math.ceil(s.hp / s.hpPer), "count follows hp");
      assert.ok(s.hp <= s.maxCount * s.hpPer, "never overhealed");
      assert.ok(s.lost >= 0, "lost is never negative");
    }
    for (const [g, n] of Object.entries(side.goods)) assert.ok(n >= 0, `negative ${g}`);
    for (const [it, n] of Object.entries(side.bag)) assert.ok((n ?? 0) >= 0, `negative ${it}`);
    if (side.budget !== null) assert.ok(side.itemsUsed <= side.budget, `items ${side.itemsUsed} over budget ${side.budget}`);
  }
  if (!b.over) assert.ok(b.sides.atk.squads.some((s) => s.hp > 0) && b.sides.def.squads.some((s) => s.hp > 0), "both sides still standing");
}

// ---------------------------------------------------------------- the engine

test("battle engine: the same setup and the same choices always fight the same battle", () => {
  const run = () => {
    const b = createBattle(randomConfig(mulberry(5), 5));
    while (!b.over) autoRound(b);
    return JSON.stringify(b);
  };
  const a = run();
  assert.equal(a, run());
  assert.ok(JSON.parse(a).log.length >= 1);
});

test("battle engine: a battle survives a JSON round trip between any two calls, even mid-round", () => {
  for (let i = 0; i < 60; i++) {
    const cfg = randomConfig(mulberry(100 + i), i);
    // The same battle twice: once kept in memory, once frozen to JSON and thawed before every single call.
    const plain = createBattle(clone(cfg));
    let thawed = clone(createBattle(clone(cfg)));
    const choices = mulberry(900 + i);
    const choices2 = mulberry(900 + i);
    let guard = 0;
    while (!plain.over && guard++ < 40) {
      const a1 = randomAction(plain, "atk", choices);
      const d1 = aiAction(plain, "def");
      thawed = clone(thawed);
      const a2 = randomAction(thawed, "atk", choices2);
      thawed = clone(thawed);
      const d2 = aiAction(thawed, "def");
      assert.deepEqual(a2, a1);
      assert.deepEqual(d2, d1);
      const P = beginRound(plain, a1, d1);
      thawed = clone(thawed);
      beginRound(thawed, a2, d2);
      thawed = clone(thawed);
      if (!P.done) {
        const opts = reactionsFor(plain, "atk");
        assert.deepEqual(reactionsFor(thawed, "atk"), opts);
        const [use, which] = [choices(), choices()];
        choices2();
        choices2();
        if (opts.length && use < 0.6) {
          const die = Math.floor(which * P.dice.atk!.length);
          react(plain, "atk", opts[0].id, die);
          react(thawed, "atk", opts[0].id, die);
          thawed = clone(thawed);
        }
        aiReact(plain, "def");
        aiReact(thawed, "def");
        thawed = clone(thawed);
        assert.deepEqual(pairsNow(thawed), pairsNow(plain));
      }
      finishRound(plain);
      finishRound(thawed);
      assert.equal(JSON.stringify(thawed), JSON.stringify(plain), `battle ${i} round ${plain.round}`);
    }
    assert.equal(JSON.stringify(thawed), JSON.stringify(plain));
  }
});

test("battle engine: fuzz, hundreds of random battles and not one error", () => {
  const rng = mulberry(7);
  let battles = 0;
  let rounds = 0;
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < 400; i++) {
    let b = createBattle(randomConfig(rng, i));
    battles++;
    let guard = 0;
    while (!b.over && guard++ < 40) {
      if (rng() < 0.3) b = clone(b);
      const P = beginRound(b, randomAction(b, "atk", rng), randomAction(b, "def", rng));
      if (!P.done) {
        for (const k of ["atk", "def"] as const) {
          const opts = reactionsFor(b, k);
          if (opts.length && rng() < 0.5) react(b, k, opts[Math.floor(rng() * opts.length)].id, Math.floor(rng() * b.pending!.dice[k]!.length));
        }
      }
      for (const e of finishRound(b)) if (e.t === "damage") assert.ok(e.amount >= 0, `damage ${JSON.stringify(e)}`);
      rounds++;
      checkBattle(b);
    }
    assert.ok(b.over, "every battle ends");
    assert.ok(b.round <= RULES.roundLimit, `round limit ${b.round}`);
    outcomes[b.result!.how] = (outcomes[b.result!.how] ?? 0) + 1;
    const sm = summary(b);
    for (const k of ["atk", "def"] as const) for (const n of Object.values(sm[k].survivors)) assert.ok((n ?? 0) >= 0);
  }
  assert.equal(battles, 400);
  assert.ok(rounds > 1000, `rounds ${rounds}`);
  for (const how of ["won", "held", "retreat", "stalled"]) assert.ok(outcomes[how] > 0, `some battles ended ${how}: ${JSON.stringify(outcomes)}`);
});

// ---------------------------------------------------------------- the rules

test("battle rules: ties go to the defender (unless a guard or a Blessing says otherwise)", () => {
  const b = createBattle(duel());
  const ev = fixedRound(b, move("bellyBump"), move("bellyBump"), [4, 1, 1], [3, 1]);
  const pairs = ev.find((e) => e.t === "pairs") as Extract<BattleEvent, { t: "pairs" }>;
  // Attack pandas add 0, defending pandas add 1: 4 against 3+1 is a tie.
  assert.equal(pairs.pairs[0].a, 4);
  assert.equal(pairs.pairs[0].d, 4);
  assert.equal(pairs.pairs[0].win, "def");
  assert.equal(pairs.tieWinner, "def");

  // An attacker on guard claims ties.
  const g = createBattle(duel());
  beginRound(g, move("rolyPoly"), move("bellyBump"));
  g.pending!.dice = { atk: [4, 1], def: [3, 1] };
  assert.equal(pairsNow(g)[0].win, "atk");
  // A Blessing does too.
  const bl = createBattle(duel({ atk: { name: "Mei", squads: [{ unit: "panda", count: 5 }], bag: { blessing: 1 } } }));
  beginRound(bl, move("bellyBump"), move("bellyBump"));
  bl.pending!.dice = { atk: [4, 1, 1], def: [3, 1] };
  assert.equal(pairsNow(bl)[0].win, "def");
  assert.ok(reactionsFor(bl, "atk").some((r) => r.id === "blessing"));
  react(bl, "atk", "blessing");
  assert.equal(pairsNow(bl)[0].win, "atk");
});

test("battle rules: defenders roll one die fewer from Strikes and Signatures, as written for Guards and Tactics", () => {
  const b = createBattle(duel({ def: { name: "Otto", squads: [{ unit: "armedPanda", count: 4 }] }, atk: { name: "Mei", squads: [{ unit: "armedPanda", count: 4 }] } }));
  b.round = 3; // no first-round ambush or volley
  assert.equal(planDice(b, "atk", move("spearPoke")).dice, 3);
  assert.equal(planDice(b, "def", move("spearPoke")).dice, 2);
  assert.equal(planDice(b, "def", move("helmetHeadbutt")).dice, 1, "never fewer than one");
  assert.equal(planDice(b, "def", move("phalanx")).dice, 2, "guards roll as written");
  assert.equal(planDice(b, "def", move("drillFormation")).dice, 2, "tactics roll as written");
  assert.equal(planDice(b, "def", move("bambooWall")).dice, 3, "a guarding signature rolls as written");
  // Attackers add attack, defenders add defence.
  assert.equal(planDice(b, "atk", move("spearPoke")).bonus, 1);
  assert.equal(planDice(b, "def", move("spearPoke")).bonus, 2);
});

test("battle rules: type multipliers, Legends, and crits on a winning natural 6", () => {
  assert.equal(typeMult("fluff", "glam"), 1.5);
  assert.equal(typeMult("glam", "brute"), 1.5);
  assert.equal(typeMult("brute", "steel"), 1.5);
  assert.equal(typeMult("steel", "fluff"), 1.5);
  assert.equal(typeMult("glam", "fluff"), 0.75);
  assert.equal(typeMult("fluff", "brute"), 1, "opposites are even");
  assert.equal(typeMult("legend", "fluff"), 1, "Legends hit every type evenly");
  assert.equal(typeMult("steel", "legend"), 0.75, "Legends take a quarter less");

  // Armed Pandas (Steel) against Pandas (Fluff): super effective. Spear Poke deals 10 a pair.
  const b = createBattle(duel({ atk: { name: "Mei", squads: [{ unit: "armedPanda", count: 5 }] } }));
  let ev = fixedRound(b, move("spearPoke"), move("bellyBump"), [5, 1, 1], [1, 1]);
  let hit = damageTo(ev, "def")!;
  assert.equal(hit.amount, 15);
  assert.equal(hit.eff, "super");
  assert.equal(hit.crits, 0);
  assert.equal(hit.fell, 1);
  // A natural 6 that wins is a crit: x1.5 again.
  ev = fixedRound(b, move("spearPoke"), move("bellyBump"), [6, 1, 1], [1, 1]);
  hit = damageTo(ev, "def")!;
  assert.equal(hit.amount, Math.round(10 * 1.5 * 1.5));
  assert.equal(hit.crits, 1);
  // The other way round, pandas hitting armed pandas is not very effective.
  const c = createBattle(duel({ def: { name: "Otto", squads: [{ unit: "armedPanda", count: 5 }] } }));
  ev = fixedRound(c, move("bellyBump"), move("spearPoke"), [6, 6, 1], [1, 1]);
  hit = damageTo(ev, "def")!;
  assert.equal(hit.eff, "resist");
  assert.equal(hit.amount, Math.round(2 * 10 * 0.75 * 1.5));
});

test("battle rules: momentum builds one per pair won, and at 5 the Signature unlocks and spends it", () => {
  const b = createBattle(duel({ atk: { name: "Mei", squads: [{ unit: "nacam", count: 8 }] }, def: { name: "Otto", squads: [{ unit: "panda", count: 9 }] } }));
  const sig = () => actionsFor(b, "atk").signature.find((m) => m.id === "nacamStampede")!;
  assert.equal(sig().enabled, false);
  assert.equal(sig().reason, `Needs ${RULES.momentumMax} Momentum`);
  assert.throws(() => validate(b, "atk", move("nacamStampede")), /can't do that/);
  // Club Smash rolls two dice: win both pairs twice, then once more (no crits, so the pandas last).
  fixedRound(b, move("clubSmash"), move("bellyBump"), [5, 5], [1, 1]);
  assert.equal(b.sides.atk.momentum, 2);
  fixedRound(b, move("clubSmash"), move("bellyBump"), [5, 5], [1, 1]);
  assert.equal(b.sides.atk.momentum, 4);
  assert.equal(sig().enabled, false);
  const ev = fixedRound(b, move("clubSmash"), move("bellyBump"), [5, 5], [1, 1]);
  assert.equal(b.over, false);
  assert.equal(b.sides.atk.momentum, RULES.momentumMax, "capped at 5");
  assert.ok(ev.some((e) => e.t === "momentum" && e.side === "atk" && e.value === RULES.momentumMax));
  assert.equal(sig().enabled, true);
  fixedRound(b, move("nacamStampede"), move("bellyBump"), [6, 5, 4, 3], [1, 1]);
  assert.equal(b.sides.atk.momentum, 0, "the Signature spends it all");
});

test("battle rules: Standing Orders' item budget caps what a side can spend", () => {
  const cfg = (budget: number | null) =>
    duel({ def: { name: "Otto", doctrine: "allin", squads: [{ unit: "panda", count: 4 }], bag: { riceBall: 3, luckyGem: 3, whetstone: 2 }, budget } });
  const none = createBattle(cfg(0));
  assert.ok(actionsFor(none, "def").bag.every((x) => !x.enabled && x.reason === "Item budget spent"));
  assert.throws(() => validate(none, "def", { kind: "move", id: "bellyBump", prep: "whetstone" }), /orders allow/);
  beginRound(none, move("bellyBump"), move("bellyBump"));
  assert.deepEqual(reactionsFor(none, "def"), [], "no Lucky Gems either");
  assert.equal(aiReact(none, "def"), null);
  // With a budget of 2, however hard the computer tries, it spends 2 items at most.
  for (let seed = 1; seed <= 20; seed++) {
    const b = createBattle({ ...cfg(2), seed });
    while (!b.over) autoRound(b);
    assert.ok(b.sides.def.itemsUsed <= 2);
    const left = Object.values(b.sides.def.bag).reduce((n, v) => n + (v ?? 0), 0);
    assert.equal(8 - left, b.sides.def.itemsUsed, "every item spent is counted");
  }
  // No budget: the same side may spend freely.
  const free = createBattle(cfg(null));
  assert.equal(actionsFor(free, "def").bag.find((x) => x.id === "riceBall")!.enabled, true);
});
