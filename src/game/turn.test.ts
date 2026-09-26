import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addPlayer, applyAction, createGame, emptyUnits, viewFor, type GameEvent, type GameState, type IncomeData } from "./engine";
import { describeOutcome, goodsDelta } from "./outcomes";
import { NEIGHBORS, REGION_BY_ID, lineId } from "./regions";
import { afterAction, choicesAt, openRegion, pick, pickable, stepIndexInStack, type Page, type PageOf } from "./turnFlow";
import {
  afford,
  attackTargets,
  buildOptions,
  dragRoutes,
  heroMoves,
  incomePreview,
  lineTargets,
  moveSources,
  recruitLimit,
  recruitPlaces,
  rollChance,
  thirstFor,
  turnLeftovers,
} from "./turnOptions";

const NOW = 1_800_000_000_000;

// Two Kirds; "me" plays second so the first can end its turn without a new round starting.
function world() {
  const s = createGame(21, NOW);
  addPlayer(s, "other", "Other");
  addPlayer(s, "me", "Me");
  return s;
}

// Hands `id` to a player with the given troops, all rested.
function own(s: GameState, id: string, pid: string, units: Partial<ReturnType<typeof emptyUnits>> = { panda: 2 }) {
  const r = s.regions[id];
  r.owner = pid;
  r.native = null;
  r.units = { ...emptyUnits(), ...units };
  r.tired = emptyUnits();
}

const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

// Me: capital plus one neighbour (linked by my gondola). Returns the regions and a free neighbour of each.
function empire(s: GameState) {
  const cap = player(s, "me").capital;
  const second = NEIGHBORS.get(cap)!.find((n) => !s.regions[n].owner)!;
  own(s, cap, "me", { panda: 3, nacam: 1 });
  own(s, second, "me", { panda: 2 });
  s.lines[lineId(cap, second)] = { owner: "me", builtTurn: 0 };
  return { cap, second };
}

test("turn menu: clicking another of your linked regions opens it, it doesn't become a destination", () => {
  const s = world();
  const { cap, second } = empire(s);
  const view = viewFor(s, "me");
  // Looking at a region: a click on any other region is never a "choice", it opens that region instead.
  const looking: Page[] = [{ step: "home" }, { step: "region", id: cap }];
  assert.equal(pick(looking[1], second, view), null);
  assert.deepEqual(openRegion(looking, second), [{ step: "home" }, { step: "region", id: second }]);
  // Hopping between regions replaces the region page rather than piling them up.
  assert.equal(openRegion(openRegion(looking, second), cap).length, 2);
  // Only a step that asks for a region takes the click: here, where to move troops to.
  const moveTo: Page = { step: "moveTo", from: cap };
  assert.ok(pickable(moveTo, view).includes(second));
  assert.deepEqual(pick(moveTo, second, view), { step: "moveTroops", from: cap, to: second });
  // A region that isn't a choice at this step doesn't advance it.
  const far = s.players.find((p) => p.id === "other")!.capital;
  assert.equal(pick(moveTo, far, view), null);
});

test("turn menu: attack targets say whether you can go now, need a line, are resting or at peace", () => {
  const s = world();
  const { cap, second } = empire(s);
  const targets = NEIGHBORS.get(cap)!.filter((n) => n !== second && !s.regions[n].owner);
  const [linked, unlinked] = targets;
  s.lines[lineId(cap, linked)] = { owner: "me", builtTurn: 0 };
  let view = viewFor(s, "me");
  const byId = (id: string) => attackTargets(view).find((t) => t.id === id)!;
  assert.equal(byId(linked).status, "ready");
  assert.ok(byId(linked).best!.odds!.win > 0);
  assert.equal(byId(unlinked).status, "needLine");
  // Picking a target that needs a line leads to the "build the line first" step.
  assert.deepEqual(pick({ step: "attackFrom", target: unlinked }, cap, view), { step: "attackLine", target: unlinked, from: cap });
  assert.deepEqual(pick({ step: "attackFrom", target: linked }, cap, view), { step: "attackTroops", target: linked, from: cap });
  // Everyone resting: nothing to attack with this turn.
  s.regions[cap].tired = { ...s.regions[cap].units };
  view = viewFor(s, "me");
  assert.equal(attackTargets(view, { from: cap }).find((t) => t.id === linked)!.status, "resting");
  assert.ok(!pickable({ step: "attackTarget", from: cap }, view).includes(linked));
  // At peace with the owner: can't attack.
  s.regions[cap].tired = emptyUnits();
  own(s, linked, "other");
  s.pacts.push({ a: "me", b: "other", sinceRound: 1 });
  view = viewFor(s, "me");
  assert.equal(attackTargets(view).find((t) => t.id === linked)!.status, "pact");
});

test("turn menu: during a gondola strike, choices that need a new line wait", () => {
  const s = world();
  const { cap, second } = empire(s);
  const unlinked = NEIGHBORS.get(cap)!.find((n) => n !== second && !s.regions[n].owner)!;
  s.modifiers.push({ kind: "gondolaStrike", untilRound: s.round });
  const view = viewFor(s, "me");
  assert.equal(attackTargets(view).find((t) => t.id === unlinked)!.status, "needLine");
  assert.ok(!pickable({ step: "attackTarget" }, view).includes(unlinked), "no dead end: the line can't be built this round");
  assert.ok(pickable({ step: "moveTo", from: cap }, view).includes(second), "lines you already have still work");
});

test("turn menu: someone else's line blocks an attack from that side", () => {
  const s = world();
  const { cap, second } = empire(s);
  const target = NEIGHBORS.get(cap)!.find((n) => n !== second && !s.regions[n].owner)!;
  s.lines[lineId(cap, target)] = { owner: "other", builtTurn: 0 };
  const view = viewFor(s, "me");
  const t = attackTargets(view).find((x) => x.id === target)!;
  assert.equal(t.sources.find((x) => x.from === cap)!.status, "blocked");
  assert.ok(!lineTargets(view, cap).some((r) => r.id === target), "you can't build a second line there");
});

test("turn menu: move, build and recruit options", () => {
  const s = world();
  const { cap, second } = empire(s);
  s.regions[cap].buildings = ["market"];
  const me = player(s, "me");
  me.goods = { bamboo: 3, rice: 3, stone: 0, iron: 0, gems: 0, coin: 0, pandaCoin: 0, camCoin: 0 };
  let view = viewFor(s, "me");
  const sources = moveSources(view);
  assert.equal(sources.find((x) => x.id === cap)!.status, "ready");
  const market = buildOptions(view).find((b) => b.building === "market")!;
  assert.ok(!market.where.includes(cap), "one Market per region");
  assert.ok(market.where.includes(second));
  assert.equal(market.afford.status, "no");
  // 3 bamboo + 3 rice pay for exactly 3 pandas; CAMs need a gym; arming is capped by the pandas there.
  assert.equal(recruitLimit(view, "panda"), 3);
  assert.deepEqual(recruitPlaces(view, "cam"), []);
  me.goods.coin = 12;
  me.goods.iron = 5;
  view = viewFor(s, "me");
  assert.ok(recruitLimit(view, "panda") > 3, "Coin buys the missing bamboo and rice");
  assert.equal(recruitLimit(view, "arm", second), 2);
  assert.equal(buildOptions(view).find((b) => b.building === "market")!.afford.status, "buy");
});

test("turn menu: next turn's income preview matches what the engine pays", () => {
  const s = world();
  const { cap, second } = empire(s);
  s.regions[cap].buildings = ["market", "sanctuary"];
  s.regions[second].buildings = ["gym"];
  s.regions[second].units = { ...emptyUnits(), panda: 4, nacam: 2 };
  const preview = incomePreview(viewFor(s, "me"));
  const events: GameEvent[] = applyAction(s, "other", { type: "endTurn" }, NOW);
  const income = events.find((e) => e.type === "income" && e.actor === "me")!;
  const m = income.text.match(/Income: ([+-]?\d+) 🪙, \+(\d+) 🐼, \+(\d+) 💪/u)!;
  assert.deepEqual([Number(m[1]), Number(m[2]), Number(m[3])], [preview.coin, preview.pandaCoin, preview.camCoin]);
});

test("turn menu: the end-of-turn check counts unused troops and attacks", () => {
  const s = world();
  const { cap, second } = empire(s);
  const target = NEIGHBORS.get(cap)!.find((n) => n !== second && !s.regions[n].owner)!;
  s.lines[lineId(cap, target)] = { owner: "me", builtTurn: 0 };
  const left = turnLeftovers(viewFor(s, "me"));
  assert.equal(left.readyTroops, 6);
  assert.equal(left.readyRegions, 2);
  assert.ok(left.attacks.some((t) => t.id === target));
  assert.equal(rollChance(7), 0);
  assert.equal(rollChance(6), 5 / 36);
  assert.equal(rollChance(12), 1 / 36);
});

test("turn menu: results describe what really happened", () => {
  const s = world();
  applyAction(s, "other", { type: "endTurn" }, NOW);
  const { cap } = empire(s);
  const me = player(s, "me");
  me.goods = { bamboo: 5, rice: 5, stone: 5, iron: 5, gems: 5, coin: 20, pandaCoin: 0, camCoin: 0 };
  const before = viewFor(s, "me");
  const build = { type: "build", region: cap, building: "fort" } as const;
  const events = applyAction(s, "me", build, NOW);
  const after = viewFor(s, "me");
  const out = describeOutcome(build, before, after, events);
  assert.match(out.title, /Fort built/);
  assert.deepEqual(out.regions, [cap]);
  assert.deepEqual(goodsDelta(before, after), { spent: { stone: 2, iron: 2 }, gained: {} });
  // An attack on an empty region is a walk-in claim.
  const empty = NEIGHBORS.get(cap)!.find((n) => !s.regions[n].owner)!;
  s.regions[empty].units = emptyUnits();
  s.regions[empty].native = null;
  s.lines[lineId(cap, empty)] = { owner: "me", builtTurn: 0 };
  const b2 = viewFor(s, "me");
  const move = { type: "move", from: cap, to: empty, units: { panda: 1 } } as const;
  const ev2 = applyAction(s, "me", move, NOW);
  assert.match(describeOutcome(move, b2, viewFor(s, "me"), ev2).title, /claimed/);
});

test("turn menu: after an action, Back returns to where it started; the step header can jump back", () => {
  const view = viewFor(world(), "me");
  const stack: Page[] = [{ step: "home" }, { step: "region", id: "tibet" }, { step: "buildWhere", building: "fort" }, { step: "buildReview", building: "fort", region: "tibet" }];
  const done: PageOf<"done"> = { step: "done", action: { type: "build", region: "tibet", building: "fort" }, events: [], before: view };
  assert.deepEqual(
    afterAction(stack, done).map((p) => p.step),
    ["home", "region", "done"],
  );
  const line: Page[] = [{ step: "home" }, { step: "buildWhat" }, { step: "lineFrom" }, { step: "lineTo", from: "tibet" }, { step: "lineReview", from: "tibet", to: "india" }];
  assert.equal(stepIndexInStack(line, "line", 2), 3);
  assert.equal(stepIndexInStack(line, "line", 0), 1, "the first step lives on the Build menu");
  assert.equal(stepIndexInStack([{ step: "home" }, { step: "region", id: "tibet" }, { step: "lineTo", from: "tibet" }, { step: "lineReview", from: "tibet", to: "india" }], "line", 1), -1);
});

// What the engine paid "me" at the start of my turn.
function paid(events: GameEvent[]) {
  const d = events.find((e) => e.type === "income" && e.actor === "me")!.data as IncomeData;
  return { harvest: d.harvest, coin: d.coin, pandaCoin: d.pandaCoin, camCoin: d.camCoin, deserted: d.deserted };
}

test("turn menu: the income preview counts only what lasts until your next turn, and ogres you can't pay", () => {
  const s = world();
  const { second } = empire(s);
  const bamboo = Object.keys(s.regions).find((id) => !s.regions[id].owner && REGION_BY_ID.get(id)!.resource === "bamboo")!;
  own(s, bamboo, "me");
  s.regions[second].units = { ...emptyUnits(), panda: 6, nacam: 9 };
  player(s, "me").goods.coin = 0;
  // The other Kird is playing and my seat comes later this round: a blight and an oath broken this round still count.
  s.modifiers.push({ kind: "blight", untilRound: s.round });
  player(s, "me").oathbreakerUntilRound = s.round;
  const preview = incomePreview(viewFor(s, "me"));
  assert.equal(preview.harvest.bamboo, undefined);
  assert.ok(preview.deserters > 0, "more ogres than Coin to pay them");
  const events = applyAction(s, "other", { type: "endTurn" }, NOW);
  assert.deepEqual(paid(events), { harvest: preview.harvest, coin: preview.coin, pandaCoin: preview.pandaCoin, camCoin: preview.camCoin, deserted: preview.deserters });
  // On my own turn, my next one is next round: both are over by then.
  const later = incomePreview(viewFor(s, "me"));
  assert.equal(later.harvest.bamboo, 1);
  assert.equal(later.pandaCoin, Math.floor(11 / 3), "11 pandas, no longer halved");
});

test("turn menu: heroes move once a turn, arming tops out at 50, and dragging follows your own lines", () => {
  const s = world();
  applyAction(s, "other", { type: "endTurn" }, NOW);
  const { cap, second } = empire(s);
  s.heroes.ping = { ...s.heroes.ping, owner: "me", region: cap, movedTurn: 0 };
  assert.deepEqual(heroMoves(viewFor(s, "me"), "ping"), [second]);
  s.heroes.ping.movedTurn = s.turn;
  assert.deepEqual(heroMoves(viewFor(s, "me"), "ping"), []);
  s.regions[cap].units.panda = 80;
  player(s, "me").goods = { ...player(s, "me").goods, iron: 999, coin: 999 };
  assert.equal(recruitLimit(viewFor(s, "me"), "arm", cap), 50);
  // Drag targets: own land and invasions along your own lines, never a friend's land.
  const [enemy, friend] = NEIGHBORS.get(cap)!.filter((n) => n !== second && !s.regions[n].owner);
  s.lines[lineId(cap, enemy)] = { owner: "me", builtTurn: 0 };
  s.lines[lineId(cap, friend)] = { owner: "me", builtTurn: 0 };
  own(s, friend, "other");
  s.pacts.push({ a: "me", b: "other", sinceRound: 1 });
  const routes = dragRoutes(viewFor(s, "me")).get(cap)!;
  assert.ok(routes.includes(second) && routes.includes(enemy));
  assert.ok(!routes.includes(friend));
});

test("turn menu: each choice on the globe says what picking it does", () => {
  const s = world();
  const { cap, second } = empire(s);
  const [linked, unlinked] = NEIGHBORS.get(cap)!.filter((n) => n !== second && !s.regions[n].owner);
  s.lines[lineId(cap, linked)] = { owner: "me", builtTurn: 0 };
  const view = viewFor(s, "me");
  const targets = choicesAt({ step: "attackTarget", from: cap }, view);
  assert.equal(targets.get(linked), "attack");
  assert.equal(targets.get(unlinked), "build", "needs a gondola line first");
  assert.equal(choicesAt({ step: "moveTo", from: cap }, view).get(second), "move");
  assert.equal(choicesAt({ step: "buildWhere", building: "fort" }, view).get(cap), "site");
  assert.deepEqual(pickable({ step: "attackTarget", from: cap }, view).sort(), [...targets.keys()].sort());
});

test("turn menu: a war crimes sentence closes what it forbids, and says so", () => {
  const s = world();
  addPlayer(s, "third", "Third");
  const { cap, second } = empire(s);
  const [kird, native] = NEIGHBORS.get(cap)!.filter((n) => n !== second && !s.regions[n].owner);
  own(s, kird, "other");
  s.regions[native].native = "pandas";
  for (const n of [kird, native]) s.lines[lineId(cap, n)] = { owner: "me", builtTurn: 0 };
  const me = player(s, "me");
  me.goods = { ...me.goods, coin: 50, bamboo: 0, rice: 0 };
  me.sentence = { sanctions: ["ceasefire", "arms", "gondolas", "trade"], turnsLeft: 3 };
  const view = viewFor(s, "me");
  const targets = attackTargets(view);
  assert.equal(targets.find((x) => x.id === kird)!.status, "ceasefire");
  assert.equal(targets.find((x) => x.id === native)!.status, "ready", "the natives are still fair game");
  assert.ok(!choicesAt({ step: "attackTarget" }, view).has(kird));
  assert.ok(!dragRoutes(view).get(cap)!.includes(kird));
  assert.equal(recruitLimit(view, "panda"), 0);
  assert.equal(choicesAt({ step: "lineFrom" }, view).size, 0, "no new lines under a Gondola ban");
  assert.equal(afford(view, { bamboo: 1 }).status, "no", "the Bank won't sell to a war criminal");
  // Served: everything opens up again.
  me.sentence.turnsLeft = 0;
  const free = viewFor(s, "me");
  assert.equal(attackTargets(free).find((x) => x.id === kird)!.status, "ready");
  assert.equal(afford(free, { bamboo: 1 }).status, "buy");
});

test("turn menu: attacking another Kird shows its Bloodthirst, and warns before a trial", () => {
  const s = world();
  addPlayer(s, "third", "Third");
  const { cap, second } = empire(s);
  const kird = NEIGHBORS.get(cap)!.find((n) => n !== second && !s.regions[n].owner)!;
  own(s, kird, "other");
  // The other Kird has plenty of land, so it's 1 point a time.
  for (const id of Object.keys(s.regions).filter((id) => !s.regions[id].owner).slice(0, 6)) own(s, id, "other");
  const me = player(s, "me");
  assert.equal(thirstFor(viewFor(s, "me"), kird)!.points, 1);
  assert.equal(thirstFor(viewFor(s, "me"), kird)!.trial, false);
  me.crimes = [1, 2, 3].map(() => ({ round: s.round, victim: "third", region: cap, kind: "invasion" as const, points: 1 }));
  const cost = thirstFor(viewFor(s, "me"), kird)!;
  assert.equal(cost.after, 4);
  assert.ok(cost.trial, "the 4th point opens a trial");
});
