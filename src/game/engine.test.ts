import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  GameError,
  activePlayer,
  addPlayer,
  applyAction,
  battle,
  createGame,
  emptyUnits,
  eventVisible,
  lineUsable,
  ownedRegions,
  removePlayer,
  unitTotal,
  viewFor,
  visibleRegions,
  type Action,
  type GameEvent,
  type GameState,
} from "./engine";
import { battleScript } from "./battleScript";
import { NEIGHBORS, REGIONS, lineEnds, lineId } from "./regions";
import { BUILDING_TYPES, EXCHANGE, GEAR_BATTLES, GOODS, HERO_IDS, RESOURCES, UNIT_TYPES } from "./rules";
import { ITEMS, WEAPONS } from "./battle/codex";
import { actionsFor, reactionsFor } from "./battle/engine";
import type { BattleAction, ItemId, TrapId, WeaponId } from "./battle/types";

const NOW = 1_800_000_000_000;

// ---------------------------------------------------------------- map

test("map: neighbours are valid, symmetric and the world is connected", () => {
  const ids = new Set(REGIONS.map((r) => r.id));
  assert.equal(ids.size, REGIONS.length, "region ids are unique");
  for (const [id, ns] of NEIGHBORS) {
    assert.ok(ns.length >= 2, `${id} has at least two neighbours`);
    for (const n of ns) {
      assert.ok(ids.has(n), `${id} → ${n} exists`);
      assert.notEqual(n, id);
      assert.ok(NEIGHBORS.get(n)!.includes(id), `${id} ↔ ${n} is symmetric`);
    }
  }
  const seen = new Set<string>(["sichuan"]);
  const queue = ["sichuan"];
  while (queue.length) {
    for (const n of NEIGHBORS.get(queue.pop()!)!) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  assert.equal(seen.size, REGIONS.length, "every region is reachable by gondola");
});

// ---------------------------------------------------------------- setup

function newGame(players: number, seed = 42) {
  const s = createGame(seed, NOW);
  const events: GameEvent[] = [];
  for (let i = 0; i < players; i++) events.push(...addPlayer(s, `p${i}`, `Kird ${i}`));
  return { s, events };
}

test("setup: players start apart, on land that isn't a native stronghold", () => {
  const { s } = newGame(6);
  const caps = s.players.map((p) => p.capital);
  assert.equal(new Set(caps).size, 6);
  for (const p of s.players) {
    const r = s.regions[p.capital];
    assert.equal(r.owner, p.id);
    assert.ok(unitTotal(r.units) > 0);
  }
  assert.throws(() => addPlayer(s, "p0", "again"), GameError);
});

// ---------------------------------------------------------------- rules

test("gondolas are the only way to move troops", () => {
  const { s } = newGame(1);
  const me = s.players[0];
  const from = me.capital;
  const to = NEIGHBORS.get(from)![0];
  assert.throws(() => applyAction(s, me.id, { type: "move", from, to, units: { panda: 1 } }, NOW), /gondola/);
  me.goods.coin += 10;
  applyAction(s, me.id, { type: "gondola", from, to }, NOW);
  assert.ok(lineUsable(s, me.id, from, to));
  assert.throws(() => applyAction(s, me.id, { type: "gondola", from, to }, NOW), /already/);
});

test("recruits are tired and can't ride the same turn", () => {
  const { s } = newGame(1);
  const me = s.players[0];
  const to = NEIGHBORS.get(me.capital)![0];
  s.lines[lineId(me.capital, to)] = { owner: me.id, builtTurn: 0 };
  s.regions[me.capital].units = { ...emptyUnits() };
  me.goods.bamboo = 5;
  me.goods.rice = 5;
  applyAction(s, me.id, { type: "recruit", region: me.capital, unit: "panda", count: 2 }, NOW);
  assert.throws(() => applyAction(s, me.id, { type: "move", from: me.capital, to, units: { panda: 1 } }, NOW), /rested/);
});

test("battle: a big army beats a small one and nobody goes negative", () => {
  const s = createGame(7, NOW);
  let wins = 0;
  for (let i = 0; i < 200; i++) {
    const r = battle(s, { panda: 0, armedPanda: 0, nacam: 8, cam: 4 }, 0, { panda: 2, armedPanda: 0, nacam: 0, cam: 0 }, 0);
    if (r.attackerWon) wins++;
    for (const t of UNIT_TYPES) assert.ok(r.attacker[t] >= 0 && r.defender[t] >= 0);
  }
  assert.ok(wins > 190, `strong attacker won ${wins}/200`);
});

test("pacts block invasions, loans move pandas and pay PandaCoin", () => {
  const { s } = newGame(2);
  const [a, b] = s.players;
  s.regions[a.capital].units.panda = 5;
  applyAction(s, a.id, { type: "offerLoan", to: b.id, region: a.capital, count: 2 }, NOW);
  applyAction(s, a.id, { type: "endTurn" }, NOW);
  const offer = s.offers.find((o) => o.to === b.id)!;
  const before = ownedRegions(s, b.id).reduce((n, r) => n + r.units.panda, 0);
  applyAction(s, b.id, { type: "respond", offerId: offer.id, accept: true }, NOW);
  assert.equal(ownedRegions(s, b.id).reduce((n, r) => n + r.units.panda, 0), before + 2);
  assert.equal(s.pacts.length, 1);
  // B tries to invade A over a line: blocked by the pact.
  const bRegion = ownedRegions(s, b.id)[0].id;
  s.lines[lineId(bRegion, a.capital)] = { owner: b.id, builtTurn: 0 };
  s.regions[bRegion].tired = emptyUnits();
  assert.throws(() => applyAction(s, b.id, { type: "move", from: bRegion, to: a.capital, units: { panda: 1 } }, NOW), /pact/);
  applyAction(s, b.id, { type: "breakPact", with: a.id }, NOW);
  assert.equal(s.pacts.length, 0);
  assert.ok(s.players[1].oathbreakerUntilRound >= s.round);
});

test("conquering Casey's region captures Casey; other heroes flee to the Hall", () => {
  const { s } = newGame(2);
  const [a, b] = s.players;
  const target = b.capital;
  s.heroes.casey = { owner: b.id, region: target, movedTurn: 0 };
  s.heroes.ping = { owner: b.id, region: target, movedTurn: 0 };
  s.regions[target].units = { ...emptyUnits() };
  const from = NEIGHBORS.get(target)!.find((n) => !s.regions[n].owner)!;
  s.regions[from].owner = a.id;
  s.regions[from].native = null;
  s.regions[from].units = { ...emptyUnits(), cam: 3 };
  s.regions[from].tired = emptyUnits();
  s.lines[lineId(from, target)] = { owner: a.id, builtTurn: 0 };
  applyAction(s, a.id, { type: "move", from, to: target, units: { cam: 3 } }, NOW);
  assert.equal(s.regions[target].owner, a.id);
  assert.equal(s.heroes.casey.owner, a.id);
  assert.equal(s.heroes.ping.owner, null);
});

test("it's never over: a wiped-out Kird gets Panda Asylum on their next turn", () => {
  const { s } = newGame(2);
  const [a, b] = s.players;
  for (const r of ownedRegions(s, b.id)) {
    r.owner = null;
    r.units = emptyUnits();
  }
  applyAction(s, a.id, { type: "endTurn" }, NOW);
  assert.ok(ownedRegions(s, b.id).length === 1, "respawned");
  assert.equal(s.players[1].respawns, 1);
});

test("fog of war: views hide what you can't see and other Kirds' purses", () => {
  const { s } = newGame(4);
  for (const p of s.players) {
    const v = viewFor(s, p.id);
    const vis = visibleRegions(s, p.id);
    for (const r of v.regions) {
      if (vis.has(r.id)) continue;
      assert.equal(r.fog, true);
      assert.equal(r.units, undefined);
      assert.equal(r.owner, undefined);
    }
    for (const q of v.players) if (q.id !== p.id) assert.equal(q.goods, undefined);
  }
});

test("leaving: land goes wild, heroes return, seats close up, the turn moves on", () => {
  const { s } = newGame(3);
  const [a, b, c] = s.players;
  s.heroes.ping = { owner: b.id, region: b.capital, movedTurn: 0 };
  s.lines[lineId(b.capital, NEIGHBORS.get(b.capital)![0])] = { owner: b.id, builtTurn: 0 };
  applyAction(s, a.id, { type: "offerPact", to: b.id }, NOW);
  applyAction(s, a.id, { type: "endTurn" }, NOW);
  assert.equal(activePlayer(s).id, b.id);
  removePlayer(s, b.id, NOW);
  assert.equal(s.players.length, 2);
  assert.deepEqual(s.players.map((p) => p.seat), [0, 1]);
  assert.equal(activePlayer(s).id, c.id, "the leaver's turn passed to the next Kird");
  assert.equal(ownedRegions(s, b.id).length, 0);
  assert.equal(s.regions[b.capital].native, "wild");
  assert.equal(s.heroes.ping.owner, null);
  assert.equal(Object.values(s.lines).filter((l) => l.owner === b.id).length, 0);
  assert.equal(s.offers.length, 0);
});

test("battle animation script matches what the engine decided", () => {
  const { s } = newGame(2, 5);
  const [a, b] = s.players;
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const from = a.capital;
    const to = b.capital;
    s.regions[from].owner = a.id;
    s.regions[from].units = { panda: 3, armedPanda: 1, nacam: 4, cam: 2 };
    s.regions[from].tired = emptyUnits();
    s.regions[to].owner = b.id;
    s.regions[to].native = null;
    s.regions[to].units = { panda: 4, armedPanda: 2, nacam: 1, cam: 1 };
    s.lines[lineId(from, to)] = { owner: a.id, builtTurn: 0 };
    s.activeSeat = a.seat;
    s.pacts = [];
    const evs = applyAction(s, a.id, { type: "move", from, to, units: { panda: 2, armedPanda: 1, nacam: 4, cam: 2 } }, NOW);
    // A person's invasion opens a battle; Sun Tzu fights it to the end.
    if (s.battle) evs.push(...applyAction(s, a.id, { type: "battleAuto" }, NOW));
    const battleEv = evs.find((e) => e.type === "battle");
    if (!battleEv) continue;
    const data = battleEv.data as unknown as import("./engine").BattleData;
    const { soldiers } = battleScript(data);
    for (const side of ["atk", "def"] as const) {
      const lost = side === "atk" ? data.attackerLost : data.defenderLost;
      for (const t of UNIT_TYPES) {
        const dead = soldiers.filter((x) => x.side === side && x.type === t && x.diesAt !== null).length;
        assert.equal(dead, lost[t], `${side} ${t} deaths match`);
      }
    }
    checked++;
    // put a back in charge for the next go
    s.regions[from].owner = a.id;
  }
  assert.ok(checked > 20);
});

// ---------------------------------------------------------------- fuzz

function randomAction(s: GameState, rnd: () => number): Action {
  const me = activePlayer(s);
  const mine = ownedRegions(s, me.id);
  const pickFrom = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const others = s.players.filter((p) => p.id !== me.id);
  const region = mine.length ? pickFrom(mine).id : REGIONS[0].id;
  // In the middle of a battle: fight it (sometimes badly, so refusals get tested too), hand it to Sun Tzu, or end the turn.
  if (s.battle) {
    const b = s.battle.b;
    const r = rnd();
    if (r < 0.03) return { type: "endTurn" };
    if (r < 0.08) return { type: "battleAuto" };
    if (r < 0.1) return pickFrom<Action>([{ type: "battleResolve" }, { type: "battleReact", id: "luckyGem", die: 0 }, { type: "build", region, building: "fort" }]);
    if (b.pending) {
      const opts = reactionsFor(b, "atk");
      if (opts.length && r < 0.6) return { type: "battleReact", id: pickFrom(opts).id, die: Math.floor(rnd() * 4) };
      return { type: "battleResolve" };
    }
    const g = actionsFor(b, "atk");
    const all = [...g.attack, ...g.defend, ...g.tactics, ...g.signature, ...g.bag.filter((x) => x.when === "action"), ...g.squads, ...(rnd() < 0.1 ? g.retreat : [])];
    const pickA = pickFrom(all);
    const action: BattleAction = pickA.kind === "move" ? { kind: "move", id: pickA.id } : pickA.kind === "item" ? { kind: "item", id: pickA.id } : pickA.kind === "switch" ? { kind: "switch", to: pickA.to } : { kind: "retreat" };
    const preps = g.bag.filter((x) => x.when === "prep");
    return { type: "battleRound", action, ...(preps.length && rnd() < 0.3 ? { prep: pickFrom(preps).id } : {}) };
  }
  // The Bag, the Armory and Standing Orders.
  if (rnd() < 0.08) {
    const r = rnd();
    if (r < 0.35) return { type: "buyItem", item: pickFrom(Object.keys(ITEMS) as ItemId[]), count: 1 + Math.floor(rnd() * 2) };
    if (r < 0.6) return { type: "buyGear", item: pickFrom(Object.keys(WEAPONS) as WeaponId[]), unit: pickFrom(UNIT_TYPES) };
    return {
      type: "setOrders",
      region: rnd() < 0.15 ? null : region,
      doctrine: pickFrom([undefined, null, "turtle", "counter", "allin", "diplomat"] as const),
      ...(rnd() < 0.5 ? { lead: pickFrom([null, ...UNIT_TYPES, ...HERO_IDS]) } : {}),
      ...(rnd() < 0.5 ? { budget: Math.floor(rnd() * 4) } : {}),
      ...(rnd() < 0.4 ? { traps: rnd() < 0.7 ? (["caltrops"] as TrapId[]) : [] } : {}),
    };
  }
  const roll = rnd();
  if (roll < 0.08) return { type: "endTurn" };
  if (roll < 0.14) return { type: "build", region, building: pickFrom(BUILDING_TYPES) };
  if (roll < 0.24) return { type: "recruit", region, unit: pickFrom(["panda", "nacam", "cam"] as const), count: 1 + Math.floor(rnd() * 3) };
  if (roll < 0.28) return { type: "arm", region, count: 1 };
  if (roll < 0.4) return { type: "gondola", from: region, to: pickFrom(NEIGHBORS.get(region)!) };
  if (roll < 0.62) {
    const withTroops = mine.filter((r) => UNIT_TYPES.some((t) => r.units[t] > r.tired[t]));
    const from = withTroops.length ? pickFrom(withTroops) : s.regions[region];
    const to = pickFrom(NEIGHBORS.get(from.id)!);
    const units = Object.fromEntries(UNIT_TYPES.map((t) => [t, Math.floor((from.units[t] - from.tired[t]) * rnd())]));
    return { type: "move", from: from.id, to, units };
  }
  if (roll < 0.645) return { type: "bankTrade", give: pickFrom(RESOURCES), get: pickFrom(RESOURCES) };
  if (roll < 0.66) return { type: "buy", good: pickFrom(RESOURCES), count: 1 + Math.floor(rnd() * 3) };
  if (roll < 0.69) {
    const x = pickFrom(EXCHANGE);
    return { type: "exchange", from: x.from, to: x.to };
  }
  if (roll < 0.72) return { type: "recruitHero", hero: pickFrom(HERO_IDS), region };
  if (roll < 0.75) return { type: "moveHero", hero: pickFrom(HERO_IDS), to: pickFrom(NEIGHBORS.get(region)!) };
  if (roll < 0.77) return { type: "thunder", target: pickFrom(REGIONS).id };
  if (roll < 0.79 && others.length) return { type: "pickpocket", target: pickFrom(others).id };
  if (roll < 0.83 && others.length) return { type: "offerTrade", to: pickFrom(others).id, give: { [pickFrom(GOODS)]: 1 }, get: { [pickFrom(GOODS)]: 1 } };
  if (roll < 0.85 && others.length) return { type: "offerPact", to: pickFrom(others).id };
  if (roll < 0.87 && others.length) return { type: "offerLoan", to: pickFrom(others).id, region, count: 1 };
  if (roll < 0.94) {
    const mineOffers = s.offers.filter((o) => o.to === me.id);
    if (mineOffers.length) return { type: "respond", offerId: pickFrom(mineOffers).id, accept: rnd() < 0.7 };
  }
  if (roll < 0.96 && others.length) return { type: "breakPact", with: pickFrom(others).id };
  return { type: "endTurn" };
}

function checkInvariants(s: GameState, events: GameEvent[]) {
  const ids = new Set(s.players.map((p) => p.id));
  for (const p of s.players) for (const g of GOODS) assert.ok(p.goods[g] >= 0, `${p.name} ${g} = ${p.goods[g]}`);
  for (const r of Object.values(s.regions)) {
    for (const t of UNIT_TYPES) {
      assert.ok(Number.isInteger(r.units[t]) && r.units[t] >= 0, `${r.id} ${t} units`);
      assert.ok(r.tired[t] >= 0 && r.tired[t] <= r.units[t], `${r.id} ${t} tired ${r.tired[t]} > ${r.units[t]}`);
    }
    if (r.owner) {
      assert.ok(ids.has(r.owner));
      assert.equal(r.native, null);
    }
    assert.ok(r.token >= 2 && r.token <= 12 && r.token !== 7);
    assert.equal(new Set(r.buildings).size, r.buildings.length, "no duplicate buildings");
  }
  for (const h of HERO_IDS) {
    const hero = s.heroes[h];
    if (hero.owner) {
      assert.ok(ids.has(hero.owner));
      assert.ok(hero.region, `${h} has a region`);
      assert.equal(s.regions[hero.region!].owner, hero.owner, `${h} stands in its owner's land`);
    } else assert.equal(hero.region, null);
  }
  for (const id of Object.keys(s.lines)) for (const e of lineEnds(id)) assert.ok(s.regions[e]);
  for (const p of s.players) {
    for (const [it, n] of Object.entries(p.bag ?? {})) assert.ok(Number.isInteger(n) && n! > 0, `${p.name}'s bag: ${it} = ${n}`);
    const gear = [...Object.values(p.armory?.units ?? {}).flatMap((g) => [g?.weapon, g?.armor]), p.armory?.army].filter(Boolean);
    for (const g of gear) assert.ok(g!.charges >= 1 && g!.charges <= GEAR_BATTLES, `${p.name}'s ${g!.id} has ${g!.charges} charges`);
  }
  for (const r of Object.values(s.regions)) if (r.orders) assert.ok(r.owner, `${r.id} has orders but no owner`);
  if (s.battle) {
    assert.equal(s.battle.attacker, activePlayer(s).id, "only the player whose turn it is has a battle open");
    assert.equal(s.battle.b.over, false, "a finished battle never lingers");
    assert.equal(s.regions[s.battle.from].owner, s.battle.attacker);
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s.battle))), JSON.stringify(s.battle), "the battle is plain JSON");
  }
  for (let i = 1; i < events.length; i++) assert.equal(events[i].seq, events[i - 1].seq + 1, "event seq is contiguous");
  assert.equal(s.seq, events.at(-1)?.seq ?? 0);
  assert.ok(s.activeSeat >= 0 && s.activeSeat < s.players.length);
}

function lcg(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test("fuzz: thousands of random actions never break the world", () => {
  let applied = 0;
  let rejected = 0;
  for (const [seed, players] of [[1, 2], [2, 3], [3, 4], [4, 6], [5, 8], [6, 1]] as const) {
    const { s, events } = newGame(players, seed);
    const rnd = lcg(seed * 7919);
    for (let step = 0; step < 4000; step++) {
      // Late joiners are welcome in a never-ending game.
      if (step === 1500 && s.players.length < 8) events.push(...addPlayer(s, "late", "Late Kird"));
      // …and Kirds sometimes leave.
      if (step === 2500 && s.players.length > 1) events.push(...removePlayer(s, s.players[Math.floor(rnd() * s.players.length)].id, NOW));
      const actor = rnd() < 0.02 ? s.players[Math.floor(rnd() * s.players.length)].id : activePlayer(s).id;
      const a = randomAction(s, rnd);
      const snapshot = JSON.stringify(s);
      try {
        events.push(...applyAction(s, actor, a, NOW + step * 1000));
        applied++;
      } catch (e) {
        if (!(e instanceof GameError)) throw new Error(`Crash on ${JSON.stringify(a)}: ${(e as Error).stack}`);
        // Rejected actions must not have changed anything.
        assert.equal(JSON.stringify(s), snapshot, `rejected ${a.type} mutated state: ${(e as Error).message}`);
        rejected++;
      }
      checkInvariants(s, events);
    }
    assert.ok(s.round > 5, `seed ${seed}: the game kept going (round ${s.round})`);
    // Every player can always load their view, and event filtering never throws.
    for (const p of s.players) {
      viewFor(s, p.id);
      events.forEach((e) => eventVisible(s, e, p.id));
    }
  }
  assert.ok(applied > 5000, `applied ${applied}, rejected ${rejected}`);
});

test("determinism: same seed and same actions give the same world", () => {
  const run = () => {
    const { s } = newGame(3, 99);
    const rnd = lcg(5);
    for (let i = 0; i < 1500; i++) {
      try {
        applyAction(s, activePlayer(s).id, randomAction(s, rnd), NOW);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
      }
    }
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});

// ---------------------------------------------------------------- computer players

import { playBotTurn, runBots } from "./bot";

function botGame(levels: ("easy" | "medium" | "hard")[], seed = 7) {
  const s = createGame(seed, NOW);
  const events: GameEvent[] = [];
  events.push(...addPlayer(s, "human", "Taylor"));
  levels.forEach((l, i) => events.push(...addPlayer(s, `bot${i}`, `Bot ${i}`, l)));
  return { s, events };
}

test("bots: after a person ends their turn, every bot plays and it's the person's turn again", () => {
  const { s, events } = botGame(["easy", "medium", "hard"]);
  events.push(...applyAction(s, "human", { type: "endTurn" }, NOW));
  events.push(...runBots(s, NOW));
  assert.equal(activePlayer(s).id, "human");
  for (const id of ["bot0", "bot1", "bot2"]) assert.ok(events.some((e) => e.type === "endTurn" && e.actor === id), `${id} took a turn`);
  checkInvariants(s, events);
});

test("bots: hundreds of rounds of bots only never break the world, and hard bots grow", () => {
  for (const seed of [1, 2, 3]) {
    const { s, events } = botGame(["easy", "medium", "hard", "hard"], seed);
    const start = ownedRegions(s, "bot3").length;
    for (let round = 0; round < 120; round++) {
      events.push(...applyAction(s, "human", { type: "endTurn" }, NOW));
      events.push(...runBots(s, NOW));
      assert.equal(activePlayer(s).id, "human", "the loop always stops at the person");
      checkInvariants(s, events);
    }
    const total = ["bot2", "bot3"].reduce((n, id) => n + ownedRegions(s, id).length, 0);
    assert.ok(total > start * 2, `hard bots expanded (seed ${seed}: ${total} regions)`);
  }
});

test("bots: they answer offers made to them", () => {
  const { s, events } = botGame(["medium"]);
  events.push(...applyAction(s, "human", { type: "offerPact", to: "bot0" }, NOW));
  events.push(...applyAction(s, "human", { type: "endTurn" }, NOW));
  events.push(...playBotTurn(s, NOW));
  assert.equal(s.offers.length, 0, "the pact offer was answered");
  assert.ok(events.some((e) => (e.type === "pact" || e.type === "decline") && e.actor === "bot0"));
});

test("bots: a game of only bots doesn't spin forever", () => {
  const { s } = botGame(["easy", "hard"]);
  removePlayer(s, "human", NOW);
  assert.deepEqual(runBots(s, NOW), []);
});

test("stone: NACAM ogres quarry Stone, and more ogres find more", () => {
  const haul = (ogres: number) => {
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { s } = newGame(1, seed);
      const me = s.players[0];
      s.regions[me.capital].units.nacam = ogres;
      me.goods.coin = 100; // pay the ogres
      const before = me.goods.stone;
      applyAction(s, me.id, { type: "endTurn" }, NOW);
      total += s.players[0].goods.stone - before; // actions swap in a fresh copy of the state
    }
    return total;
  };
  const none = haul(0);
  const few = haul(1);
  const many = haul(6);
  assert.ok(few > none, `1 ogre (${few}) beats none (${none})`);
  assert.ok(many > few * 1.5, `6 ogres (${many}) beat 1 (${few})`);
});

// ---------------------------------------------------------------- economy, caps, starts, victory

import { BUY_PRICE, BUY_PRICE_MARKET, NATIVE_CAP } from "./rules";
import { capNatives, createGame as newWorld } from "./engine";

test("bank: Coin buys any resource, cheaper with a Market, and you can't overspend", () => {
  const { s } = newGame(1);
  const id = s.players[0].id;
  s.players[0].goods.coin = 10;
  applyAction(s, id, { type: "buy", good: "stone", count: 2 }, NOW);
  assert.equal(s.players[0].goods.coin, 10 - 2 * BUY_PRICE);
  assert.equal(s.players[0].goods.stone, 2 + 2);
  s.regions[s.players[0].capital].buildings.push("market");
  applyAction(s, id, { type: "buy", good: "gems", count: 1 }, NOW);
  assert.equal(s.players[0].goods.coin, 10 - 2 * BUY_PRICE - BUY_PRICE_MARKET);
  assert.throws(() => applyAction(s, id, { type: "buy", good: "gems", count: 20 }, NOW), GameError);
  assert.throws(() => applyAction(s, id, { type: "buy", good: "coin" as never, count: 1 }, NOW), GameError);
  assert.throws(() => applyAction(s, id, { type: "buy", good: "iron", count: 0 }, NOW), GameError);
});

test("natives: garrisons never grow past their caps, however long the game runs", () => {
  const { s } = newGame(1, 5);
  const id = s.players[0].id;
  for (let i = 0; i < 400; i++) applyAction(s, id, { type: "endTurn" }, NOW);
  for (const r of Object.values(s.regions)) {
    if (r.owner || !r.native) continue;
    for (const t of UNIT_TYPES) assert.ok(r.units[t] <= (NATIVE_CAP[r.native][t] ?? 0), `${r.id} ${t} ${r.units[t]}`);
  }
  // And an old, overgrown garrison is trimmed back.
  const ogres = Object.values(s.regions).find((r) => !r.owner && r.native === "nacams")!;
  ogres.units.nacam = 40;
  capNatives(ogres);
  assert.equal(ogres.units.nacam, NATIVE_CAP.nacams.nacam);
});

test("starts: nobody gets a free gondola, but everyone lands next to somewhere they can take", () => {
  let soft = 0;
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s } = newGame(4, seed);
    assert.equal(Object.keys(s.lines).length, 0, `no starter lines (seed ${seed})`);
    for (const p of s.players) {
      total++;
      if (NEIGHBORS.get(p.capital)!.some((n) => !s.regions[n].owner && unitTotal(s.regions[n].units) <= 3)) soft++;
    }
  }
  assert.ok(soft / total >= 0.95, `soft neighbour for ${soft}/${total} starts`);
});

test("victory: reaching the goal only warns everyone; you win if you still hold it when your next turn starts", () => {
  const s = newWorld(9, NOW, 3);
  addPlayer(s, "a", "A");
  addPlayer(s, "b", "B");
  const free = Object.values(s.regions).filter((r) => !r.owner).slice(0, 2);
  for (const r of free) Object.assign(s.regions[r.id], { owner: "a", native: null });
  // A's next move puts them on the goal: a warning, not a win.
  const warned = applyAction(s, "a", { type: "buy", good: "rice", count: 1 }, NOW);
  assert.equal(s.winner, null);
  assert.equal(s.threat, "a");
  assert.ok(warned.some((e) => e.type === "threat" && e.public));
  assert.equal(viewFor(s, "b").threat, "a");
  // B gets a full turn to respond; B does nothing.
  applyAction(s, "a", { type: "endTurn" }, NOW);
  assert.equal(s.winner, null, "no win on B's turn");
  const end = applyAction(s, "b", { type: "endTurn" }, NOW);
  assert.equal(s.winner, "a", "A survived the round");
  assert.ok(end.some((e) => e.type === "victory"));
  assert.throws(() => applyAction(s, "a", { type: "endTurn" }, NOW), /over/);
  assert.equal(viewFor(s, "b").winner, "a");
});

test("victory: knock the leader below the goal before their turn and the win is off", () => {
  const s = newWorld(9, NOW, 3);
  addPlayer(s, "a", "A");
  addPlayer(s, "b", "B");
  const free = Object.values(s.regions).filter((r) => !r.owner).slice(0, 2);
  for (const r of free) Object.assign(s.regions[r.id], { owner: "a", native: null });
  applyAction(s, "a", { type: "buy", good: "rice", count: 1 }, NOW);
  applyAction(s, "a", { type: "endTurn" }, NOW);
  // B takes one of A's regions (set up directly: an empty A region next to B with a line).
  const lost = free[0].id;
  Object.assign(s.regions[lost], { units: { panda: 0, armedPanda: 0, nacam: 0, cam: 0 } });
  const bHome = s.players.find((p) => p.id === "b")!.capital;
  s.regions[bHome].units.panda = 5;
  s.lines[lineId(bHome, lost)] = { owner: "b", builtTurn: 0 };
  s.regions[lost].owner = "a";
  const events = applyAction(s, "b", { type: "move", from: bHome, to: lost, units: { panda: 2 } }, NOW);
  assert.ok(events.some((e) => e.type === "threatOver"));
  assert.equal(s.threat, null);
  applyAction(s, "b", { type: "endTurn" }, NOW);
  assert.equal(s.winner, null, "A no longer holds the goal when their turn starts");
});

test("victory: endless games (no goal) never end", () => {
  const { s } = newGame(1);
  for (const r of Object.values(s.regions).slice(0, 30)) {
    r.owner = s.players[0].id;
    r.native = null;
  }
  applyAction(s, s.players[0].id, { type: "endTurn" }, NOW);
  assert.equal(s.winner, null);
});

test("skip: the host is the first person, even when computer players sit first", () => {
  const s = newWorld(3, NOW);
  addPlayer(s, "bot-1", "Robo", "hard");
  addPlayer(s, "human", "Taylor");
  addPlayer(s, "late", "Alex");
  applyAction(s, "bot-1", { type: "endTurn" }, NOW); // now Taylor's turn
  applyAction(s, "human", { type: "endTurn" }, NOW); // now Alex's turn
  const later = NOW + 13 * 3600 * 1000;
  assert.throws(() => applyAction(s, "bot-1", { type: "skipTurn" }, later), /host/);
  applyAction(s, "human", { type: "skipTurn" }, later);
  assert.equal(activePlayer(s).id, "bot-1");
});

// ---------------------------------------------------------------- odds & advisor

import { advise, fillCost } from "./advisor";
import { battleOdds, units as mkUnits } from "./odds";

test("odds: big armies are favourites, tiny ones aren't, and the numbers are stable", () => {
  const strong = battleOdds(mkUnits({ panda: 8, nacam: 3 }), 0, mkUnits({ panda: 1 }), 0);
  const weak = battleOdds(mkUnits({ panda: 1 }), 0, mkUnits({ nacam: 8 }), 1);
  assert.ok(strong.win > 0.97, `strong ${strong.win}`);
  assert.ok(weak.win < 0.05, `weak ${weak.win}`);
  assert.deepEqual(battleOdds(mkUnits({ panda: 3 }), 0, mkUnits({ panda: 2 }), 0), battleOdds(mkUnits({ panda: 3 }), 0, mkUnits({ panda: 2 }), 0));
  assert.equal(battleOdds(mkUnits({ panda: 1 }), 0, mkUnits({}), 0).win, 1);
});

test("advisor: on turn one Sun Tzu says where to build, then to invade, and it really does win", () => {
  let wins = 0;
  let total = 0;
  let quiet = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = newGame(1, seed);
    const me = s.players[0];
    const first = advise(viewFor(s, me.id));
    const line = first.find((t) => t.action?.type === "gondola");
    assert.ok(line, `seed ${seed}: ${first.map((t) => t.title).join(" | ")}`);
    applyAction(s, me.id, line!.action!, NOW);
    const attack = advise(viewFor(s, me.id)).find((t) => t.plan);
    // Since Pokémon-style battles, a lone wild panda curled up behind Roly-Poly is no pushover: the advisor only
    // suggests invasions it rates 70% or better, so now and then the start kit has to grow first.
    if (!attack) {
      quiet++;
      continue;
    }
    const from = s.regions[attack!.plan!.from];
    const send = { ...from.units };
    send.panda -= 1;
    applyAction(s, me.id, { type: "move", from: from.id, to: attack!.plan!.to, units: send }, NOW);
    if (s.battle) applyAction(s, me.id, { type: "battleAuto" }, NOW);
    total++;
    if (s.regions[attack!.plan!.to].owner === me.id) wins++;
  }
  assert.ok(quiet <= 6, `an invasion was suggested in ${30 - quiet}/30 games`);
  assert.ok(wins / total >= 0.6, `advised attacks won ${wins}/${total}`);
});

test("advisor: quiet when it isn't your turn, and never suggests hitting a pact partner", () => {
  const { s } = newGame(2, 4);
  const [a, b] = s.players;
  assert.deepEqual(advise(viewFor(s, b.id)), []);
  s.pacts.push({ a: a.id, b: b.id, sinceRound: 1 });
  for (const t of advise(viewFor(s, a.id))) if (t.plan) assert.notEqual(s.regions[t.plan.to].owner, b.id);
});

test("advisor: buying missing resources is priced right and refused when Coin can't cover it", () => {
  assert.deepEqual(fillCost({ bamboo: 1, stone: 0, iron: 0, coin: 10 }, { bamboo: 1, stone: 1, iron: 1, coin: 1 }, 3), { buy: { stone: 1, iron: 1 }, coin: 6 });
  assert.equal(fillCost({ coin: 6 }, { stone: 1, iron: 1, coin: 1 }, 3), null);
  assert.equal(fillCost({ coin: 99 }, { camCoin: 1 }, 3), null);
});

// ---------------------------------------------------------------- bot diplomacy & chat

import { botReply } from "./botChat";

test("bots: they make offers to human neighbours, one at a time, and withdraw stale ones", () => {
  let offered = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = newWorld(seed, NOW);
    addPlayer(s, "human", "Taylor");
    addPlayer(s, "bot", "Robo", "easy");
    // Make them neighbours: hand the bot a region bordering Taylor's capital.
    const n = NEIGHBORS.get(s.players[0].capital)!.find((x) => !s.regions[x].owner)!;
    Object.assign(s.regions[n], { owner: "bot", native: null });
    let made = false;
    for (let round = 0; round < 12; round++) {
      applyAction(s, "human", { type: "endTurn" }, NOW);
      if (runBots(s, NOW).some((e) => e.type === "offer" && e.actor === "bot")) made = true;
      assert.ok(s.offers.filter((o) => o.from === "bot").length <= 1, "at most one open offer");
      for (const o of s.offers.filter((x) => x.from === "bot")) assert.ok(s.turn - o.turn < s.players.length * 2 + 2, "stale offers get withdrawn");
    }
    if (made) offered++;
  }
  assert.ok(offered >= 10, `bots offered in ${offered}/20 games`);
});

test("bot chat: replies fit what was said and the bot's personality", () => {
  const r = () => 0;
  assert.match(botReply("easy", "want to make a pact?", r), /pact/i);
  assert.match(botReply("hard", "I'm going to invade you", r), /simulated|Casey/);
  assert.ok(botReply("medium", "hello there", r).length > 0);
  assert.ok(botReply("hard", "🐼", r).length > 0);
});

import { canReplay } from "./battleScript";

test("replays: only battles that recorded their dice can be re-enacted (older games had none)", () => {
  const { s } = newGame(1, 3);
  const me = s.players[0];
  const target = NEIGHBORS.get(me.capital)!.find((n) => !s.regions[n].owner)!;
  me.goods.coin += 10;
  applyAction(s, me.id, { type: "buy", good: "iron", count: 1 }, NOW);
  applyAction(s, me.id, { type: "gondola", from: me.capital, to: target }, NOW);
  const send = { ...s.regions[me.capital].units };
  const events = applyAction(s, me.id, { type: "move", from: me.capital, to: target, units: send }, NOW);
  if (s.battle) events.push(...applyAction(s, me.id, { type: "battleAuto" }, NOW));
  const fight = events.find((e) => e.type === "battle" || e.type === "capture")!;
  if (fight.type === "battle") assert.equal(canReplay(fight), true);
  assert.equal(canReplay({ type: "battle", data: undefined }), false);
  assert.equal(canReplay({ type: "battle", data: { attacker: {} } }), false);
  assert.equal(canReplay({ type: "move", data: fight.data }), false);
});

import { SUN_TZU_QUOTES, sunTzuOpening, sunTzuSays } from "./sunTzu";

test("Sun Tzu: every piece of advice comes with a saying, steady within a turn", () => {
  for (const list of Object.values(SUN_TZU_QUOTES)) assert.ok(list.length > 0 && list.every((q) => q.length > 10));
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = newGame(2, seed);
    const tips = advise(viewFor(s, s.players[0].id));
    tips.forEach((t, i) => {
      const q = sunTzuSays(t, s.turn, i);
      assert.ok(q.length > 10);
      assert.equal(sunTzuSays(t, s.turn, i), q, "same saying on every refresh");
    });
  }
  assert.ok(sunTzuOpening(1, true, true).length > 10);
  assert.ok(sunTzuOpening(-3, false, false).length > 10, "handles any turn number");
});

test("fuzz: with bots and a goal, warnings, comebacks and wins stay consistent to the very end", () => {
  let finished = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = newWorld(seed * 101, NOW, 6);
    const events: GameEvent[] = [];
    events.push(...addPlayer(s, "human", "Taylor"));
    for (const [i, l] of (["easy", "medium", "hard"] as const).entries()) events.push(...addPlayer(s, `bot${i}`, `Bot ${i}`, l));
    const rnd = lcg(seed * 31);
    for (let step = 0; step < 3000 && !s.winner; step++) {
      const snapshot = JSON.stringify(s);
      const a = randomAction(s, rnd);
      try {
        events.push(...applyAction(s, "human", a, NOW));
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        assert.equal(JSON.stringify(s), snapshot, "rejected moves change nothing");
      }
      events.push(...runBots(s, NOW));
      checkInvariants(s, events);
      // A warning only ever names someone at or above the goal.
      if (s.threat) assert.ok(ownedRegions(s, s.threat).length >= 6, "threat means holding the goal");
    }
    if (s.winner) {
      finished++;
      assert.ok(ownedRegions(s, s.winner).length >= 6, "the winner holds the goal");
      assert.ok(events.some((e) => e.type === "victory"));
      assert.ok(events.some((e) => e.type === "threat" && e.actor === s.winner), "the win was announced a round ahead");
      assert.throws(() => applyAction(s, activePlayer(s).id, { type: "endTurn" }, NOW), /over/);
    }
  }
  assert.ok(finished >= 3, `games reached a winner: ${finished}/6`);
});

// ---------------------------------------------------------------- army tab

import { armySummary, battleRecord, regionReports } from "./army";

test("army: totals, ready troops, wages and heroes add up to what's on the map", () => {
  const { s } = newGame(2, 12);
  const me = s.players[0];
  const cap = s.regions[me.capital];
  cap.units = { panda: 4, armedPanda: 1, nacam: 2, cam: 0 };
  cap.tired = { panda: 1, armedPanda: 0, nacam: 0, cam: 0 };
  s.heroes.ping = { owner: me.id, region: cap.id, movedTurn: 0 };
  const sum = armySummary(viewFor(s, me.id));
  assert.deepEqual(sum.total, { panda: 4, armedPanda: 1, nacam: 2, cam: 0 });
  assert.deepEqual(sum.ready, { panda: 3, armedPanda: 1, nacam: 2, cam: 0 });
  assert.equal(sum.upkeep, 2);
  assert.equal(sum.pandaCoinFromPandas, 1);
  assert.deepEqual(sum.heroes, [{ id: "ping", region: cap.id }]);
});

test("army: a big enemy army next door is flagged as a danger; allies and natives never are", () => {
  const { s } = newGame(2, 12);
  const [a, b] = s.players;
  const n = NEIGHBORS.get(a.capital)!.find((x) => !s.regions[x].owner)!;
  Object.assign(s.regions[n], { owner: b.id, native: null, units: { panda: 0, armedPanda: 0, nacam: 9, cam: 3 } });
  s.regions[a.capital].units = { panda: 1, armedPanda: 0, nacam: 0, cam: 0 };
  const home = regionReports(viewFor(s, a.id)).find((r) => r.region.id === a.capital)!;
  assert.ok(home.danger && home.danger.owner === b.id && home.danger.win > 0.9, JSON.stringify(home.danger));
  s.pacts.push({ a: a.id, b: b.id, sinceRound: 1 });
  assert.equal(regionReports(viewFor(s, a.id)).find((r) => r.region.id === a.capital)!.danger, null);
});

test("army: the battle record shows wins and losses from your side of the table", () => {
  const { s } = newGame(2, 12);
  const [a, b] = s.players;
  const n = NEIGHBORS.get(a.capital)!.find((x) => !s.regions[x].owner)!;
  Object.assign(s.regions[n], { owner: b.id, native: null, units: { panda: 1, armedPanda: 0, nacam: 0, cam: 0 } });
  s.regions[a.capital].units = { panda: 9, armedPanda: 0, nacam: 3, cam: 0 };
  s.lines[lineId(a.capital, n)] = { owner: a.id, builtTurn: 0 };
  const events = applyAction(s, a.id, { type: "move", from: a.capital, to: n, units: { panda: 8, nacam: 3 } }, NOW);
  events.push(...applyAction(s, a.id, { type: "battleAuto" }, NOW));
  const mine = battleRecord(viewFor(s, a.id), events);
  const theirs = battleRecord(viewFor(s, b.id), events);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].role, "attack");
  assert.equal(theirs[0].role, "defend");
  assert.equal(mine[0].won, !theirs[0].won, "one side's win is the other's loss");
});

// ---------------------------------------------------------------- autopilot

test("autopilot: switch it on any time; the computer plays your turns and leaves you a private recap", () => {
  const s = newWorld(21, NOW);
  addPlayer(s, "taylor", "Taylor");
  addPlayer(s, "alex", "Alex");
  // Not Taylor's turn? Doesn't matter: Alex switches on while Taylor plays.
  const seenBefore = s.players[1].lastTurnEndSeq;
  const on = applyAction(s, "alex", { type: "autopilot", on: true, level: "hard" }, NOW);
  assert.ok(on.some((e) => e.type === "autopilot" && e.public));
  assert.equal(s.players[1].autopilot, "hard");
  assert.equal(viewFor(s, "taylor").players[1].autopilot, "hard");
  // Taylor ends the turn; Alex's turn is played at once and it's Taylor's turn again.
  const events = applyAction(s, "taylor", { type: "endTurn" }, NOW);
  events.push(...runBots(s, NOW));
  assert.equal(activePlayer(s).id, "taylor");
  assert.ok(events.some((e) => e.type === "endTurn" && e.actor === "alex"));
  const recap = events.find((e) => e.type === "autopilotRecap")!;
  assert.deepEqual(recap.only, ["alex"]);
  assert.ok(!eventVisible(s, recap, "taylor"), "nobody else sees the recap");
  assert.equal(s.players[1].lastTurnEndSeq, seenBefore, "the replay still starts from before the autopilot turns");
  // Back in command.
  applyAction(s, "alex", { type: "autopilot", on: false }, NOW);
  assert.equal(s.players[1].autopilot, null);
  assert.throws(() => applyAction(s, "alex", { type: "autopilot", on: false }, NOW), /already off/);
});

test("autopilot: rounds keep going with people away, but a game where everyone's away waits for someone", () => {
  const s = newWorld(22, NOW);
  addPlayer(s, "a", "A");
  addPlayer(s, "b", "B");
  addPlayer(s, "c", "C");
  const events: GameEvent[] = [];
  events.push(...applyAction(s, "b", { type: "autopilot", on: true }, NOW));
  events.push(...applyAction(s, "c", { type: "autopilot", on: true }, NOW));
  for (let round = 0; round < 30; round++) {
    events.push(...applyAction(s, "a", { type: "endTurn" }, NOW));
    events.push(...runBots(s, NOW));
    assert.equal(activePlayer(s).id, "a");
    checkInvariants(s, events);
  }
  applyAction(s, "a", { type: "autopilot", on: true }, NOW);
  assert.deepEqual(runBots(s, NOW), [], "nobody in command: nothing auto-plays");
  assert.throws(() => applyAction(s, "a", { type: "autopilot", on: true, level: "godlike" as never }, NOW), GameError);
});

test("autopilot: computer players can't switch it off", () => {
  const { s } = botGame(["easy"]);
  assert.throws(() => applyAction(s, "bot0", { type: "autopilot", on: false }, NOW), /always/);
});

// ---------------------------------------------------------------- the start-of-turn roll

import type { IncomeData, RaidData, RollData } from "./engine";
import { REGION_BY_ID } from "./regions";
import { cardCount, payouts, rollShow } from "./rollReport";

test("dice: a roll's data says exactly what each Kird collected, and nothing about who holds what", () => {
  let checked = 0;
  for (let seed = 1; seed <= 200 && checked < 12; seed++) {
    const { s } = newGame(3, seed);
    // Hand out plenty of land so most numbers pay somebody.
    Object.values(s.regions)
      .filter((r) => !r.owner)
      .slice(0, 24)
      .forEach((r, i) => Object.assign(r, { owner: s.players[i % 3].id, native: null }));
    const before = s.players.map((p) => ({ ...p.goods }));
    const events = applyAction(s, "p0", { type: "endTurn" }, NOW); // p1's turn starts with the roll
    const roll = events.find((e) => e.type === "roll")!;
    const data = roll.data as RollData;
    const total = data.roll[0] + data.roll[1];
    if (total === 7) continue;
    checked++;
    assert.ok(roll.public);
    // Fog of war: the public data names players and goods, never regions.
    assert.deepEqual(Object.keys(data).filter((k) => !["roll", "got", "blight"].includes(k)), []);
    const json = JSON.stringify(data);
    for (const r of REGIONS) assert.ok(!json.includes(`"${r.id}"`), `${r.id} stays out of the roll data`);
    // It adds up: one card per paying region.
    const paying = Object.values(s.regions).filter((r) => r.owner && r.token === total && !(data.blight && REGION_BY_ID.get(r.id)!.resource === "bamboo"));
    assert.equal(Object.values(data.got!).reduce((n, c) => n + cardCount(c), 0), paying.length);
    // …and it matches every purse. p1 also gets their turn's harvest and income, which their private event spells out.
    const inc = events.find((e) => e.type === "income")!.data as IncomeData;
    assert.deepEqual(events.find((e) => e.type === "income")!.only, ["p1"]);
    s.players.forEach((p, i) => {
      const expect: Partial<Record<string, number>> = { ...data.got![p.id] };
      if (p.id === "p1") {
        for (const [g, n] of Object.entries(inc.harvest)) expect[g] = (expect[g] ?? 0) + (n ?? 0);
        expect.stone = (expect.stone ?? 0) + inc.quarried;
        Object.assign(expect, { coin: inc.coin, pandaCoin: inc.pandaCoin, camCoin: inc.camCoin });
      }
      for (const g of GOODS) assert.equal(p.goods[g] - before[i][g], expect[g] ?? 0, `seed ${seed}: ${p.id} ${g}`);
    });
  }
  assert.ok(checked >= 8, `checked ${checked} rolls`);
});

test("dice: on a 7 everyone learns who the ogres raided, and only the raided Kird learns what they took", () => {
  let checked = 0;
  for (let seed = 1; seed <= 400 && checked < 5; seed++) {
    const { s } = newGame(3, seed);
    Object.assign(s.players[0].goods, { bamboo: 5, stone: 4, iron: 3, rice: 2, gems: 1 }); // 15 cards
    Object.assign(s.players[1].goods, { bamboo: 1, stone: 6, iron: 1, rice: 4, gems: 0 }); // 12 cards
    Object.assign(s.players[2].goods, { bamboo: 2, stone: 2, iron: 2, rice: 2, gems: 1 }); // 9: safe
    const before = s.players.map((p) => ({ ...p.goods }));
    const events = applyAction(s, "p0", { type: "endTurn" }, NOW);
    const roll = events.find((e) => e.type === "roll")!;
    const data = roll.data as RollData;
    if (data.roll[0] + data.roll[1] !== 7) continue;
    checked++;
    assert.deepEqual(data.raided, { p0: 7, p1: 6 }, "who was raided, and how many cards they lost");
    assert.deepEqual(Object.keys(data).sort(), ["raided", "roll"], "no word on what anyone lost");
    const raids = events.filter((e) => e.type === "raid");
    assert.deepEqual(raids.map((e) => e.only), [["p0"], ["p1"]]);
    for (const e of raids) {
      const id = e.only![0];
      const { lost, held } = e.data as RaidData;
      assert.equal(held, id === "p0" ? 15 : 12);
      assert.equal(cardCount(lost), Math.floor(held / 2));
      for (const other of s.players) if (other.id !== id) assert.equal(eventVisible(s, e, other.id), false, `${other.id} can't see ${id}'s losses`);
    }
    // p0 is between turns, so the raid is the only change to their purse.
    const p0Lost = (raids[0].data as RaidData).lost;
    for (const g of RESOURCES) assert.equal(before[0][g] - s.players[0].goods[g], p0Lost[g] ?? 0, g);
    // p1's turn starts right after: what the ogres took, then their harvest.
    const inc = events.find((e) => e.type === "income")!.data as IncomeData;
    const p1Lost = (raids[1].data as RaidData).lost;
    for (const g of RESOURCES) {
      const quarry = g === "stone" ? inc.quarried : 0;
      assert.equal(s.players[1].goods[g] - before[1][g], (inc.harvest[g] ?? 0) + quarry - (p1Lost[g] ?? 0), g);
    }
    // What each viewer's dice pop-up is built from: their own losses and nobody else's.
    const seen = (pid: string) => events.filter((e) => eventVisible(s, e, pid));
    assert.deepEqual(rollShow(seen("p0"), null, "p0")!.raid, raids[0].data);
    assert.deepEqual(rollShow(seen("p1"), "p1", "p1")!.raid, raids[1].data);
    assert.equal(rollShow(seen("p2"), null, "p2")!.raid, null);
    assert.deepEqual(rollShow(seen("p2"), null, "p2")!.raided, { p0: 7, p1: 6 });
  }
  assert.ok(checked >= 3, `checked ${checked} raids`);
});

test("dice replays: a gain from a region you can't see comes from the fog, not from a region", () => {
  const { s } = newGame(2, 11);
  const [a, b] = s.players;
  assert.ok(!visibleRegions(s, a.id).has(b.capital), "b's capital is in a's fog");
  s.regions[a.capital].token = 8;
  s.regions[b.capital].token = 8;
  const res = (id: string) => REGION_BY_ID.get(id)!.resource;
  const event: GameEvent = {
    seq: 40,
    turn: 3,
    round: 2,
    actor: b.id,
    type: "roll",
    text: "🎲 Kird 1 rolled 8. Harvest: Kird 0 1 🍚, Kird 1 1 🪨.",
    regions: [a.capital, b.capital],
    public: true,
    data: { roll: [5, 3], got: { [a.id]: { [res(a.capital)]: 1 }, [b.id]: { [res(b.capital)]: 1 } } } satisfies RollData,
  };
  const view = viewFor(s, a.id);
  assert.equal(view.regions.find((r) => r.id === b.capital)!.owner, undefined, "the view doesn't say who holds it");
  assert.deepEqual(payouts(rollShow([event], null, a.id)!, view), [
    { player: a.id, resource: res(a.capital), region: a.capital },
    { player: b.id, resource: res(b.capital), region: null },
  ]);
  // Rolls from before the dice carried their data still show, from their text.
  const old = rollShow([{ ...event, data: { roll: [5, 3] } }], null, a.id)!;
  assert.equal(old.got, null);
  assert.deepEqual(old.lines, ["Harvest: Kird 0 1 🍚, Kird 1 1 🪨."]);
  assert.deepEqual(payouts(old, view), []);
});

import { computeThrow, makeEnv, mulberry32, randomQuat, restingValues } from "../components/dice/tray";

test("dice physics: a seed throws the same tumble every time, and it lands on the server's numbers", () => {
  const env = makeEnv({ bounds: { minX: -9, maxX: 9, minZ: -4.8, maxZ: 4.8 }, dieSize: 0.85, surface: "wood" });
  for (let seed = 1; seed <= 40; seed++) {
    const values = [1 + (seed % 6), 1 + ((seed * 5) % 6)];
    const rng = mulberry32(seed);
    const starts = [-0.7, 0.7].map((x) => ({ p: [x, 2.3, 3.6] as [number, number, number], q: randomQuat(rng), size: 0.85 }));
    const input = { values, seed, velocity: { x: (rng() - 0.5) * 5, y: 4, z: -10 }, spin: 18 };
    const unturned: [number, number, number, number][] = [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ];
    const throwIt = () => computeThrow(env, input, starts, unturned);
    const record = throwIt();
    assert.deepEqual(throwIt(), record, `seed ${seed}: replays tumble the same way`);
    assert.deepEqual(restingValues(record), values, `seed ${seed}: lands on the roll`);
  }
});
