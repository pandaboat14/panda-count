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
  nameKey,
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
  if (roll < 0.98) return { type: "rename", region, name: pickFrom(FUZZ_NAMES) };
  if (roll < 0.995 && s.trials?.length) {
    const guilty = rnd() < 0.6;
    return { type: "vote", trial: pickFrom(s.trials).id, guilty, ...(guilty ? { sanction: pickFrom(SANCTION_LIST) } : {}) };
  }
  return { type: "endTurn" };
}

// Good names, bad names, real names and near-duplicates.
const FUZZ_NAMES = ["Pandaland", "Fort Bamboo", "  Bao   Town ", "Kirdistan", "pandaland!", "x", "Texas", "Sichuan", "🐼🐼", "A".repeat(30)];

import { SANCTIONS as SANCTION_LIST } from "./rules";

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
  // Only a conqueror who still holds a region may rename it; names on the map are tidy and never clash,
  // and a renamed region's old name stays reserved for it.
  const taken = new Map<string, string>();
  for (const d of REGIONS) {
    const r = s.regions[d.id];
    if (r.conqueror !== undefined) assert.equal(r.conqueror, r.owner, `${r.id}'s conqueror holds it`);
    if (r.name !== undefined) {
      assert.notEqual(r.name, d.name, `${r.id} forgets a new name rather than storing its real one`);
      assert.ok(r.name === r.name.trim() && [...r.name].length >= 2 && [...r.name].length <= 24, `"${r.name}" is tidy`);
    }
    for (const n of r.name ? [r.name, d.name] : [d.name]) {
      const k = nameKey(n);
      assert.ok((taken.get(k) ?? d.id) === d.id, `"${n}" clashes with ${taken.get(k)}`);
      taken.set(k, d.id);
    }
  }
  // The Tribunal: one trial per accused, only real jurors vote, guilty votes carry a punishment, sentences run down.
  const trials = s.trials ?? [];
  assert.equal(new Set(trials.map((t) => t.accused)).size, trials.length, "one trial per accused");
  for (const t of trials) {
    assert.ok(ids.has(t.accused), "the accused is still in the world");
    assert.ok(t.charges.length > 0, "a trial has charges");
    assert.equal(t.votes[t.accused], undefined, "nobody votes in their own trial");
    for (const [voter, v] of Object.entries(t.votes)) {
      assert.ok(ids.has(voter), "only Kirds in the world vote");
      if (v.guilty) assert.ok(SANCTION_LIST.includes(v.sanction!), "a guilty vote names a punishment");
    }
  }
  for (const p of s.players) {
    if (p.sentence) assert.ok(p.sentence.turnsLeft > 0 && p.sentence.sanctions.length > 0, `${p.name} serves a real sentence`);
    for (const c of p.crimes ?? []) assert.ok(c.points === 1 || c.points === 2);
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
  let renamed = 0;
  const tribunal = { vote: 0, verdict: 0, pardon: 0 };
  for (const [seed, players] of [[1, 2], [2, 3], [3, 4], [4, 6], [5, 8], [6, 1]] as const) {
    const { s, events } = newGame(players, seed);
    const rnd = lcg(seed * 7919);
    for (let step = 0; step < 4000; step++) {
      // Late joiners are welcome in a never-ending game.
      if (step === 1500 && s.players.length < 8) events.push(...addPlayer(s, "late", "Late Kird"));
      // …and Kirds sometimes leave.
      if (step === 2500 && s.players.length > 1) events.push(...removePlayer(s, s.players[Math.floor(rnd() * s.players.length)].id, NOW));
      // Random armies rarely go on a rampage, so now and then someone is put on trial and someone else is
      // one attack from it: that way juries, verdicts and sentences all meet random play.
      if (step % 250 === 125 && s.players.length >= 3) {
        const [accused, primed, victim] = [...s.players].sort(() => rnd() - 0.5);
        if (!s.trials!.some((t) => t.accused === accused.id)) {
          const charge = { round: s.round, victim: victim.id, region: victim.capital, kind: "invasion" as const, points: 2 };
          s.trials!.push({ id: `fuzz${step}`, accused: accused.id, openedRound: s.round, charges: [charge], votes: {} });
        }
        primed.crimes = Array.from({ length: TRIAL_AT - 1 }, () => ({ round: s.round, victim: victim.id, region: victim.capital, kind: "invasion" as const, points: 1 }));
      }
      const a = randomAction(s, rnd);
      // Juries vote on anyone's turn, so half the ballots come from someone other than the active Kird.
      const actor = rnd() < (a.type === "vote" ? 0.5 : 0.02) ? s.players[Math.floor(rnd() * s.players.length)].id : activePlayer(s).id;
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
    renamed += events.filter((e) => e.type === "rename").length;
    // Every player can always load their view, and event filtering never throws.
    for (const p of s.players) {
      viewFor(s, p.id);
      events.forEach((e) => eventVisible(s, e, p.id));
    }
    for (const e of events) if (e.type in tribunal) tribunal[e.type as keyof typeof tribunal]++;
  }
  assert.ok(applied > 5000, `applied ${applied}, rejected ${rejected}`);
  assert.ok(renamed > 10, `conquerors renamed ${renamed} regions`);
  // Juries vote, trials reach verdicts, and sentences get served.
  assert.ok(tribunal.vote > 0 && tribunal.verdict > 0 && tribunal.pardon > 0, JSON.stringify(tribunal));
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
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = newGame(1, seed);
    const me = s.players[0];
    const first = advise(viewFor(s, me.id));
    const line = first.find((t) => t.action?.type === "gondola");
    assert.ok(line, `seed ${seed}: ${first.map((t) => t.title).join(" | ")}`);
    applyAction(s, me.id, line!.action!, NOW);
    const attack = advise(viewFor(s, me.id)).find((t) => t.plan);
    assert.ok(attack, `seed ${seed}: an invasion is suggested once the line is up`);
    const from = s.regions[attack!.plan!.from];
    const send = { ...from.units };
    send.panda -= 1;
    applyAction(s, me.id, { type: "move", from: from.id, to: attack!.plan!.to, units: send }, NOW);
    total++;
    if (s.regions[attack!.plan!.to].owner === me.id) wins++;
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
  assert.match(botReply("medium", "vote not guilty at my war crimes trial?", r), /Justice/, "war crimes talk isn't a threat");
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

// ---------------------------------------------------------------- names

import { checkRegionName, regionName, type BattleData } from "./engine";

// Kird 0 rides into an empty neighbour and claims it.
function conquest(seed = 3) {
  const { s } = newGame(2, seed);
  const [a, b] = s.players;
  const from = a.capital;
  const to = NEIGHBORS.get(from)!.find((n) => !s.regions[n].owner)!;
  Object.assign(s.regions[to], { units: emptyUnits(), native: null });
  s.lines[lineId(from, to)] = { owner: a.id, builtTurn: 0 };
  applyAction(s, a.id, { type: "move", from, to, units: { panda: 1 } }, NOW);
  assert.equal(s.regions[to].owner, a.id);
  return { s, a, b, to };
}

test("names: conquerors rename what they take, and everyone sees the new name", () => {
  const { s, a, b, to } = conquest();
  const old = REGION_BY_ID.get(to)!.name;
  const [e] = applyAction(s, a.id, { type: "rename", region: to, name: "  Fort   Bamboo " }, NOW);
  assert.equal(s.regions[to].name, "Fort Bamboo");
  assert.equal(e.text, `🚩 Kird 0 renamed ${old} to Fort Bamboo.`);
  assert.ok(eventVisible(s, e, b.id), "renaming is public news");
  // The name shows through the fog, but only the conqueror may change it.
  const seen = [a.id, b.id].map((id) => viewFor(s, id).regions.find((r) => r.id === to)!);
  assert.deepEqual(seen.map((r) => [r.fog, r.name, r.renamable]), [[false, "Fort Bamboo", true], [true, "Fort Bamboo", undefined]]);
  // Everything that happens there from now on uses the new name…
  Object.assign(s.players[0].goods, { bamboo: 5, rice: 5 });
  const [recruit] = applyAction(s, a.id, { type: "recruit", region: to, unit: "panda", count: 1 }, NOW);
  assert.match(recruit.text, /in Fort Bamboo\.$/);
  // …until the old name is given back.
  const [back] = applyAction(s, a.id, { type: "rename", region: to, name: old }, NOW);
  assert.equal(s.regions[to].name, undefined);
  assert.equal(back.text, `🚩 Kird 0 gave Fort Bamboo back its old name, ${old}.`);
});

test("names: only a conqueror renames, only while they hold it, and only on their turn", () => {
  const { s, a, b, to } = conquest();
  assert.throws(() => applyAction(s, a.id, { type: "rename", region: a.capital, name: "Homeland" }, NOW), /conquerors/, "land you were given wasn't conquered");
  assert.throws(() => applyAction(s, b.id, { type: "rename", region: to, name: "Mine Now" }, NOW), /turn/);
  applyAction(s, a.id, { type: "endTurn" }, NOW);
  assert.throws(() => applyAction(s, b.id, { type: "rename", region: to, name: "Mine Now" }, NOW), /hold/);
});

test("names: tidy, sensible, and never another region's name, now or once", () => {
  const { s, a, to } = conquest();
  const rename = (name: unknown) => applyAction(s, a.id, { type: "rename", region: to, name } as Action, NOW);
  assert.throws(() => rename("x"), /at least 2/);
  assert.throws(() => rename("x".repeat(25)), /up to 24/);
  assert.throws(() => rename("!!"), /letter or number/);
  assert.throws(() => rename(42), GameError);
  const other = REGIONS.find((r) => r.id !== to)!;
  assert.throws(() => rename(` ${other.name.toUpperCase()}!`), /already on the map/, "capitals and punctuation don't make a new name");
  // Invisible and right-to-left characters can't disguise a name.
  rename("Pan\u202Eda\u200Bland");
  assert.equal(s.regions[to].name, "Pandaland");
  assert.throws(() => rename("Pandaland"), /already called/);
  // A renamed region's real name stays taken, so nobody can pose as it.
  s.regions[other.id].name = "Kirdistan";
  assert.throws(() => rename(other.name), /once called/);
  assert.throws(() => rename("KIRDISTAN"), /Kirdistan is already on the map/);
  assert.equal(s.regions[to].name, "Pandaland", "failed renames change nothing");
  // The rename box runs the very same check.
  assert.deepEqual(checkRegionName(to, "  Bao  Town ", (id) => regionName(s, id)), { name: "Bao Town" });
});

test("names: a name outlasts its namer, and the right to rename passes to whoever takes it next", () => {
  const { s, b, to } = conquest();
  applyAction(s, s.players[0].id, { type: "rename", region: to, name: "Pandaland" }, NOW);
  applyAction(s, s.players[0].id, { type: "endTurn" }, NOW);
  const from = NEIGHBORS.get(to)!.find((n) => s.regions[n].owner !== s.players[0].id)!;
  Object.assign(s.regions[from], { owner: b.id, native: null, units: { ...emptyUnits(), cam: 12 }, tired: emptyUnits() });
  s.lines[lineId(from, to)] = { owner: b.id, builtTurn: 0 };
  const fight = applyAction(s, b.id, { type: "move", from, to, units: { cam: 12 } }, NOW).find((e) => e.type === "battle")!;
  assert.equal((fight.data as unknown as BattleData).place, "Pandaland", "the battle remembers what the place was called");
  assert.equal(s.regions[to].owner, b.id);
  assert.equal(s.regions[to].name, "Pandaland", "a new owner keeps the name until they change it");
  applyAction(s, b.id, { type: "rename", region: to, name: "Bo's Bay" }, NOW);
  assert.equal(s.regions[to].name, "Bo's Bay");
  // When a conqueror leaves, their land goes wild but its name stays on the map.
  removePlayer(s, b.id, NOW);
  assert.equal(s.regions[to].name, "Bo's Bay");
  assert.equal(s.regions[to].conqueror, undefined);
});

test("names: in games from before renaming, any region you hold except your home counts as conquered", () => {
  const { s } = newGame(2, 3);
  const [a] = s.players;
  const old = NEIGHBORS.get(a.capital)!.find((n) => !s.regions[n].owner)!;
  // An old save: a region taken long ago, with no record of who took it.
  Object.assign(s.regions[old], { owner: a.id, native: null });
  assert.equal(s.regions[old].conqueror, undefined);
  const view = viewFor(s, a.id);
  assert.equal(view.regions.find((r) => r.id === old)!.renamable, true);
  assert.equal(view.regions.find((r) => r.id === a.capital)!.renamable, undefined);
  applyAction(s, a.id, { type: "rename", region: old, name: "Old Conquest" }, NOW);
  assert.equal(s.regions[old].name, "Old Conquest");
  assert.throws(() => applyAction(s, a.id, { type: "rename", region: a.capital, name: "Homeland" }, NOW), /conquerors/);
});

test("names: land your autopilot conquers while you're away is yours to rename when you're back", () => {
  const s = newWorld(31, NOW);
  addPlayer(s, "taylor", "Taylor");
  addPlayer(s, "alex", "Alex");
  applyAction(s, "alex", { type: "autopilot", on: true, level: "hard" }, NOW);
  const taken = () => ownedRegions(s, "alex").find((r) => r.conqueror === "alex");
  for (let round = 0; round < 40 && !taken(); round++) {
    applyAction(s, "taylor", { type: "endTurn" }, NOW);
    runBots(s, NOW);
  }
  const won = taken();
  assert.ok(won, "autopilot conquered something");
  applyAction(s, "alex", { type: "autopilot", on: false }, NOW);
  applyAction(s, "taylor", { type: "endTurn" }, NOW);
  assert.equal(activePlayer(s).id, "alex", "back in command, it's Alex's turn");
  assert.equal(viewFor(s, "alex").regions.find((r) => r.id === won.id)!.renamable, true);
  applyAction(s, "alex", { type: "rename", region: won.id, name: "Alexandria" }, NOW);
  assert.equal(s.regions[won.id].name, "Alexandria");
});

// ---------------------------------------------------------------- war crimes

import { bloodthirst, grudgeAgainst, sanctioned, trialFor } from "./engine";
import { SANCTIONS, TRIAL_AT, type Sanction } from "./rules";

// Hands `attacker` a big rested army next to a fresh region held by `owner` (or by wild pandas when null),
// joined by the attacker's own gondola line.
function stage(s: GameState, attacker: string, owner: string | null, defenders: Partial<Record<(typeof UNIT_TYPES)[number], number>> = {}) {
  for (const r of Object.values(s.regions)) {
    if (r.owner) continue;
    const n = NEIGHBORS.get(r.id)!.find((x) => !s.regions[x].owner);
    if (!n) continue;
    Object.assign(r, { owner: attacker, native: null, units: { ...emptyUnits(), cam: 20 }, tired: emptyUnits() });
    Object.assign(s.regions[n], { owner, native: owner ? null : "wild", units: { ...emptyUnits(), ...defenders }, tired: emptyUnits() });
    s.lines[lineId(r.id, n)] = { owner: attacker, builtTurn: 0 };
    return { from: r.id, to: n };
  }
  throw new Error("no room left to stage an attack");
}

// `attacker` (made the active Kird if need be) invades a fresh region of `owner`'s with one CAM.
function strike(s: GameState, attacker: string, owner: string | null, defenders?: Partial<Record<(typeof UNIT_TYPES)[number], number>>) {
  s.activeSeat = s.players.find((p) => p.id === attacker)!.seat;
  const { from, to } = stage(s, attacker, owner, defenders);
  return applyAction(s, attacker, { type: "move", from, to, units: { cam: 1 } }, NOW);
}

function give(s: GameState, pid: string, n: number) {
  for (const r of Object.values(s.regions).filter((x) => !x.owner).slice(-n)) Object.assign(r, { owner: pid, native: null });
}

const P = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const endTurns = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) applyAction(s, activePlayer(s).id, { type: "endTurn" }, NOW);
};
// Plays turns until it's `id`'s turn again.
const untilTurnOf = (s: GameState, id: string) => {
  do endTurns(s, 1);
  while (activePlayer(s).id !== id);
};

test("war crimes: attacking other Kirds builds Bloodthirst, picking on the small counts double, natives never count", () => {
  const { s } = newGame(3);
  strike(s, "p0", null, { panda: 1 });
  assert.equal(bloodthirst(P(s, "p0"), s.round), 0, "invading natives is no crime");
  const events = strike(s, "p0", "p1");
  assert.equal(bloodthirst(P(s, "p0"), s.round), 1);
  assert.match(events.find((e) => e.type === "capture")!.text, /🩸\+1/);
  // p1 now holds less than half as many regions as p0: picking on them counts double.
  give(s, "p0", 6);
  strike(s, "p0", "p1");
  assert.equal(bloodthirst(P(s, "p0"), s.round), 3);
  assert.equal(viewFor(s, "p2").players.find((p) => p.id === "p0")!.bloodthirst, 3, "everyone can see it");
  assert.deepEqual(viewFor(s, "p0").players.find((p) => p.id === "p0")!.crimes!.map((c) => c.points), [1, 2]);
  assert.equal(viewFor(s, "p2").players.find((p) => p.id === "p0")!.crimes, undefined, "the details are yours alone");
});

test("war crimes: an eye for an eye, stopping the Kird about to win and hitting a war criminal are no crime", () => {
  const { s } = newGame(4);
  // p1 attacks p0 once, so p0 may strike back once for free.
  strike(s, "p1", "p0");
  assert.equal(bloodthirst(P(s, "p1"), s.round), 1);
  const back = strike(s, "p0", "p1");
  assert.doesNotMatch(back.find((e) => e.type === "capture")!.text, /🩸/);
  assert.equal(bloodthirst(P(s, "p0"), s.round), 0);
  // Escalating past that counts, and every attack earns the victim a strike back of their own.
  strike(s, "p0", "p1");
  assert.equal(bloodthirst(P(s, "p0"), s.round), 1);
  assert.equal(grudgeAgainst(P(s, "p1"), "p0", s.round), 2);
  assert.equal(grudgeAgainst(P(s, "p0"), "p1", s.round), 0, "p0 used up theirs");
  // p2 is one round from winning.
  s.goal = 10;
  give(s, "p2", 12);
  s.threat = "p2";
  strike(s, "p0", "p2");
  // p3 is a convicted war criminal.
  P(s, "p3").sentence = { sanctions: ["arms"], turnsLeft: 2 };
  strike(s, "p0", "p3");
  assert.equal(bloodthirst(P(s, "p0"), s.round), 1, "neither of those counted");
  assert.equal(grudgeAgainst(P(s, "p3"), "p0", s.round), 1, "even an excused attack can be answered");
  // Grudges fade with the three-round window. (First call off the race, or p2 would simply win.)
  s.goal = null;
  s.threat = null;
  s.activeSeat = 0;
  endTurns(s, 4 * 3);
  assert.equal(grudgeAgainst(P(s, "p1"), "p0", s.round), 0);
  assert.deepEqual(viewFor(s, "p1").players.find((p) => p.id === "p1")!.grudges, {});
});

test("war crimes: Bloodthirst cools off after three rounds", () => {
  const { s } = newGame(3);
  strike(s, "p0", "p1");
  s.activeSeat = 0;
  endTurns(s, 3 * 2); // to the start of round 3
  assert.equal(s.round, 3);
  assert.equal(bloodthirst(P(s, "p0"), s.round), 1, "still counts in round 3");
  endTurns(s, 3);
  assert.equal(bloodthirst(P(s, "p0"), s.round), 0, "forgotten in round 4");
  assert.equal(P(s, "p0").crimes!.length, 0, "and pruned from the save");
});

// p0 goes on a rampage against p1 (who is big enough that nothing counts double) until the Tribunal steps in.
function rampage(players: number) {
  const { s } = newGame(players);
  give(s, "p1", 8);
  const events: GameEvent[] = [];
  for (let i = 0; i < TRIAL_AT; i++) events.push(...strike(s, "p0", "p1"));
  s.activeSeat = 0;
  return { s, events };
}

test("war crimes: at the threshold the Tribunal opens a trial, and the jury votes in secret, even out of turn", () => {
  const { s, events } = rampage(4);
  const opened = events.filter((e) => e.type === "trial");
  assert.equal(opened.length, 1);
  assert.ok(opened[0].public);
  assert.match(opened[0].text, /on trial/);
  const trial = trialFor(s, "p0")!;
  assert.equal(trial.charges.length, TRIAL_AT);
  // Attacks during the trial are added to the charges, not a second trial.
  strike(s, "p0", "p1");
  assert.equal(s.trials!.length, 1);
  assert.equal(trialFor(s, "p0")!.charges.length, TRIAL_AT + 1);

  const id = trial.id;
  assert.throws(() => applyAction(s, "p0", { type: "vote", trial: id, guilty: false }, NOW), /own trial/);
  assert.throws(() => applyAction(s, "p1", { type: "vote", trial: id, guilty: true }, NOW), /punishment/);
  assert.throws(() => applyAction(s, "p1", { type: "vote", trial: "nope", guilty: false }, NOW), /over/);
  // p0 is the active Kird, but the jury votes whenever it likes.
  assert.equal(activePlayer(s).id, "p0");
  const vote = applyAction(s, "p1", { type: "vote", trial: id, guilty: true, sanction: "ceasefire" }, NOW);
  assert.deepEqual(vote.map((e) => e.only), [["p1"]], "only the voter hears about their vote");
  applyAction(s, "p2", { type: "vote", trial: id, guilty: false }, NOW);
  applyAction(s, "p2", { type: "vote", trial: id, guilty: true, sanction: "arms" }, NOW);

  const seen = viewFor(s, "p3").trials[0];
  assert.deepEqual(seen.voters.sort(), ["p1", "p2"]);
  assert.equal(seen.myVote, null);
  assert.equal(JSON.stringify(viewFor(s, "p3")).includes("ceasefire"), false, "nobody else's ballot leaks");
  assert.deepEqual(viewFor(s, "p2").trials[0].myVote, { guilty: true, sanction: "arms" }, "you can change your vote");
  assert.equal(viewFor(s, "p0").trials[0].myVote, null);

  // p3 never votes. The verdict comes when p0's next turn starts.
  endTurns(s, 1);
  assert.ok(trialFor(s, "p0"), "still open while the jury is out");
  const verdict = (() => {
    const out: GameEvent[] = [];
    while (activePlayer(s).id !== "p0") out.push(...applyAction(s, activePlayer(s).id, { type: "endTurn" }, NOW));
    return out.find((e) => e.type === "verdict")!;
  })();
  assert.ok(verdict.public);
  assert.equal(verdict.actor, null, "the Tribunal speaks, so the accused sees it in their replay too");
  assert.match(verdict.text, /GUILTY, 2 to 0/);
  assert.equal(trialFor(s, "p0"), undefined);
  assert.deepEqual(P(s, "p0").sentence, { sanctions: ["ceasefire", "arms"], turnsLeft: 3 });
  assert.equal(P(s, "p0").convictions, 1);
  assert.equal(bloodthirst(P(s, "p0"), s.round), 0, "the verdict wipes the slate");
  assert.deepEqual(viewFor(s, "p3").players.find((p) => p.id === "p0")!.sentence, { sanctions: ["ceasefire", "arms"], turnsLeft: 3 });
});

test("war crimes: a split jury or an empty one acquits, and either way the slate is wiped", () => {
  const split = rampage(3);
  const id = trialFor(split.s, "p0")!.id;
  applyAction(split.s, "p1", { type: "vote", trial: id, guilty: true, sanction: "trade" }, NOW);
  applyAction(split.s, "p2", { type: "vote", trial: id, guilty: false }, NOW);
  const out: GameEvent[] = [];
  do out.push(...applyAction(split.s, activePlayer(split.s).id, { type: "endTurn" }, NOW));
  while (activePlayer(split.s).id !== "p0");
  assert.match(out.find((e) => e.type === "verdict")!.text, /NOT GUILTY: the jury split 1 to 1/);
  assert.equal(P(split.s, "p0").sentence ?? null, null);
  assert.equal(bloodthirst(P(split.s, "p0"), split.s.round), 0);

  const empty = rampage(3);
  const out2: GameEvent[] = [];
  do out2.push(...applyAction(empty.s, activePlayer(empty.s).id, { type: "endTurn" }, NOW));
  while (activePlayer(empty.s).id !== "p0");
  assert.match(out2.find((e) => e.type === "verdict")!.text, /Nobody voted/);
  assert.equal(P(empty.s, "p0").convictions, 0);
});

test("war crimes: once the whole jury has voted the verdict comes at once, but never in the middle of the accused's turn", () => {
  const { s } = rampage(3);
  const id = trialFor(s, "p0")!.id;
  applyAction(s, "p1", { type: "vote", trial: id, guilty: true, sanction: "gondolas" }, NOW);
  applyAction(s, "p2", { type: "vote", trial: id, guilty: true, sanction: "gondolas" }, NOW);
  assert.ok(trialFor(s, "p0"), "p0 is still mid-turn");
  const out = applyAction(s, "p0", { type: "endTurn" }, NOW);
  assert.match(out.find((e) => e.type === "verdict")!.text, /GUILTY, 2 to 0/);
  // The sentence covers p0's next three turns in full.
  assert.deepEqual(P(s, "p0").sentence, { sanctions: ["gondolas"], turnsLeft: 3 });

  // Out of turn, the last juror's vote brings the verdict straight away.
  const other = rampage(3);
  const tid = trialFor(other.s, "p0")!.id;
  endTurns(other.s, 1); // now it's p1's turn
  applyAction(other.s, "p2", { type: "vote", trial: tid, guilty: false }, NOW);
  const last = applyAction(other.s, "p1", { type: "vote", trial: tid, guilty: false }, NOW);
  assert.match(last.find((e) => e.type === "verdict")!.text, /NOT GUILTY, 2 to 0/);
});

// A convicted p0 serving `sanctions`, with everyone rested and plenty to spend.
function convicted(sanctions: Sanction[]) {
  const { s } = newGame(3);
  const me = P(s, "p0");
  me.sentence = { sanctions, turnsLeft: 3 };
  me.convictions = 1;
  for (const g of GOODS) me.goods[g] = 50;
  P(s, "p1").goods.coin = 50;
  return s;
}

test("war crimes: each punishment takes away exactly what it says", () => {
  const cap = (s: GameState) => P(s, "p0").capital;
  // Ceasefire: no invading or thundering Kirds, but the natives are fair game.
  let s = convicted(["ceasefire"]);
  assert.throws(() => strike(s, "p0", "p1"), /Ceasefire/);
  strike(s, "p0", null);
  s.heroes.casey = { owner: "p0", region: cap(s), movedTurn: 0 };
  const near = NEIGHBORS.get(cap(s))!.find((n) => !s.regions[n].owner)!;
  Object.assign(s.regions[near], { owner: "p1", native: null });
  assert.throws(() => applyAction(s, "p0", { type: "thunder", target: near }, NOW), /Ceasefire/);

  // Arms embargo: no recruiting or arming.
  s = convicted(["arms"]);
  assert.throws(() => applyAction(s, "p0", { type: "recruit", region: cap(s), unit: "panda", count: 1 }, NOW), /Arms embargo/);
  assert.throws(() => applyAction(s, "p0", { type: "arm", region: cap(s), count: 1 }, NOW), /Arms embargo/);
  strike(s, "p0", "p1"); // but they can still fight

  // Gondola ban.
  s = convicted(["gondolas"]);
  assert.throws(() => applyAction(s, "p0", { type: "gondola", from: cap(s), to: NEIGHBORS.get(cap(s))![0] }, NOW), /Gondola ban/);
  applyAction(s, "p0", { type: "recruit", region: cap(s), unit: "panda", count: 1 }, NOW);

  // Trade sanctions: no Bank, and nobody trades with them either way.
  s = convicted(["trade"]);
  assert.throws(() => applyAction(s, "p0", { type: "buy", good: "iron", count: 1 }, NOW), /Trade sanctions/);
  assert.throws(() => applyAction(s, "p0", { type: "bankTrade", give: "bamboo", get: "iron" }, NOW), /Trade sanctions/);
  assert.throws(() => applyAction(s, "p0", { type: "exchange", from: "coin", to: "pandaCoin" }, NOW), /Trade sanctions/);
  assert.throws(() => applyAction(s, "p0", { type: "offerTrade", to: "p1", give: { bamboo: 1 }, get: {} }, NOW), /Trade sanctions/);
  s.activeSeat = 1;
  assert.throws(() => applyAction(s, "p1", { type: "offerTrade", to: "p0", give: { coin: 1 }, get: {} }, NOW), /nobody can trade with Kird 0/);
  applyAction(s, "p1", { type: "offerPact", to: "p0" }, NOW); // diplomacy is still open

  // Heroes on strike: no hero bonus, no Thunder, no pickpocketing, no new heroes.
  s = convicted(["heroes"]);
  s.heroes.casey = { owner: "p0", region: cap(s), movedTurn: 0 };
  assert.throws(() => applyAction(s, "p0", { type: "thunder", target: NEIGHBORS.get(cap(s))![0] }, NOW), /Casey won't throw thunder/);
  assert.throws(() => applyAction(s, "p0", { type: "recruitHero", hero: "ping", region: cap(s) }, NOW), /no hero will sign up/);
  s.heroes.josserkid = { owner: "p0", region: cap(s), movedTurn: 0 };
  assert.throws(() => applyAction(s, "p0", { type: "pickpocket", target: "p1" }, NOW), /pick pockets/);
  const { from, to } = stage(s, "p0", "p1", { panda: 3 });
  s.heroes.casey.region = from;
  const fight = applyAction(s, "p0", { type: "move", from, to, units: { cam: 5 } }, NOW).find((e) => e.type === "battle")!;
  assert.equal((fight.data as unknown as import("./engine").BattleData).atkBonus, 0, "Casey sat that one out");
});

test("war crimes: a sentence runs for the criminal's turns, then the sanctions lift", () => {
  const s = convicted(["arms"]);
  const log: GameEvent[] = [];
  for (let served = 1; served <= 3; served++) {
    assert.ok(sanctioned(P(s, "p0"), "arms"), `still serving before turn ${served} ends`);
    log.push(...applyAction(s, "p0", { type: "endTurn" }, NOW));
    while (activePlayer(s).id !== "p0") log.push(...applyAction(s, activePlayer(s).id, { type: "endTurn" }, NOW));
  }
  assert.equal(P(s, "p0").sentence, null);
  assert.ok(log.some((e) => e.type === "pardon" && e.public));
  applyAction(s, "p0", { type: "recruit", region: P(s, "p0").capital, unit: "panda", count: 1 }, NOW);
});

test("war crimes: repeat offenders serve longer, and punishments stack on a sentence still being served", () => {
  const { s } = rampage(3);
  const me = P(s, "p0");
  me.convictions = 2;
  me.sentence = { sanctions: ["trade"], turnsLeft: 2 }; // one turn is served as this one ends
  const id = trialFor(s, "p0")!.id;
  s.offers.push({ id: "o99", kind: "trade", from: "p1", to: "p0", give: { coin: 1 }, get: {}, turn: s.turn });
  applyAction(s, "p1", { type: "vote", trial: id, guilty: true, sanction: "ceasefire" }, NOW);
  applyAction(s, "p2", { type: "vote", trial: id, guilty: true, sanction: "ceasefire" }, NOW);
  applyAction(s, "p0", { type: "endTurn" }, NOW);
  assert.deepEqual(P(s, "p0").sentence, { sanctions: ["ceasefire", "trade"], turnsLeft: 3 + 2 * 2 });
  assert.equal(P(s, "p0").convictions, 3);
  assert.equal(s.offers.length, 0, "open trades with a sanctioned Kird are called off");
});

test("war crimes: it takes three Kirds to hold a trial", () => {
  const { s } = newGame(2);
  for (let i = 0; i < TRIAL_AT + 2; i++) strike(s, "p0", "p1");
  assert.ok(bloodthirst(P(s, "p0"), s.round) >= TRIAL_AT);
  assert.equal(s.trials!.length, 0);
});

test("war crimes: leaving drops your trial and tears up your votes", () => {
  const { s } = rampage(4);
  const id = trialFor(s, "p0")!.id;
  applyAction(s, "p1", { type: "vote", trial: id, guilty: true, sanction: "arms" }, NOW);
  removePlayer(s, "p1", NOW);
  assert.deepEqual(trialFor(s, "p0")!.votes, {});
  removePlayer(s, "p0", NOW);
  assert.equal(s.trials!.length, 0);
});

test("war crimes: worlds saved before the Tribunal existed carry on", () => {
  const { s } = newGame(3);
  delete s.trials;
  for (const p of s.players) {
    delete p.crimes;
    delete p.grudges;
    delete p.sentence;
    delete p.convictions;
  }
  const old = JSON.parse(JSON.stringify(s)) as GameState;
  for (const p of old.players) viewFor(old, p.id);
  give(old, "p1", 8);
  for (let i = 0; i < TRIAL_AT; i++) strike(old, "p0", "p1");
  assert.ok(trialFor(old, "p0"), "a trial opens in an old world too");
  applyAction(old, "p1", { type: "vote", trial: trialFor(old, "p0")!.id, guilty: true, sanction: SANCTIONS[0] }, NOW);
  untilTurnOf(old, "p0");
  assert.equal(P(old, "p0").convictions, 1);
});

// ---------------------------------------------------------------- the Tribunal and computer players

// A world with a person ("human") and the given seats, each a computer player at `level` or a person when null.
function tribunalWorld(seed: number, seats: [string, "easy" | "medium" | "hard" | null][]) {
  const s = newWorld(seed, NOW);
  addPlayer(s, "human", "Taylor");
  for (const [id, level] of seats) addPlayer(s, id, id, level ?? undefined);
  return s;
}

test("bots: computer jurors vote in every trial, and victims want a Ceasefire", () => {
  const s = tribunalWorld(11, [["robo", "medium"], ["bao", "hard"]]);
  give(s, "robo", 8);
  for (let i = 0; i < TRIAL_AT; i++) strike(s, "human", "robo");
  s.activeSeat = 0;
  const events = applyAction(s, "human", { type: "endTurn" }, NOW);
  events.push(...runBots(s, NOW));
  const ballots = events.filter((e) => e.type === "vote");
  assert.deepEqual(ballots.map((e) => e.only), [["robo"], ["bao"]], "each juror voted once, in secret");
  const verdict = events.find((e) => e.type === "verdict")!;
  assert.ok(verdict, "the whole jury voted, so the verdict came straight away");
  assert.match(verdict.text, /GUILTY, 2 to 0/);
  assert.ok(P(s, "human").sentence!.sanctions.includes("ceasefire"), "the victim asked for a Ceasefire");
  assert.equal(activePlayer(s).id, "human");
});

test("bots: a generous enough trade buys a hard juror's vote", () => {
  const verdictWith = (bribe: boolean) => {
    const s = tribunalWorld(12, [["robo", "medium"], ["bao", "hard"]]);
    give(s, "robo", 8);
    for (let i = 0; i < TRIAL_AT; i++) strike(s, "human", "robo");
    s.activeSeat = 0;
    P(s, "human").goods.camCoin = 3;
    if (bribe) applyAction(s, "human", { type: "offerTrade", to: "bao", give: { camCoin: 3 }, get: {} }, NOW);
    const events = applyAction(s, "human", { type: "endTurn" }, NOW);
    events.push(...runBots(s, NOW));
    return events.find((e) => e.type === "vote" && e.only?.[0] === "bao")!.text;
  };
  assert.match(verdictWith(false), /voted GUILTY/, "hard bots are tough on people");
  assert.match(verdictWith(true), /voted NOT GUILTY/, "…until the price is right");
});

test("bots: hard bots count the jury before they cross the line, medium bots don't bother", () => {
  // `robo` is one point from trial (for past attacks on Taylor), with a big army next to a lone region of Taylor's
  // and nothing else to hit. Do they attack?
  const attacks = (level: "medium" | "hard", jurors: "people" | "machines") => {
    const juror = jurors === "people" ? null : ("hard" as const);
    const s = tribunalWorld(13, [["robo", level], ["j1", juror], ["j2", juror]]);
    const home = P(s, "robo").capital;
    const target = NEIGHBORS.get(home)!.find((n) => !s.regions[n].owner)!;
    for (const n of NEIGHBORS.get(home)!) if (n !== target) Object.assign(s.regions[n], { owner: "robo", native: null, units: emptyUnits(), tired: emptyUnits() });
    Object.assign(s.regions[target], { owner: "human", native: null, units: { ...emptyUnits(), panda: 1 }, tired: emptyUnits() });
    Object.assign(s.regions[home], { units: { ...emptyUnits(), cam: 12 }, tired: emptyUnits() });
    s.lines[lineId(home, target)] = { owner: "robo", builtTurn: 0 };
    P(s, "robo").crimes = Array.from({ length: TRIAL_AT - 1 }, () => ({ round: s.round, victim: "human", region: target, kind: "invasion" as const, points: 1 }));
    s.activeSeat = P(s, "robo").seat;
    playBotTurn(s, NOW);
    return Boolean(trialFor(s, "robo"));
  };
  assert.equal(attacks("hard", "people"), false, "people would convict, so the hard bot holds back");
  assert.equal(attacks("hard", "machines"), true, "fellow machines would acquit, so it strikes");
  assert.equal(attacks("medium", "people"), true, "medium bots are too hot-headed to care");
});

test("bots: a convicted bot serves its sentence, and a bot on trial sends a human juror a gift", () => {
  const s = tribunalWorld(14, [["robo", "hard"], ["bao", "medium"]]);
  const robo = P(s, "robo");
  robo.sentence = { sanctions: [...SANCTION_LIST], turnsLeft: 3 };
  for (const g of GOODS) robo.goods[g] = 30;
  s.heroes.casey = { owner: "robo", region: robo.capital, movedTurn: 0 };
  const events: GameEvent[] = [];
  for (let round = 0; round < 4; round++) {
    events.push(...applyAction(s, "human", { type: "endTurn" }, NOW));
    events.push(...runBots(s, NOW));
  }
  const served = events.findIndex((e) => e.type === "pardon");
  assert.ok(served > 0, "the sentence ran out");
  const during = events.slice(0, served).filter((e) => e.actor === "robo");
  for (const banned of ["recruit", "arm", "gondola", "bank", "thunder", "pickpocket", "hero"]) {
    assert.ok(!during.some((e) => e.type === banned), `no ${banned} while sanctioned`);
  }
  assert.ok(!during.some((e) => (e.type === "battle" || e.type === "capture") && e.public), "no attacks on Kirds under a Ceasefire");

  // On trial, a cunning bot tries to sweeten the one person on the jury.
  const t = tribunalWorld(15, [["robo", "hard"], ["bao", "medium"]]);
  const rival = P(t, "robo");
  rival.goods.bamboo = 9;
  t.trials!.push({ id: "t1", accused: "robo", openedRound: t.round, charges: [{ round: t.round, victim: "bao", region: rival.capital, kind: "invasion", points: 2 }], votes: {} });
  t.activeSeat = rival.seat;
  playBotTurn(t, NOW);
  assert.ok(
    t.offers.some((o) => o.kind === "trade" && o.from === "robo" && o.to === "human" && !Object.keys(o.get).length),
    "a gift for the human juror",
  );
});

test("bots: in long computer games the Tribunal sits, convicts and acquits, and the world never breaks", () => {
  const outcome = { trial: 0, guilty: 0, acquitted: 0 };
  for (const seed of [1, 2, 3]) {
    const s = createGame(seed * 977, NOW);
    const events: GameEvent[] = [];
    events.push(...addPlayer(s, "human", "Taylor"));
    (["easy", "medium", "hard", "hard"] as const).forEach((l, i) => events.push(...addPlayer(s, `bot${i}`, `Bot ${i}`, l)));
    for (let round = 0; round < 70; round++) {
      events.push(...applyAction(s, "human", { type: "endTurn" }, NOW));
      events.push(...runBots(s, NOW));
      checkInvariants(s, events);
    }
    for (const e of events) {
      if (e.type === "trial") outcome.trial++;
      if (e.type === "verdict") outcome[(e.data as { guilty: boolean }).guilty ? "guilty" : "acquitted"]++;
    }
  }
  assert.ok(outcome.trial >= 3 && outcome.guilty >= 1 && outcome.acquitted >= 1, JSON.stringify(outcome));
});

// ---------------------------------------------------------------- the Tribunal in each player's view

import { attackCost } from "./tribunal";

test("tribunal view: the Bloodthirst preview always matches what the engine books", () => {
  const { s } = newGame(4, 31);
  const pairs = [["p0", "p1"], ["p1", "p0"], ["p0", "p1"], ["p0", "p1"], ["p2", "p3"], ["p0", "p2"], ["p0", "p3"], ["p0", "p1"], ["p3", "p0"], ["p0", "p3"], ["p0", "p2"]];
  let doubles = 0;
  for (const [i, [a, v]] of pairs.entries()) {
    if (i === 5) give(s, "p0", 7); // from here on, p0 towers over everyone
    s.activeSeat = P(s, a).seat;
    const { from, to } = stage(s, a, v);
    const cost = attackCost(viewFor(s, a), v)!;
    const before = bloodthirst(P(s, a), s.round);
    const events = applyAction(s, a, { type: "move", from, to, units: { cam: 1 } }, NOW);
    assert.equal(bloodthirst(P(s, a), s.round) - before, cost.points, `${a} → ${v}: points`);
    assert.equal(events.some((e) => e.type === "trial"), cost.trial, `${a} → ${v}: trial`);
    if (cost.points === 2) doubles++;
  }
  assert.ok(doubles > 0, "some attacks picked on the small");
  assert.ok(trialFor(s, "p0"), "and p0 ended up on trial");
});

test("advisor and army: Sun Tzu knows about the Tribunal, and a Ceasefire makes a neighbour harmless", () => {
  const { s } = newGame(3, 8);
  // A trial with p0 on the jury: Sun Tzu reminds them to vote.
  s.trials!.push({ id: "tx", accused: "p1", openedRound: 1, charges: [{ round: 1, victim: "p0", region: P(s, "p0").capital, kind: "invasion", points: 2 }], votes: {} });
  assert.ok(advise(viewFor(s, "p0")).some((t) => t.id === "vote-tx" && t.tab === "diplomacy"));
  // Under an arms embargo and a gondola ban he stops suggesting what can't be done.
  assert.ok(advise(viewFor(s, "p0")).some((t) => t.action?.type === "gondola"), "normally the first line is suggested");
  P(s, "p0").sentence = { sanctions: ["arms", "gondolas"], turnsLeft: 2 };
  for (const t of advise(viewFor(s, "p0"))) assert.ok(t.action?.type !== "recruit" && t.action?.type !== "gondola", t.title);
  P(s, "p0").sentence = null;

  // One attack from a trial, an easy fight is still suggested, but flagged and explained.
  const { to } = stage(s, "p0", "p1");
  P(s, "p0").crimes = Array.from({ length: TRIAL_AT - 1 }, () => ({ round: s.round, victim: "p2", region: to, kind: "invasion" as const, points: 1 }));
  const warned = advise(viewFor(s, "p0")).find((t) => t.plan?.to === to)!;
  assert.ok(warned.warCrime && /on trial/.test(warned.detail!), JSON.stringify(warned));

  // A big army next door is a danger, unless its owner is under a Ceasefire.
  const home = P(s, "p0").capital;
  const n = NEIGHBORS.get(home)!.find((x) => !s.regions[x].owner)!;
  Object.assign(s.regions[n], { owner: "p2", native: null, units: { ...emptyUnits(), nacam: 9, cam: 3 } });
  s.regions[home].units = { ...emptyUnits(), panda: 1 };
  const danger = () => regionReports(viewFor(s, "p0")).find((r) => r.region.id === home)!.danger;
  assert.equal(danger()?.owner, "p2");
  P(s, "p2").sentence = { sanctions: ["ceasefire"], turnsLeft: 2 };
  assert.equal(danger(), null);
});

test("autopilot: a person on autopilot sits on juries too, and the recap says how it voted", () => {
  const s = tribunalWorld(16, [["alex", null], ["robo", "hard"]]);
  applyAction(s, "alex", { type: "autopilot", on: true, level: "medium" }, NOW);
  s.trials!.push({ id: "t9", accused: "robo", openedRound: s.round, charges: [{ round: s.round, victim: "alex", region: P(s, "alex").capital, kind: "invasion", points: 2 }], votes: {} });
  const events = applyAction(s, "human", { type: "endTurn" }, NOW);
  events.push(...runBots(s, NOW));
  assert.ok(events.some((e) => e.type === "vote" && e.only?.[0] === "alex"), "the autopilot voted");
  const recap = events.find((e) => e.type === "autopilotRecap" && e.only?.[0] === "alex")!;
  assert.match(recap.text, /voted GUILTY in robo's war crimes trial/, "the victim's autopilot wants justice, and says so");
  assert.ok(events.some((e) => e.type === "verdict"), "the verdict came when Robo's turn began");
});
