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
  unitTotal,
  viewFor,
  visibleRegions,
  type Action,
  type GameEvent,
  type GameState,
} from "./engine";
import { NEIGHBORS, REGIONS, lineEnds, lineId } from "./regions";
import { BUILDING_TYPES, EXCHANGE, GOODS, HERO_IDS, RESOURCES, UNIT_TYPES } from "./rules";

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

// ---------------------------------------------------------------- fuzz

function randomAction(s: GameState, rnd: () => number): Action {
  const me = activePlayer(s);
  const mine = ownedRegions(s, me.id);
  const pickFrom = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const others = s.players.filter((p) => p.id !== me.id);
  const region = mine.length ? pickFrom(mine).id : REGIONS[0].id;
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
  if (roll < 0.66) return { type: "bankTrade", give: pickFrom(RESOURCES), get: pickFrom(RESOURCES) };
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
