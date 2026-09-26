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

test("starts: every Kird lands with a gondola line to a soft neighbour, and can win a battle on turn one", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { s } = newGame(4, seed);
    for (const p of s.players) {
      const lines = Object.entries(s.lines).filter(([, l]) => l.owner === p.id);
      assert.equal(lines.length, 1, `${p.name} has one starter line (seed ${seed})`);
      const target = lineEnds(lines[0][0]).find((e) => e !== p.capital)!;
      assert.ok(lineUsable(s, p.id, p.capital, target));
      assert.ok(unitTotal(s.regions[target].units) <= 3, `soft target (seed ${seed}: ${unitTotal(s.regions[target].units)})`);
    }
  }
});

test("victory: the first Kird to reach the goal wins, and nothing moves after", () => {
  const s = newWorld(9, NOW, 3);
  addPlayer(s, "a", "A");
  addPlayer(s, "b", "B");
  const free = Object.values(s.regions).filter((r) => !r.owner).slice(0, 2);
  for (const r of free) {
    r.owner = "a";
    r.native = null;
  }
  // Any action triggers the check.
  const events = applyAction(s, "a", { type: "buy", good: "rice", count: 1 }, NOW);
  assert.equal(s.winner, "a");
  assert.ok(events.some((e) => e.type === "victory" && e.public));
  assert.throws(() => applyAction(s, "a", { type: "endTurn" }, NOW), /over/);
  assert.equal(viewFor(s, "b").winner, "a");
  assert.equal(viewFor(s, "b").goal, 3);
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

test("advisor: on turn one it points at the starter gondola's invasion, which really does win", () => {
  let wins = 0;
  let total = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = newGame(1, seed);
    const me = s.players[0];
    const tips = advise(viewFor(s, me.id));
    const attack = tips.find((t) => t.plan);
    assert.ok(attack, `seed ${seed}: ${tips.map((t) => t.title).join(" | ")}`);
    // Do what it says with everything it planned to send.
    const from = s.regions[attack!.plan!.from];
    const send = { ...from.units };
    send.panda -= 1;
    const events = applyAction(s, me.id, { type: "move", from: from.id, to: attack!.plan!.to, units: send }, NOW);
    total++;
    if (s.regions[attack!.plan!.to].owner === me.id) wins++;
    assert.ok(events.length > 0);
  }
  assert.ok(wins / total >= 0.8, `advised attacks won ${wins}/${total}`);
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
  const target = lineEnds(Object.keys(s.lines)[0]).find((e) => e !== me.capital)!;
  const send = { ...s.regions[me.capital].units };
  const events = applyAction(s, me.id, { type: "move", from: me.capital, to: target, units: send }, NOW);
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
