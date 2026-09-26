import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addPlayer, applyAction, createGame, emptyUnits, viewFor, type Action, type GameState, type Units } from "./engine";
import { NEIGHBORS, lineId } from "./regions";
import { DEFAULT_ITEM_BUDGET, GEAR_BATTLES, MAX_ITEM_BUDGET, UNIT_TYPES } from "./rules";
import { ITEMS, WEAPONS } from "./battle/codex";
import { actualLead, bagCount, clampBudget, gearOffer, gearThatFits, GEAR_IDS, ITEM_IDS, ITEM_TIMES, itemsUsed, leadChoices, unlockedMove, usualLead } from "./loadout";

const NOW = 1_800_000_000_000;
const RICH = { bamboo: 40, stone: 40, iron: 40, rice: 40, gems: 40, coin: 99, pandaCoin: 40, camCoin: 40 };

// Ana (seat 0, and it's her turn) next to a region of Bo's, with a gondola line between them.
function duel(seed: number, atk: Partial<Units>, def: Partial<Units>) {
  const s = createGame(seed, NOW);
  addPlayer(s, "a", "Ana");
  addPlayer(s, "b", "Bo");
  const from = s.players[0].capital;
  const to = NEIGHBORS.get(from)!.find((n) => !s.regions[n].owner)!;
  Object.assign(s.regions[to], { owner: "b", native: null, units: { ...emptyUnits(), ...def }, tired: emptyUnits(), buildings: [] });
  Object.assign(s.regions[from], { owner: "a", native: null, units: { ...emptyUnits(), ...atk }, tired: emptyUnits() });
  s.lines[lineId(from, to)] = { owner: "a", builtTurn: 0 };
  for (const p of s.players) p.goods = { ...RICH };
  return { s, from, to };
}
const act = (s: GameState, who: string, a: Action) => applyAction(s, who, a, NOW);
const regionOf = (s: GameState, who: string, id: string) => viewFor(s, who).regions.find((r) => r.id === id)!;

test("the Armory: what fits each unit type is exactly what the Bank will fit", () => {
  assert.deepEqual(gearThatFits("panda", "weapon"), ["bambooSpear", "bambooBow", "gemArrows", "sling"]);
  assert.deepEqual(gearThatFits("panda", "armor"), ["ironHelm", "towerShield"]);
  assert.deepEqual(gearThatFits("nacam", "weapon"), ["sling", "spikedClub"]);
  assert.deepEqual(gearThatFits("cam", "armor"), ["ironHelm"]);
  for (const t of UNIT_TYPES) {
    for (const slot of ["weapon", "armor"] as const) {
      assert.ok(gearThatFits(t, slot).every((id) => WEAPONS[id].slot === slot), `${t} ${slot}`);
      assert.ok(!gearThatFits(t, slot).includes("catapult"), "the catapult is the army's, not a unit's");
    }
  }
  const { s } = duel(3, { panda: 1 }, { panda: 1 });
  for (const t of UNIT_TYPES) {
    for (const id of GEAR_IDS.filter((g) => WEAPONS[g].slot !== "army")) {
      const fits = gearThatFits(t, WEAPONS[id].slot as "weapon" | "armor").includes(id);
      const buy = () => act(s, "a", { type: "buyGear", item: id, unit: t });
      if (fits) buy();
      else assert.throws(buy, /can't use/, `${t} can't carry ${id}`);
    }
  }
});

test("the Armory: buying fills an empty slot, replaces other gear, and renews the same gear to full", () => {
  const { s, from, to } = duel(5, { panda: 4 }, { panda: 1 });
  const armory = () => viewFor(s, "a").players.find((p) => p.id === "a")!.armory;
  assert.deepEqual(gearOffer(armory(), "bambooSpear", "panda"), { kind: "buy" });
  assert.deepEqual(gearOffer(armory(), "catapult"), { kind: "buy" });
  act(s, "a", { type: "buyGear", item: "bambooSpear", unit: "panda" });
  act(s, "a", { type: "buyGear", item: "catapult" });
  assert.deepEqual(gearOffer(armory(), "bambooSpear", "panda"), { kind: "renew", charges: GEAR_BATTLES, full: true });
  assert.deepEqual(gearOffer(armory(), "bambooBow", "panda"), { kind: "replace", old: { id: "bambooSpear", charges: GEAR_BATTLES } });
  assert.deepEqual(gearOffer(armory(), "ironHelm", "panda"), { kind: "buy" }, "armour is its own slot");
  assert.deepEqual(gearOffer(armory(), "sling", "nacam"), { kind: "buy" }, "every unit type has its own gear");
  // A battle wears both down.
  act(s, "a", { type: "move", from, to, units: { panda: 4 } });
  act(s, "a", { type: "battleAuto" });
  assert.deepEqual(gearOffer(armory(), "bambooSpear", "panda"), { kind: "renew", charges: GEAR_BATTLES - 1, full: false });
  assert.deepEqual(gearOffer(armory(), "catapult"), { kind: "renew", charges: GEAR_BATTLES - 1, full: false });
  // Words for the shop: what the gear unlocks (the catapult's own line says it already).
  assert.equal(unlockedMove("bambooSpear")?.name, "Skewer");
  assert.equal(unlockedMove("ironHelm"), null);
  assert.equal(unlockedMove("catapult"), null);
});

test("the Bag: every item is listed once, under when it can be used, and counted", () => {
  const listed = ITEM_TIMES.flatMap((t) => itemsUsed(t.when));
  assert.deepEqual([...listed].sort(), [...ITEM_IDS].sort());
  assert.ok(itemsUsed("reaction").includes("luckyGem"));
  assert.equal(bagCount(undefined), 0);
  assert.equal(bagCount({ riceBall: 2, luckyGem: 1 }), 3);
  assert.ok(ITEM_IDS.every((id) => Object.values(ITEMS[id].cost).some((n) => (n ?? 0) > 0)), "nothing is free");
});

test("Standing Orders: the item budget is always one the orders accept", () => {
  assert.equal(clampBudget(-3), 0);
  assert.equal(clampBudget(0), 0);
  assert.equal(clampBudget(4.4), 4);
  assert.equal(clampBudget(4.6), 5);
  assert.equal(clampBudget(12), MAX_ITEM_BUDGET);
  assert.equal(clampBudget(Infinity), MAX_ITEM_BUDGET);
  assert.equal(clampBudget(NaN), DEFAULT_ITEM_BUDGET);
  const { s, from } = duel(7, { panda: 1 }, { panda: 1 });
  for (const n of [-1, 0, 3.7, MAX_ITEM_BUDGET, 50]) {
    act(s, "a", { type: "setOrders", region: from, budget: clampBudget(n) });
    assert.equal(regionOf(s, "a", from).orders!.budget, clampBudget(n));
  }
});

test("Standing Orders: the lead squad offered is who really meets the invaders first", () => {
  const { s, from, to } = duel(9, { cam: 6 }, { panda: 2, nacam: 2 });
  s.heroes.ping = { owner: "b", region: to, movedTurn: 0 };
  act(s, "a", { type: "endTurn" });
  const view = () => viewFor(s, "b");
  const here = () => regionOf(s, "b", to);
  assert.deepEqual(
    leadChoices(view(), here()).map((c) => [c.id, c.count, c.here]),
    [["panda", 2, true], ["nacam", 2, true], ["ping", 1, true]],
  );
  assert.equal(usualLead(view(), here()), "panda", "the usual order: pandas first");
  assert.equal(actualLead(view(), here()), "panda");
  act(s, "b", { type: "setOrders", region: to, lead: "ping" });
  assert.equal(actualLead(view(), here()), "ping");

  // The ogres leave: an order for them stays on the list, marked, and the usual order takes over.
  act(s, "b", { type: "setOrders", region: to, lead: "nacam" });
  s.regions[to].units.nacam = 0;
  const gone = leadChoices(view(), here()).find((c) => c.id === "nacam")!;
  assert.deepEqual([gone.here, gone.count], [false, 0]);
  assert.equal(actualLead(view(), here()), "panda");

  // Heroes on strike sit battles out, so they can't lead either.
  act(s, "b", { type: "setOrders", region: to, lead: "ping" });
  s.players.find((p) => p.id === "b")!.sentence = { sanctions: ["heroes"], turnsLeft: 2 };
  assert.equal(leadChoices(view(), here()).find((c) => c.id === "ping")!.onStrike, true);
  assert.equal(actualLead(view(), here()), "panda");
  s.players.find((p) => p.id === "b")!.sentence = null;
  act(s, "b", { type: "endTurn" });

  // And the engine agrees: Ana invades, and Ping steps up first.
  s.regions[to].units.nacam = 2;
  const predicted = actualLead(viewFor(s, "b"), regionOf(s, "b", to));
  act(s, "a", { type: "move", from, to, units: { cam: 6 } });
  assert.equal(predicted, "ping");
  assert.equal(s.battle!.b.sides.def.squads[0].kind, predicted);
});
