import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  activePlayer,
  addPlayer,
  applyAction,
  battle,
  createGame,
  emptyUnits,
  eventVisible,
  removePlayer,
  unitTotal,
  upgradeState,
  viewFor,
  type Action,
  type BattleData,
  type BattleDataV2,
  type GameEvent,
  type GameState,
  type Units,
} from "./engine";
import { battleRecord } from "./army";
import { battleScript, canReplay } from "./battleScript";
import { runBots } from "./bot";
import { attackOdds } from "./odds";
import { NEIGHBORS, REGION_BY_ID, lineId } from "./regions";
import { DEFAULT_ITEM_BUDGET, GEAR_BATTLES, UNIT_TYPES } from "./rules";
import { ITEMS, RULES } from "./battle/codex";
import * as BE from "./battle/engine";
import { compactEvent } from "./battle/record";
import type { ItemId, WeaponId } from "./battle/types";

const NOW = 1_800_000_000_000;
const RICH = { bamboo: 20, stone: 20, iron: 20, rice: 20, gems: 20, coin: 60, pandaCoin: 20, camCoin: 20 };

// Ana (seat 0, and it's her turn) next to a region of Bo's, with a gondola line between them. Cy watches.
function duel(seed: number, atk: Partial<Units>, def: Partial<Units>) {
  const s = createGame(seed, NOW);
  addPlayer(s, "a", "Ana");
  addPlayer(s, "b", "Bo");
  addPlayer(s, "c", "Cy");
  const from = s.players[0].capital;
  const to = NEIGHBORS.get(from)!.find((n) => !s.regions[n].owner)!;
  rearm(s, from, to, atk, def);
  return { s, from, to };
}
// Puts the armies back for another invasion.
function rearm(s: GameState, from: string, to: string, atk: Partial<Units>, def: Partial<Units>) {
  Object.assign(s.regions[to], { owner: "b", native: null, units: { ...emptyUnits(), ...def }, tired: emptyUnits(), buildings: [] });
  Object.assign(s.regions[from], { owner: "a", native: null, units: { ...emptyUnits(), ...atk }, tired: emptyUnits() });
  s.lines[lineId(from, to)] = { owner: "a", builtTurn: 0 };
}
const act = (s: GameState, who: string, a: Action, now = NOW) => applyAction(s, who, a, now);
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const battleEvent = (evs: GameEvent[]) => evs.find((e) => e.type === "battle")!;
const dataOf = (e: GameEvent) => e.data as unknown as BattleDataV2;
const invade = (s: GameState, from: string, to: string, units: Partial<Units>) => act(s, "a", { type: "move", from, to, units });
const KO = (s: GameState, side: "atk" | "def") => {
  for (const q of s.battle!.b.sides[side].squads) if (q.hero) Object.assign(q, { hp: 0, count: 0 });
};

// ---------------------------------------------------------------- opening a battle

test("battles: a person's invasion opens a battle, and nothing else happens until it's over", () => {
  const { s, from, to } = duel(3, { panda: 3, nacam: 2 }, { panda: 2, armedPanda: 1 });
  s.heroes.ping = { owner: "a", region: from, movedTurn: 0 };
  s.heroes.cockpenis = { owner: "b", region: to, movedTurn: 0 };
  s.regions[to].buildings = ["fort"];
  s.modifiers.push({ kind: "mercMarket", untilRound: s.round });
  const events = invade(s, from, to, { panda: 3, nacam: 2 });
  assert.deepEqual(events, [], "no events until it ends");
  const lb = s.battle!;
  assert.ok(lb);
  assert.equal(lb.attacker, "a");
  assert.equal(lb.defender, "b");
  assert.deepEqual(s.regions[from].units, emptyUnits(), "the attackers left home");
  assert.deepEqual(s.regions[to].units, { ...emptyUnits(), panda: 2, armedPanda: 1 }, "the defenders stand until it ends");
  const b = lb.b;
  assert.deepEqual(
    b.sides.atk.squads.map((q) => [q.kind, q.count]),
    [["panda", 3], ["nacam", 2], ["ping", 1]],
    "units by type, then heroes from the home region",
  );
  assert.deepEqual(b.sides.def.squads.map((q) => [q.kind, q.count]), [["panda", 2], ["armedPanda", 1], ["cockpenis", 1]]);
  assert.equal(b.terrain, REGION_BY_ID.get(to)!.resource);
  assert.deepEqual(b.buildings, ["fort"]);
  assert.deepEqual(b.events, ["mercMarket"]);
  assert.equal(b.place, REGION_BY_ID.get(to)!.name);
  assert.equal(b.sides.def.doctrine, "counter");
  assert.equal(b.sides.def.budget, DEFAULT_ITEM_BUDGET);
  // One battle at a time, and nothing else while it's on.
  assert.throws(() => act(s, "a", { type: "build", region: from, building: "market" }), /Finish the battle/);
  assert.throws(() => invade(s, from, to, { panda: 1 }), /Finish the battle/);
  assert.throws(() => act(s, "b", { type: "battleAuto" }), /turn/);
  // It lives in the game state as plain JSON, and only the attacker sees it.
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
  assert.ok(viewFor(s, "a").battle);
  assert.equal(viewFor(s, "b").battle, null);
  assert.equal(viewFor(s, "c").battle, null);
});

test("battles: empty regions are still taken unopposed, and natives fight by their nation's doctrine", () => {
  const { s, from, to } = duel(4, { panda: 3 }, {});
  const evs = invade(s, from, to, { panda: 2 });
  assert.equal(s.battle, null);
  assert.ok(evs.some((e) => e.type === "capture"));
  assert.equal(s.regions[to].owner, "a");

  const w = duel(5, { panda: 3 }, {});
  Object.assign(w.s.regions[w.to], { owner: null, native: "nacams", units: { ...emptyUnits(), nacam: 3 } });
  invade(w.s, w.from, w.to, { panda: 3 });
  const side = w.s.battle!.b.sides.def;
  assert.equal(side.native, "nacams");
  assert.equal(side.doctrine, "berserk");
  assert.deepEqual(side.bag, {});
  assert.equal(w.s.battle!.defender, null);
  assert.equal(w.s.battle!.defenderName, "the NACAM Ogre Nation");
});

// ---------------------------------------------------------------- rounds

test("battles: a round waits for the attacker's reaction only when there's one to offer", () => {
  const { s, from, to } = duel(5, { panda: 6 }, { panda: 6 });
  player(s, "a").bag = { luckyGem: 2 };
  invade(s, from, to, { panda: 6 });
  act(s, "a", { type: "battleRound", action: { kind: "move", id: "bellyBump" } });
  const P = s.battle!.b.pending!;
  assert.ok(P && !P.done, "the dice are out and the round waits");
  const roll = P.events.find((e) => e.t === "roll")!;
  assert.equal(typeof roll.seed, "number", "every throw has its physics seed");
  assert.throws(() => act(s, "a", { type: "battleRound", action: { kind: "move", id: "bellyBump" } }), /Finish this round/);
  assert.throws(() => act(s, "a", { type: "battleReact", id: "luckyGem", die: 9 }), /Pick one of your dice/);
  assert.throws(() => act(s, "a", { type: "battleReact", id: "blessing" }), /can't do that/);
  act(s, "a", { type: "battleReact", id: "luckyGem", die: 0 });
  const reroll = s.battle!.b.pending!.events.find((e) => e.t === "reroll")!;
  assert.equal(typeof reroll.seed, "number");
  assert.notEqual(reroll.seed, roll.seed);
  assert.equal(player(s, "a").bag!.luckyGem, 1, "the Lucky Gem came out of the Bag");
  assert.throws(() => act(s, "a", { type: "battleReact", id: "luckyGem", die: 0 }), /can't do that/, "one reaction a round");
  act(s, "a", { type: "battleResolve" });
  const b = s.battle!.b;
  assert.equal(b.pending, null);
  assert.equal(b.log.length, 1);
  assert.ok(b.log[0].events.some((e) => e.t === "pairs"));
  assert.throws(() => act(s, "a", { type: "battleResolve" }), /no round/);

  // Nothing to react with: the round is fought out in one request.
  const q = duel(6, { panda: 6 }, { panda: 6 });
  invade(q.s, q.from, q.to, { panda: 6 });
  act(q.s, "a", { type: "battleRound", action: { kind: "move", id: "bellyBump" } });
  assert.equal(q.s.battle!.b.pending, null);
  assert.equal(q.s.battle!.b.log.length, 1);
});

test("battles: only moves the squad can make right now are accepted, and a refused round changes nothing", () => {
  const { s, from, to } = duel(7, { panda: 6 }, { panda: 6 });
  invade(s, from, to, { panda: 6 });
  const before = JSON.stringify(s);
  const bad: unknown[] = [
    { kind: "move", id: "pandaPileOn" }, // needs 5 Momentum
    { kind: "move", id: "stormHammer" }, // not a panda's move
    { kind: "move", id: "noSuchMove" },
    { kind: "item", id: "riceBall" }, // not in the Bag
    { kind: "switch", to: 3 },
    { kind: "fly" },
    null,
  ];
  for (const action of bad) assert.throws(() => act(s, "a", { type: "battleRound", action } as Action), /./);
  assert.throws(() => act(s, "a", { type: "battleRound", action: { kind: "move", id: "bellyBump" }, prep: "whetstone" }), /bag/);
  assert.equal(JSON.stringify(s), before);
});

test("battles: winning takes the region; survivors and heroes march in, and every loss lands on the map", () => {
  const { s, from, to } = duel(7, { cam: 8, panda: 1 }, { panda: 2 });
  s.heroes.casey = { owner: "a", region: from, movedTurn: 0 };
  invade(s, from, to, { cam: 8 });
  const e = battleEvent(act(s, "a", { type: "battleAuto" }));
  const d = dataOf(e);
  assert.equal(d.v, 2);
  assert.equal(d.how, "won");
  assert.equal(d.won, true);
  assert.equal(s.battle, null);
  assert.equal(s.regions[to].owner, "a");
  assert.deepEqual(s.regions[to].units, { ...emptyUnits(), cam: 8 - (d.attackerLost.cam ?? 0) });
  assert.deepEqual(s.regions[to].tired, s.regions[to].units, "they rode in this turn");
  assert.deepEqual(s.regions[from].units, { ...emptyUnits(), panda: 1 }, "the one who stayed home is still home");
  assert.equal(d.defenderLost.panda, 2);
  assert.deepEqual(s.heroes.casey, { owner: "a", region: to, movedTurn: s.turn }, "Casey marched in");
});

test("battles: defenders who hold keep their survivors; attackers who fall are gone", () => {
  const { s, from, to } = duel(9, { panda: 1 }, { armedPanda: 6 });
  invade(s, from, to, { panda: 1 });
  const d = dataOf(battleEvent(act(s, "a", { type: "battleAuto" })));
  assert.equal(d.how, "held");
  assert.equal(s.regions[to].owner, "b");
  assert.deepEqual(s.regions[to].units, { ...emptyUnits(), armedPanda: 6 - (d.defenderLost.armedPanda ?? 0) });
  assert.deepEqual(s.regions[from].units, emptyUnits());
  assert.equal(d.attackerLost.panda, 1);
});

test("battles: a retreat brings the survivors home, tired, after the parting shot", () => {
  const { s, from, to } = duel(11, { panda: 5 }, { armedPanda: 5 });
  invade(s, from, to, { panda: 5 });
  const e = battleEvent(act(s, "a", { type: "battleRound", action: { kind: "retreat" } }));
  const d = dataOf(e);
  assert.equal(d.how, "retreat");
  const shot = d.log[0].events.find((x) => x.t === "roll")!;
  assert.ok(shot.t === "roll" && shot.atk.length === 0 && shot.def.length === RULES.retreatShot.dice, "the parting shot");
  assert.equal(typeof shot.seed, "number");
  const home = 5 - (d.attackerLost.panda ?? 0);
  assert.equal(s.regions[from].units.panda, home);
  assert.equal(s.regions[from].tired.panda, home, "home, and tired");
  assert.equal(s.regions[to].owner, "b");
  assert.equal(s.regions[to].units.armedPanda, 5);
});

test("battles: at round 20 the invasion stalls and the attackers go home", () => {
  const { s, from, to } = duel(13, { panda: 9 }, { panda: 9 });
  invade(s, from, to, { panda: 9 });
  s.battle!.b.round = RULES.roundLimit - 1; // skip ahead: it's plain data
  const d = dataOf(battleEvent(act(s, "a", { type: "battleRound", action: { kind: "move", id: "rolyPoly" } })));
  assert.equal(d.how, "stalled");
  assert.equal(d.rounds, RULES.roundLimit);
  assert.equal(s.regions[from].units.panda, 9 - (d.attackerLost.panda ?? 0));
  assert.equal(s.regions[to].units.panda, 9 - (d.defenderLost.panda ?? 0));
  assert.equal(s.regions[to].owner, "b");
});

// ---------------------------------------------------------------- heroes

test("battles: knocked-out heroes flee to the Hall, and Casey goes to the Kird who beat him", () => {
  // Ana wins: Bo's Casey is captured with the region, Ana's own Ping flees.
  {
    const { s, from, to } = duel(15, { cam: 9 }, { panda: 1 });
    s.heroes.ping = { owner: "a", region: from, movedTurn: 0 };
    s.heroes.casey = { owner: "b", region: to, movedTurn: 0 };
    invade(s, from, to, { cam: 9 });
    KO(s, "atk");
    KO(s, "def");
    const evs = act(s, "a", { type: "battleAuto" });
    assert.equal(dataOf(battleEvent(evs)).how, "won");
    assert.equal(s.heroes.casey.owner, "a");
    assert.equal(s.heroes.casey.region, to);
    assert.deepEqual([s.heroes.ping.owner, s.heroes.ping.region], [null, null]);
    assert.ok(evs.some((e) => e.type === "heroCaptured" && e.actor === "a"));
    assert.ok(evs.some((e) => e.type === "heroFled" && (e.data as { hero: string }).hero === "ping"));
  }
  // Bo holds: Ana's Casey is captured by Bo, Bo's own Ping flees.
  {
    const { s, from, to } = duel(17, { panda: 1 }, { armedPanda: 8 });
    s.heroes.casey = { owner: "a", region: from, movedTurn: 0 };
    s.heroes.ping = { owner: "b", region: to, movedTurn: 0 };
    invade(s, from, to, { panda: 1 });
    KO(s, "atk");
    KO(s, "def");
    const evs = act(s, "a", { type: "battleAuto" });
    assert.equal(dataOf(battleEvent(evs)).how, "held");
    assert.equal(s.heroes.casey.owner, "b");
    assert.equal(s.heroes.casey.region, to);
    assert.equal(s.heroes.ping.owner, null);
    assert.ok(evs.some((e) => e.type === "heroCaptured" && e.actor === "b"));
  }
  // Natives can't take Casey: he flees like anyone else.
  {
    const { s, from, to } = duel(19, { panda: 1 }, {});
    Object.assign(s.regions[to], { owner: null, native: "nacams", units: { ...emptyUnits(), nacam: 6 } });
    s.heroes.casey = { owner: "a", region: from, movedTurn: 0 };
    invade(s, from, to, { panda: 1 });
    KO(s, "atk");
    act(s, "a", { type: "battleAuto" });
    assert.deepEqual([s.heroes.casey.owner, s.heroes.casey.region], [null, null]);
  }
  // Heroes who stay standing on a failed invasion stay home.
  {
    const { s, from, to } = duel(21, { panda: 1 }, { armedPanda: 9 });
    s.heroes.josserkid = { owner: "a", region: from, movedTurn: 0 };
    invade(s, from, to, { panda: 1 });
    act(s, "a", { type: "battleRound", action: { kind: "retreat" } });
    assert.equal(s.heroes.josserkid.owner, "a");
    assert.equal(s.heroes.josserkid.region, from);
  }
});

// ---------------------------------------------------------------- the turn moves on

test("battles: ending the turn, a skip, autopilot or leaving has Sun Tzu finish the battle first", () => {
  // End of turn.
  {
    const { s, from, to } = duel(23, { panda: 4 }, { panda: 2 });
    invade(s, from, to, { panda: 4 });
    const evs = act(s, "a", { type: "endTurn" });
    const i = evs.findIndex((e) => e.type === "battle");
    const j = evs.findIndex((e) => e.type === "endTurn");
    assert.ok(i >= 0 && i < j, "the battle ends before the turn does");
    assert.equal(s.battle, null);
    assert.equal(activePlayer(s).id, "b");
  }
  // The host skips a Kird who left a battle open for 12 hours.
  {
    const { s, from, to } = duel(25, { panda: 1 }, { panda: 5 });
    act(s, "a", { type: "endTurn" });
    s.lines[lineId(from, to)] = { owner: "b", builtTurn: 0 };
    act(s, "b", { type: "move", from: to, to: from, units: { panda: 5 } });
    assert.equal(s.battle!.attacker, "b");
    const evs = act(s, "a", { type: "skipTurn" }, NOW + 13 * 3600 * 1000);
    assert.ok(evs.some((e) => e.type === "battle" && e.actor === "b"));
    assert.equal(s.battle, null);
    assert.equal(activePlayer(s).id, "c");
  }
  // Switching on autopilot mid-battle.
  {
    const { s, from, to } = duel(27, { panda: 4 }, { panda: 2 });
    invade(s, from, to, { panda: 4 });
    const evs = act(s, "a", { type: "autopilot", on: true, level: "easy" });
    assert.ok(evs.some((e) => e.type === "battle"));
    assert.equal(s.battle, null);
    assert.equal(player(s, "a").autopilot, "easy");
  }
  // The attacker leaves the game: the battle is settled, then the land goes wild.
  {
    const { s, from, to } = duel(29, { cam: 6 }, { panda: 1 });
    invade(s, from, to, { cam: 6 });
    const evs = removePlayer(s, "a", NOW);
    assert.ok(evs.findIndex((e) => e.type === "battle") < evs.findIndex((e) => e.type === "leave"));
    assert.equal(s.battle, null);
    assert.equal(s.regions[to].owner, null, "what Ana won went wild with the rest of her land");
  }
  // The defender leaves.
  {
    const { s, from, to } = duel(31, { panda: 3 }, { panda: 3 });
    invade(s, from, to, { panda: 3 });
    const evs = removePlayer(s, "b", NOW);
    assert.ok(evs.some((e) => e.type === "battle"));
    assert.equal(s.battle, null);
  }
});

test("battles: computer players and Kirds on autopilot fight their invasions out at once", () => {
  // Autopilot: the move itself resolves the battle.
  const { s, from, to } = duel(33, { cam: 6 }, { panda: 2 });
  player(s, "a").autopilot = "hard";
  const evs = invade(s, from, to, { cam: 6 });
  assert.equal(s.battle, null);
  const d = dataOf(battleEvent(evs));
  assert.equal(d.v, 2);
  assert.ok(d.log.length >= 1);

  // Bots: every battle is a v2 record and none stays open.
  const g = createGame(8, NOW);
  addPlayer(g, "human", "Taylor");
  (["easy", "medium", "hard"] as const).forEach((l, i) => addPlayer(g, `bot${i}`, `Bot ${i}`, l));
  const fights: GameEvent[] = [];
  for (let round = 0; round < 25; round++) {
    act(g, "human", { type: "endTurn" });
    fights.push(...runBots(g, NOW).filter((e) => e.type === "battle"));
    assert.equal(g.battle, null);
  }
  assert.ok(fights.length > 3, `bots fought ${fights.length} battles`);
  for (const e of fights) {
    const x = dataOf(e);
    assert.equal(x.v, 2);
    assert.equal(x.log.length, x.rounds);
    assert.ok(x.log.every((r) => r.events.filter((q) => q.t === "roll").every((q) => typeof q.seed === "number")));
  }
});

// ---------------------------------------------------------------- the Bag, the Armory and Standing Orders

test("the Bag and the Armory: bought at the Bank, carried into battle, spent and worn out", () => {
  const { s, from, to } = duel(35, { panda: 4, nacam: 2 }, { panda: 1 });
  const a = player(s, "a");
  a.goods = { ...RICH };
  act(s, "a", { type: "buyItem", item: "riceBall", count: 3 });
  assert.equal(player(s, "a").bag!.riceBall, 3);
  assert.equal(player(s, "a").goods.rice, RICH.rice - 3 * ITEMS.riceBall.cost.rice!);
  assert.throws(() => act(s, "a", { type: "buyItem", item: "nope" as ItemId, count: 1 }), /doesn't sell/);
  assert.throws(() => act(s, "a", { type: "buyItem", item: "feast", count: 20 }), /afford/);
  assert.throws(() => act(s, "b", { type: "buyItem", item: "riceBall", count: 1 }), /turn/);

  act(s, "a", { type: "buyGear", item: "bambooSpear", unit: "panda" });
  act(s, "a", { type: "buyGear", item: "ironHelm", unit: "panda" });
  act(s, "a", { type: "buyGear", item: "sling", unit: "nacam" });
  act(s, "a", { type: "buyGear", item: "catapult" });
  assert.throws(() => act(s, "a", { type: "buyGear", item: "spikedClub", unit: "panda" }), /can't use/);
  assert.throws(() => act(s, "a", { type: "buyGear", item: "bambooSpear" }), /Pick who carries it/);
  assert.throws(() => act(s, "a", { type: "buyGear", item: "laser" as WeaponId, unit: "panda" }), /doesn't make/);
  assert.deepEqual(player(s, "a").armory, {
    units: { panda: { weapon: { id: "bambooSpear", charges: GEAR_BATTLES }, armor: { id: "ironHelm", charges: GEAR_BATTLES } }, nacam: { weapon: { id: "sling", charges: GEAR_BATTLES } } },
    army: { id: "catapult", charges: GEAR_BATTLES },
  });
  const coinBefore = player(s, "a").goods.coin;

  // Three invasions with pandas: each uses a charge of the pandas' gear and the catapult, never the ogres'.
  for (let n = 1; n <= GEAR_BATTLES; n++) {
    if (n > 1) rearm(s, from, to, { panda: 4, nacam: 2 }, { panda: 1 });
    invade(s, from, to, { panda: 4 });
    const b = s.battle!.b;
    assert.deepEqual(b.sides.atk.squads[0].gear, ["bambooSpear", "ironHelm"], "the squad carries its gear");
    assert.equal(b.sides.atk.catapult, true);
    assert.ok(BE.actionsFor(b, "atk").attack.some((m) => m.id === "skewer" && m.enabled), "the spear unlocks Skewer");
    if (n === 1) {
      assert.equal(b.sides.atk.bag.riceBall, 3, "the Bag rides along");
      act(s, "a", { type: "battleRound", action: { kind: "item", id: "riceBall" } });
      assert.equal(player(s, "a").bag!.riceBall, 2, "an item used in battle leaves the Bag");
    }
    act(s, "a", { type: "battleAuto" });
    const armory = player(s, "a").armory!;
    const left = GEAR_BATTLES - n;
    assert.equal(armory.units.panda?.weapon?.charges, left || undefined);
    assert.equal(armory.army?.charges, left || undefined);
    assert.equal(armory.units.nacam?.weapon?.charges, GEAR_BATTLES, "gear only wears in battles its unit type fights");
  }
  assert.equal(player(s, "a").armory!.units.panda, undefined, "after 3 battles it broke");
  assert.ok(player(s, "a").goods.coin <= coinBefore);

  // Moves' costs come out of the attacker's purse as the battle spends them.
  rearm(s, from, to, { panda: 4 }, { panda: 6 });
  invade(s, from, to, { panda: 4 });
  const bamboo = player(s, "a").goods.bamboo;
  act(s, "a", { type: "battleRound", action: { kind: "move", id: "bambooBarrage" } });
  assert.equal(player(s, "a").goods.bamboo, bamboo - 1);
});

test("Standing Orders: doctrine, lead squad, item budget and caltrops, given on your own turn", () => {
  const { s, from, to } = duel(37, { panda: 4 }, { panda: 3, armedPanda: 2 });
  act(s, "a", { type: "endTurn" });
  const bo = player(s, "b");
  bo.goods = { ...RICH };
  bo.bag = { luckyGem: 3, riceBall: 3 };
  assert.throws(() => act(s, "b", { type: "setOrders", region: from, doctrine: "turtle" }), /your own regions/);
  assert.throws(() => act(s, "b", { type: "setOrders", region: to, budget: 99 }), /budget/);
  assert.throws(() => act(s, "b", { type: "setOrders", region: to, doctrine: "berserk" as never }), /doctrines/);
  assert.throws(() => act(s, "b", { type: "setOrders", region: to, lead: "dragon" as never }), /meets the invaders/);
  act(s, "b", { type: "setOrders", region: to, doctrine: "turtle", lead: "armedPanda", budget: 2, traps: ["caltrops"] });
  assert.equal(player(s, "b").goods.stone, RICH.stone - 1, "caltrops are paid for up front");
  assert.equal(player(s, "b").goods.iron, RICH.iron - 1);
  const mine = viewFor(s, "b").regions.find((r) => r.id === to)!;
  assert.deepEqual(mine.orders, { doctrine: "turtle", doctrineSet: true, lead: "armedPanda", budget: 2, traps: ["caltrops"] });
  assert.equal(viewFor(s, "a").regions.find((r) => r.id === to)!.orders, undefined, "orders are secret");
  // The player-wide default doctrine.
  act(s, "b", { type: "setOrders", doctrine: "allin" });
  assert.equal(player(s, "b").doctrine, "allin");
  assert.equal(viewFor(s, "b").players.find((p) => p.id === "b")!.doctrine, "allin");
  act(s, "b", { type: "endTurn" });
  act(s, "c", { type: "endTurn" });

  // Ana invades: Bo's orders fight.
  invade(s, from, to, { panda: 4 });
  const b = s.battle!.b;
  assert.equal(b.sides.def.doctrine, "turtle");
  assert.equal(b.sides.def.squads[0].kind, "armedPanda", "the lead squad meets them first");
  assert.equal(b.sides.def.budget, 2);
  assert.ok(b.opening.some((e) => e.t === "damage" && e.source === "caltrops"), "the caltrops were waiting");
  assert.deepEqual(s.regions[to].orders!.traps, [], "and they're used up");
  act(s, "a", { type: "battleAuto" });
  const spent = 6 - ((player(s, "b").bag!.luckyGem ?? 0) + (player(s, "b").bag!.riceBall ?? 0));
  assert.ok(spent <= 2, `Bo's defenders spent ${spent} items`);

  // Laying caltrops from the Bag, and picking them back up.
  const c = duel(39, { panda: 1 }, { panda: 1 });
  const ana = player(c.s, "a");
  ana.bag = { caltrops: 1 };
  const goods = { ...ana.goods };
  act(c.s, "a", { type: "setOrders", region: c.from, traps: ["caltrops"] });
  assert.deepEqual(player(c.s, "a").bag, {}, "laid from the Bag");
  assert.deepEqual(player(c.s, "a").goods, goods, "nothing to pay");
  act(c.s, "a", { type: "setOrders", region: c.from, traps: [] });
  assert.equal(player(c.s, "a").bag!.caltrops, 1, "picked back up");
  assert.throws(() => act(c.s, "a", { type: "setOrders", region: c.from, traps: ["landmines" as never] }), /caltrops/);
});

// ---------------------------------------------------------------- what people see

test("battles: the attacker's view hides the dice to come and the defender's secrets", () => {
  const { s, from, to } = duel(41, { panda: 4 }, { panda: 3 });
  player(s, "a").bag = { whetstone: 1 };
  player(s, "b").bag = { luckyGem: 2, riceBall: 1 };
  player(s, "b").goods.gems = 7;
  invade(s, from, to, { panda: 4 });
  const view = viewFor(s, "a");
  const v = view.battle!;
  assert.equal(v.to, to);
  assert.equal(v.defenderName, "Bo");
  assert.deepEqual([v.b.seed, v.b.rng, v.b.aiRng, v.b.cfg.seed], [0, 0, 0, undefined], "no predicting the dice");
  assert.deepEqual(v.b.sides.def.bag, {});
  assert.equal(v.b.sides.def.goods.gems, 0);
  assert.equal(v.b.sides.def.budget, null);
  assert.deepEqual([v.b.cfg.def.bag, v.b.cfg.def.goods, v.b.cfg.def.budget], [undefined, undefined, undefined]);
  assert.deepEqual(v.b.sides.atk.bag, { whetstone: 1 }, "your own Bag is yours to see");
  assert.equal(s.battle!.b.sides.def.bag.luckyGem, 2, "the real battle still has them");
  // The client can run the engine on it.
  assert.ok(BE.actionsFor(v.b, "atk").attack.some((m) => m.enabled));
  const est = BE.preview(v.b, "atk", { kind: "move", id: "bellyBump" }, BE.mulberry(3));
  assert.ok(est.pAny >= 0 && est.pAny <= 1);
  // Your Bag, Armory and doctrine; nobody else's.
  const me = view.players.find((p) => p.id === "a")!;
  assert.deepEqual(me.bag, { whetstone: 1 });
  assert.deepEqual(me.armory, { units: {} });
  assert.equal(me.doctrine, "counter");
  assert.equal(view.players.find((p) => p.id === "b")!.bag, undefined);
  assert.equal(view.players.find((p) => p.id === "b")!.armory, undefined);
});

test("battles: the battle event keeps every legacy field, and a compact record anyone can re-enact", () => {
  const { s, from, to } = duel(43, { panda: 3, armedPanda: 2 }, { panda: 3, armedPanda: 1 });
  s.regions[to].buildings = ["fort"];
  invade(s, from, to, { panda: 3, armedPanda: 2 });
  const evs = act(s, "a", { type: "battleAuto" });
  const e = battleEvent(evs);
  const d = dataOf(e);
  const legacy: (keyof BattleData)[] = ["attacker", "attackerLost", "defenderStart", "defenderLost", "won", "rolls", "atkBonus", "defBonus", "defender", "defenderName", "from", "to"];
  for (const k of legacy) assert.ok(k in d, `legacy field ${k}`);
  assert.deepEqual(d.attacker, { ...emptyUnits(), panda: 3, armedPanda: 2 });
  assert.deepEqual(d.defenderStart, { ...emptyUnits(), panda: 3, armedPanda: 1 });
  assert.deepEqual([d.defender, d.defenderName, d.from, d.to, d.defBonus, d.atkBonus], ["b", "Bo", from, to, 1, 0]);
  assert.ok(d.rolls.length > 0 && d.rolls.every((r) => r.a.length > 0 && r.a.length === r.d.length), "rolls are each round's pairs");
  assert.equal(e.public, true);
  assert.deepEqual(e.regions, [from, to]);
  // The old BattleView can still play it, and never kills more than fell.
  assert.ok(canReplay(e));
  const { soldiers } = battleScript(d);
  for (const side of ["atk", "def"] as const) {
    const lost = side === "atk" ? d.attackerLost : d.defenderLost;
    for (const t of UNIT_TYPES) assert.equal(soldiers.filter((x) => x.side === side && x.type === t && x.diesAt !== null).length, lost[t], `${side} ${t}`);
  }
  // The record: the setup rebuilds the starting armies and the same opening; every round, every throw.
  assert.equal(d.log.length, d.rounds);
  for (const r of d.log) {
    assert.ok(r.actions.atk && r.actions.def);
    for (const x of r.events) if (x.t === "roll" || x.t === "reroll") assert.equal(typeof x.seed, "number");
  }
  assert.deepEqual(BE.createBattle(d.setup).opening.map(compactEvent), d.opening);
  assert.deepEqual([d.setup.seed, d.setup.atk.bag, d.setup.atk.goods, d.setup.def.bag, d.setup.def.goods, d.setup.def.budget], [undefined, undefined, undefined, undefined, undefined, undefined], "nobody's purse or Bag");
  assert.ok(d.summary.atk.spent && d.summary.def.spent, "the spending shows");
  assert.ok(JSON.stringify(d).length < 30000, `compact: ${JSON.stringify(d).length} bytes`);
  // The Army tab reads it from both sides.
  assert.equal(battleRecord(viewFor(s, "a"), evs)[0].role, "attack");
  assert.equal(battleRecord(viewFor(s, "b"), evs)[0].role, "defend");
  // Battles against natives are seen by whoever can see the place, as before.
  const w = duel(45, { cam: 5 }, {});
  Object.assign(w.s.regions[w.to], { owner: null, native: "wild", units: { ...emptyUnits(), panda: 1 } });
  invade(w.s, w.from, w.to, { cam: 5 });
  const we = battleEvent(act(w.s, "a", { type: "battleAuto" }));
  assert.equal(we.public, false);
  assert.equal(dataOf(we).defender, "wild");
  for (const p of w.s.players) eventVisible(w.s, we, p.id);
});

test("battles: a game frozen to JSON between every request plays on exactly the same", () => {
  const play = (freeze: boolean) => {
    let { s } = duel(47, { panda: 5, armedPanda: 3 }, { panda: 4, cam: 2 });
    const { from, to } = { from: s.players[0].capital, to: NEIGHBORS.get(s.players[0].capital)!.find((n) => s.regions[n].owner === "b")! };
    player(s, "a").bag = { luckyGem: 3, riceBall: 1 };
    player(s, "b").bag = { luckyGem: 2 };
    const events: GameEvent[] = [];
    const step = (a: Action) => {
      if (freeze) s = JSON.parse(JSON.stringify(s));
      events.push(...act(s, "a", a));
    };
    step({ type: "move", from, to, units: { panda: 5, armedPanda: 3 } });
    for (let i = 0; s.battle && i < 80; i++) {
      const b = s.battle.b;
      if (b.pending) step(i % 3 === 0 && BE.reactionsFor(b, "atk").length ? { type: "battleReact", id: "luckyGem", die: 0 } : { type: "battleResolve" });
      else {
        const move = BE.actionsFor(b, "atk").attack.find((m) => m.enabled);
        step(move ? { type: "battleRound", action: { kind: "move", id: move.id } } : { type: "battleAuto" });
      }
    }
    return JSON.stringify([s, events]);
  };
  assert.equal(play(true), play(false));
});

// ---------------------------------------------------------------- older games

test("battles: games saved before battles load with empty Bags, no gear, default orders and no battle", () => {
  const { s, from, to } = duel(49, { panda: 4 }, { panda: 2 });
  const old = JSON.parse(JSON.stringify(s)) as GameState;
  delete old.battle;
  for (const p of old.players) {
    delete p.bag;
    delete p.armory;
    delete p.doctrine;
  }
  // Read as it is...
  const v = viewFor(old, "a");
  assert.equal(v.battle, null);
  assert.deepEqual(v.players[0].bag, {});
  assert.deepEqual(v.players[0].armory, { units: {} });
  assert.equal(v.players[0].doctrine, "counter");
  assert.deepEqual(v.regions.find((r) => r.id === from)!.orders, { doctrine: "counter", doctrineSet: false, lead: null, budget: DEFAULT_ITEM_BUDGET, traps: [] });
  // ...or upgraded when loaded, it plays on.
  const up = upgradeState(JSON.parse(JSON.stringify(old)));
  assert.equal(up.battle, null);
  assert.deepEqual(up.players[0].bag, {});
  assert.deepEqual(up.players[0].armory, { units: {} });
  for (const g of [old, up]) {
    invade(g, from, to, { panda: 4 });
    act(g, "a", { type: "battleAuto" });
    act(g, "a", { type: "buyItem", item: "riceBall", count: 1 });
    act(g, "a", { type: "setOrders", region: from, budget: 3 });
    assert.equal(g.battle, null);
  }
  // Battles recorded before Pokémon-style battles still replay in the old BattleView.
  const r = battle({ rng: 99 } as GameState, { ...emptyUnits(), panda: 5, nacam: 2 }, 1, { ...emptyUnits(), panda: 4 }, 1);
  const legacy: BattleData = { attacker: { ...emptyUnits(), panda: 5, nacam: 2 }, attackerLost: r.attackerLost, defenderStart: { ...emptyUnits(), panda: 4 }, defenderLost: r.defenderLost, won: r.attackerWon, rolls: r.rolls, atkBonus: 1, defBonus: 1, defender: "b", defenderName: "Bo", from, to };
  assert.ok(canReplay({ type: "battle", data: legacy as unknown as Record<string, unknown> }));
  const { soldiers } = battleScript(legacy);
  for (const t of UNIT_TYPES) assert.equal(soldiers.filter((x) => x.side === "def" && x.type === t && x.diesAt !== null).length, r.defenderLost[t]);
  assert.equal(unitTotal(r.attacker) + unitTotal(r.attackerLost), 7);
});

// ---------------------------------------------------------------- previews

test("odds: previews play the real battle rules (type match-ups count now)", () => {
  const { s, from, to } = duel(51, { nacam: 5 }, {});
  Object.assign(s.regions[to], { owner: null, native: "cams", units: { ...emptyUnits(), cam: 2 }, buildings: ["gym"] });
  const ogres = attackOdds(viewFor(s, "a"), from, to, { ...emptyUnits(), nacam: 5 })!;
  s.regions[from].units = { ...emptyUnits(), panda: 5 };
  const pandas = attackOdds(viewFor(s, "a"), from, to, { ...emptyUnits(), panda: 5 })!;
  assert.ok(ogres.win < 0.6, `ogres against a CAM gym: ${ogres.win} (Risk sums said about 90%)`);
  assert.ok(pandas.win > ogres.win, `Glam beats Brute, Fluff beats Glam: pandas ${pandas.win}, ogres ${ogres.win}`);
  assert.deepEqual(attackOdds(viewFor(s, "a"), from, to, { ...emptyUnits(), panda: 5 }), pandas, "the same match-up, the same number");
});
