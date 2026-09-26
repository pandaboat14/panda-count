// Panda Diplomacy battle engine: pure rules over a plain object, no rendering.
// A typed port of design/battles/shared/battle-engine.js, with one difference in kind: the battle is plain JSON at
// every point. Its RNGs are integer states advanced explicitly (no closures), and events are annotated as they are
// emitted (no overridden push), so a battle can be stored between requests and carry on exactly as before.
//
// A round: both sides pick an action, support effects happen, both sides roll together, dice pair off
// highest against highest (ties go to the defender, as in Risk), and every pair a side wins deals its move's power.
import { BUILDINGS, DOCTRINES, GOODS, HEROES, ITEMS, MOVES, MOVE_BY_ID, NATIVE_DOCTRINE, NATIVE_NAMES, RULES, STATUSES, TERRAIN, UNITS, WEAPONS, typeMult } from "./codex";
import type {
  ActionGroups,
  Battle,
  BattleAction,
  BattleConfig,
  BattleEvent,
  BattleSide,
  BattleSummary,
  Cost,
  Estimate,
  GoodId,
  ItemId,
  ItemOption,
  MoveDef,
  MoveOption,
  Pair,
  Pending,
  Plan,
  PlanSummary,
  ReactionId,
  ReactionOption,
  ResultHow,
  SideConfig,
  SideKey,
  Squad,
  SquadSnap,
  SquadSpec,
  SquadStats,
  StatusId,
  UnitId,
  WeaponDef,
} from "./types";

const R = RULES;
const other = (k: SideKey): SideKey => (k === "atk" ? "def" : "atk");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SIDES: SideKey[] = ["atk", "def"];

// mulberry32 as a closure, for callers that want their own stream (previews, dice physics).
export function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same generator over a state stored in the battle: the dice (rng) or the computer's choices (aiRng).
function draw(b: Battle, which: "rng" | "aiRng") {
  const s = (b[which] = (b[which] + 0x6d2b79f5) | 0);
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (b: Battle) => draw(b, "rng");
const d6 = (b: Battle) => 1 + Math.floor(rand(b) * 6);

export const costText = (c: Cost | null | undefined) =>
  Object.entries(c || {})
    .filter(([, n]) => n)
    .map(([g, n]) => `${n} ${GOODS[g as GoodId].icon}`)
    .join(" ");

// ---------------------------------------------------------------- setup

function makeSquad(key: SideKey, spec: SquadSpec, i: number): Squad {
  if (spec.hero) {
    const h = HEROES[spec.hero];
    return { id: `${key}${i}`, hero: spec.hero, unit: null, kind: spec.hero, name: h.name, icon: h.icon, type: "legend", count: 1, maxCount: 1, hpPer: h.hp, hp: h.hp, gear: [], status: {}, fresh: {}, lost: 0 };
  }
  const unit = spec.unit as UnitId;
  const u = UNITS[unit];
  const count = spec.count ?? 0;
  return { id: `${key}${i}`, hero: null, unit, kind: unit, name: u.plural, icon: u.icon, type: u.type, count, maxCount: count, hpPer: u.hp, hp: count * u.hp, gear: spec.gear || (spec.weapon ? [spec.weapon] : []), status: {}, fresh: {}, lost: 0 };
}

function makeSide(key: SideKey, cfg: SideConfig): BattleSide {
  const specs = [...(cfg.squads || [])];
  if (cfg.hero) specs.push({ hero: cfg.hero });
  const squads = specs.filter((s) => s.hero || (s.count ?? 0) > 0).map((s, i) => makeSquad(key, s, i));
  return {
    key,
    name: cfg.name,
    color: cfg.color || "#888",
    native: cfg.native || null,
    player: Boolean(cfg.player),
    doctrine: cfg.doctrine || (cfg.native ? NATIVE_DOCTRINE[cfg.native] : "counter"),
    squads,
    active: 0,
    bag: { ...(cfg.bag || {}) },
    goods: { bamboo: 0, stone: 0, iron: 0, rice: 0, gems: 0, coin: 0, pandaCoin: 0, camCoin: 0, ...(cfg.goods || {}) },
    catapult: Boolean(cfg.catapult),
    thunderCharged: cfg.thunderCharged !== false,
    momentum: 0,
    used: {}, // once-per-battle moves
    hazard: 0, // damage this side's squads take when they step in (enemy caltrops)
    flags: { noChase: false, smokedRound: 0, trappedUntil: 0, catapultRound: -9, blessing: false },
    spent: {},
    budget: typeof cfg.budget === "number" ? cfg.budget : null,
    itemsUsed: 0,
  };
}

export function createBattle(cfg: BattleConfig): Battle {
  const seed = cfg.seed ?? 1;
  const b: Battle = {
    cfg,
    seed,
    rng: seed | 0,
    aiRng: (seed * 7919 + 13) | 0,
    terrain: cfg.terrain || "bamboo",
    buildings: cfg.buildings || [],
    events: cfg.events || [],
    place: cfg.place || "the border",
    round: 0,
    over: false,
    result: null,
    sides: { atk: makeSide("atk", cfg.atk), def: makeSide("def", cfg.def) },
    log: [],
    pending: null,
    opening: [],
  };
  const d = b.sides.def;
  const a = b.sides.atk;
  // Standing orders can lay caltrops before anyone arrives.
  if ((cfg.def.traps || []).includes("caltrops")) a.hazard += ITEMS.caltrops.hazard!;
  if (b.buildings.includes("gym")) for (const s of d.squads) if (s.unit === "cam") setStatus(s, "focused", 1, false);
  emit(b, b.opening, { t: "say", text: `${a.name} rode the gondola into ${b.place}. ${defenderName(b)} ${d.name === "You" ? "stand" : "stands"} ready.` });
  enter(b, "atk", b.opening, true);
  enter(b, "def", b.opening, true);
  return b;
}

function defenderName(b: Battle) {
  const d = b.sides.def;
  return d.native ? NATIVE_NAMES[d.native].replace(/^the /, "The ") : d.name;
}

// ---------------------------------------------------------------- queries

const alive = (s: Squad) => s.hp > 0;
// What a display needs to show a squad right after an event.
const snap = (sq: Squad): SquadSnap => ({ id: sq.id, unit: sq.unit, hero: sq.hero, kind: sq.kind, name: sq.name, type: sq.type, hp: sq.hp, count: sq.count, maxCount: sq.maxCount, hpPer: sq.hpPer, gear: [...(sq.gear || [])] });
export const activeSquad = (side: BattleSide) => side.squads[side.active];
const hasStatus = (sq: Squad, k: StatusId) => (sq.status[k] || 0) > 0;
const heroAura = (side: BattleSide) => side.squads.filter((s) => s.hero && alive(s)).reduce((n, s) => n + HEROES[s.hero!].aura, 0);
const eventOn = (b: Battle, k: string) => (b.events as string[]).includes(k);
const canPay = (side: BattleSide, cost: Cost) => Object.entries(cost || {}).every(([g, n]) => (side.goods[g as GoodId] || 0) >= (n ?? 0));
function pay(side: BattleSide, cost: Cost) {
  for (const [g, n] of Object.entries(cost || {}) as [GoodId, number][]) {
    side.goods[g] -= n;
    side.spent[g] = (side.spent[g] || 0) + n;
  }
}
// Standing Orders can cap how many Bag items a side spends (no cap unless a budget was given).
const withinBudget = (side: BattleSide, n = 1) => side.budget === null || side.itemsUsed + n <= side.budget;
const hasItem = (side: BattleSide, id: string) => ((side.bag as Record<string, number>)[id] ?? 0) > 0;

export function squadStats(b: Battle, side: BattleSide, sq: Squad): SquadStats {
  let atk = sq.hero ? HEROES[sq.hero].atk : UNITS[sq.unit!].atk;
  let def = sq.hero ? HEROES[sq.hero].def : UNITS[sq.unit!].def;
  for (const w of gearOf(sq)) {
    atk += w.atk || 0;
    def += w.def || 0;
  }
  const aura = heroAura(side);
  const fort = side.key === "def" && b.buildings.includes("fort") ? 1 : 0;
  return { atk: atk + aura + fort, def: def + aura + fort, aura, fort };
}

export const gearOf = (sq: Pick<Squad, "gear">): WeaponDef[] => (sq.gear || []).map((g) => WEAPONS[g]).filter(Boolean);

// Moves this squad knows: its own list, its gear's moves, the army catapult.
export function movesOf(side: BattleSide, sq: Squad): MoveDef[] {
  const out: MoveDef[] = MOVES.filter((m) => m.user === sq.kind);
  for (const w of gearOf(sq)) if (w.move && !out.includes(MOVE_BY_ID[w.move])) out.push(MOVE_BY_ID[w.move]);
  if (side.catapult && side.key === "atk") out.push(MOVE_BY_ID.boulderBarrage);
  return out;
}

// What a move costs right now (the Mercenary Market takes 1 Coin off per hired ogre).
export function moveCost(b: Battle, m: MoveDef): Cost {
  if (m.hire && eventOn(b, "mercMarket")) return { ...m.cost, coin: Math.max(0, (m.cost.coin || 0) - m.hire) };
  return m.cost;
}

function moveBlocked(b: Battle, side: BattleSide, sq: Squad, m: MoveDef) {
  if (m.kind === "signature" && side.momentum < R.momentumMax) return `Needs ${R.momentumMax} Momentum`;
  if (m.kind === "strike" && hasStatus(sq, "charmed")) return "Charmed: no Strikes";
  if (m.tags.includes("once") && side.used[m.id]) return "Used this battle";
  if (m.needs && !(side.key === "def" && b.buildings.includes(m.needs))) return `Only defending a ${BUILDINGS[m.needs].label}`;
  if (m.element === "bamboo" && eventOn(b, "blight")) return "Bamboo Blight";
  if (m.tags.includes("reload") && b.round + 1 - side.flags.catapultRound < 2) return "Reloading";
  if (m.id === "thunderCall" && !side.thunderCharged) return "Thunder isn't charged";
  if (m.id === "cableDrop" && eventOn(b, "gondolaStrike")) return "Gondola Strike";
  if (m.id === "pandaDiplomacy" && !b.sides[other(side.key)].squads.some((s) => alive(s))) return "Nobody to talk to";
  if (!canPay(side, moveCost(b, m))) return `Needs ${costText(moveCost(b, m))}`;
  return null;
}

function itemBlocked(b: Battle, side: BattleSide, id: ItemId) {
  if (!hasItem(side, id)) return "None left";
  if (!withinBudget(side)) return "Item budget spent";
  if (id === "bribe" && !b.sides[other(side.key)].native) return "Natives only";
  if (id === "smokeBomb" && eventOn(b, "blight")) return "Bamboo Blight";
  if (id === "caltrops" && side.key === "atk" && b.sides.def.squads.every((s) => !alive(s) || s === activeSquad(b.sides.def))) return "No one left to step in";
  return null;
}

// Everything a side could do this round, grouped the way the menus show it.
export function actionsFor(b: Battle, key: SideKey): ActionGroups {
  const side = b.sides[key];
  const sq = activeSquad(side);
  const groups: ActionGroups = { attack: [], defend: [], tactics: [], signature: [], bag: [], squads: [], retreat: [] };
  for (const m of movesOf(side, sq)) {
    const blocked = moveBlocked(b, side, sq, m);
    const g = m.kind === "strike" ? "attack" : m.kind === "guard" ? "defend" : m.kind === "tactic" ? "tactics" : "signature";
    groups[g].push({ kind: "move", id: m.id, move: m, enabled: !blocked, reason: blocked } satisfies MoveOption);
  }
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    if (!hasItem(side, id)) continue;
    const it = ITEMS[id];
    const blocked = itemBlocked(b, side, id);
    groups.bag.push({ kind: "item", id, item: it, when: it.when, enabled: !blocked, reason: blocked, count: side.bag[id]! } satisfies ItemOption);
  }
  side.squads.forEach((s, i) => {
    if (i === side.active) return;
    const blocked = !alive(s) ? "Fallen" : side.flags.trappedUntil >= b.round + 1 ? "Can't switch" : null;
    groups.squads.push({ kind: "switch", to: i, squad: s, enabled: !blocked, reason: blocked });
  });
  if (key === "atk") {
    const blocked = eventOn(b, "gondolaStrike") ? "Gondola Strike: no way home" : side.flags.trappedUntil >= b.round + 1 ? "The line is cut" : null;
    groups.retreat.push({ kind: "retreat", enabled: !blocked, reason: blocked });
  }
  return groups;
}

// ---------------------------------------------------------------- dice plans

export function planDice(b: Battle, key: SideKey, action: BattleAction): Plan {
  const side = b.sides[key];
  const sq = activeSquad(side);
  const st = squadStats(b, side, sq);
  const T = TERRAIN[b.terrain];
  const p: Plan = { key, action, dice: 0, bonus: 0, power: 0, critOn: R.critOn, ranged: false, pierce: false, guard: false, brace: 1, winsTies: false, losesTies: false, decoy: false, pierceable: 0, type: sq.type, move: null, notes: [] };
  const note = (label: string, value: string) => p.notes.push({ label, value });
  let base = 0;
  let stat: "atk" | "def" = "def";
  const m = action.kind === "move" ? MOVE_BY_ID[action.id] : null;
  if (m) {
    p.move = m;
    p.guard = m.kind === "guard" || Boolean(m.guard);
    // Risk's 3 against 2: defenders roll one fewer die from attack pools.
    const pool = m.kind === "strike" || (m.kind === "signature" && !m.guard);
    base = key === "def" && pool ? Math.max(1, m.dice - R.defenderDiceCut) : m.dice;
    p.power = m.power;
    p.bonus += m.bonus;
    if (m.bonus) note(m.name, `${m.bonus > 0 ? "+" : ""}${m.bonus}`);
    stat = key === "atk" ? "atk" : "def";
    if (m.critOn) p.critOn = Math.min(p.critOn, m.critOn);
    p.ranged = m.tags.includes("ranged");
    p.pierce = m.tags.includes("pierce");
    p.winsTies = Boolean(m.winsTies) || p.guard;
    p.brace = p.guard ? m.brace || R.guardBrace : 1;
    p.decoy = Boolean(m.decoy);
    if (m.kind === "guard" || m.guard) p.pierceable += m.bonus;
    if (m.tags.includes("firstRound") && b.round === 1) {
      base += 1;
      note("First volley", "+1 die");
    }
    for (const w of gearOf(sq)) {
      const forge = b.terrain === "iron" ? 1 : 0;
      const strikePool = m.kind === "strike" || (m.kind === "signature" && !m.guard);
      if (strikePool && w.power && p.power) {
        p.power += w.power + forge;
        note(w.label, `+${w.power + forge} power`);
      }
      if (w.guardDice && p.guard) {
        base += w.guardDice;
        note(w.label, "+1 die");
      }
      if (w.critOnBow && m.id === "volley") p.critOn = Math.min(p.critOn, w.critOnBow);
    }
    const boosted = m.element && m.element === T.element;
    if (boosted) {
      base += 1;
      note(T.label, "+1 die");
    }
    if (b.terrain === "rice" && sq.type === "brute" && m.kind === "strike") {
      base -= 1;
      note("Mud", "-1 die");
    }
    if (b.terrain === "stone" && p.ranged && p.power) {
      p.power += 3;
      note("High ground", "+3 power");
    }
    if (key === "def" && b.buildings.includes("fort") && p.guard) {
      p.power += 2;
      note("Fort", "+2 power");
    }
  } else if (action.kind === "item") {
    stat = key === "atk" ? "atk" : "def";
    base = R.itemDice;
    note("Busy with an item", "1 die");
  } else if (action.kind === "switch") {
    stat = key === "atk" ? "atk" : "def";
    base = R.switchDice;
    note("Just switched in", "2 dice");
  }
  if (b.terrain === "gems") p.critOn = Math.min(p.critOn, 5);
  const statBonus = stat === "atk" ? st.atk : st.def;
  p.bonus += statBonus;
  const unitStat = statBonus - st.aura - st.fort;
  if (unitStat) note(stat === "atk" ? "Attack" : "Defence", `${unitStat > 0 ? "+" : ""}${unitStat}`);
  if (st.aura) note("Hero aura", `+${st.aura}`);
  if (st.fort) {
    note("Fort", "+1");
    p.pierceable += 1;
  }
  if (hasStatus(sq, "staggered")) {
    base -= 1;
    note("Staggered", "-1 die");
  }
  if (hasStatus(sq, "focused")) {
    base += 1;
    note("Focused", "+1 die");
  }
  if (hasStatus(sq, "shaken")) {
    p.bonus -= 1;
    note("Shaken", "-1");
  }
  if (hasStatus(sq, "enraged")) {
    p.bonus += 1;
    note("Enraged", "+1");
  }
  if (hasStatus(sq, "hyped")) {
    p.bonus += 1;
    note("Hyped", "+1");
  }
  if (hasStatus(sq, "dazzled")) {
    p.critOn = 99;
    p.losesTies = true;
    note("Dazzled", "no crits");
  }
  if (side.flags.smokedRound === b.round) {
    base -= 1;
    note("Smoke", "-1 die");
  }
  if (key === "def" && b.round === 1 && b.terrain === "bamboo") {
    base += 1;
    note("Ambush", "+1 die");
  }
  if (action.prep === "gemFocus") {
    base += 1;
    note("Gem Focus", "+1 die");
  }
  if (action.prep === "whetstone" && p.power) {
    p.power += ITEMS.whetstone.power!;
    note("Whetstone", "+4 power");
  }
  p.dice = clamp(base, R.minDice, R.maxDice);
  return p;
}

// ---------------------------------------------------------------- statuses & HP

function setStatus(sq: Squad, k: StatusId, turns: number, fresh = true) {
  sq.status[k] = Math.max(sq.status[k] || 0, turns);
  if (fresh) sq.fresh[k] = true;
}

function applyDamage(sq: Squad, amount: number) {
  const before = sq.count;
  sq.hp = Math.max(0, sq.hp - amount);
  sq.count = sq.hp <= 0 ? 0 : Math.ceil(sq.hp / sq.hpPer);
  const fell = before - sq.count;
  sq.lost += fell;
  return fell;
}

function heal(b: Battle, sq: Squad, amount: number) {
  if (!alive(sq)) return { add: 0, revived: 0 };
  const boost = b.terrain === "rice" ? 1.5 : 1;
  const before = sq.count;
  const max = sq.maxCount * sq.hpPer;
  const add = Math.min(max - sq.hp, Math.round(amount * boost));
  sq.hp += add;
  sq.count = Math.ceil(sq.hp / sq.hpPer);
  const revived = sq.count - before;
  sq.lost = Math.max(0, sq.lost - revived);
  return { add, revived };
}

function addUnits(side: BattleSide, unit: UnitId, n: number) {
  let sq = side.squads.find((s) => s.unit === unit && alive(s));
  if (!sq) {
    sq = makeSquad(side.key, { unit, count: 0 }, side.squads.length);
    sq.hp = 0;
    side.squads.push(sq);
  }
  sq.count += n;
  sq.maxCount += n;
  sq.hp += n * sq.hpPer;
  sq.name = UNITS[unit].plural;
  return sq;
}

// A squad steps into the fight (the first one, a switch, or the next in line after a wipe).
function enter(b: Battle, key: SideKey, ev: BattleEvent[], opening = false) {
  const side = b.sides[key];
  const sq = activeSquad(side);
  emit(b, ev, { t: "enter", side: key, squad: sq.id, text: opening ? `${cap(sideLabel(b, key))} ${verb(b, key, "lead", "leads")} with ${squadLabel(sq)}.` : `${squadLabel(sq)} step${sq.count === 1 ? "s" : ""} up for ${sideLabel(b, key) === "You" ? "you" : sideLabel(b, key)}.` });
  if (side.hazard > 0 && alive(sq)) {
    const fell = applyDamage(sq, side.hazard);
    emit(b, ev, { t: "damage", side: key, squad: sq.id, amount: side.hazard, fell, eff: null, hits: 0, crits: 0, source: "caltrops", text: `${squadLabel(sq)} stepped on caltrops! (-${side.hazard})` });
  }
}

export function squadLabel(sq: Squad) {
  return sq.hero ? sq.name : `${sq.count} ${sq.count === 1 ? (sq.unit ? UNITS[sq.unit].label : sq.name) : sq.name}`;
}
export function sideLabel(b: Battle, key: SideKey) {
  const s = b.sides[key];
  if (s.native) return NATIVE_NAMES[s.native];
  return s.name;
}
// "Your Ogres", "Mei's Ogres", "the Panda Nation's Pandas"
export function possessive(b: Battle, key: SideKey) {
  const n = sideLabel(b, key);
  if (n === "You") return "Your";
  return n.endsWith("s") ? `${n}'` : `${n}'s`;
}
// "You lead", "Mei leads"
const verb = (b: Battle, key: SideKey, plural: string, singular: string) => (sideLabel(b, key) === "You" ? plural : singular);

// ---------------------------------------------------------------- events

// Every event that names a squad carries that squad's state at that moment (and, when armies change shape, every squad's).
function annotate(b: Battle, e: BattleEvent) {
  const find = (id: string) => b.sides.atk.squads.find((q) => q.id === id) || b.sides.def.squads.find((q) => q.id === id);
  if ("squad" in e && e.squad) {
    const sq = find(e.squad);
    if (sq) e.after = snap(sq);
  }
  if (e.t === "enter") e.index = b.sides[e.side].squads.findIndex((q) => q.id === e.squad);
  if (e.t === "reinforce" || e.t === "convert" || e.t === "bribe" || e.t === "heal" || e.t === "smite" || e.t === "enter" || e.t === "faint") e.squads = { atk: b.sides.atk.squads.map(snap), def: b.sides.def.squads.map(snap) };
  if (e.t === "momentum") e.value = b.sides[e.side].momentum;
}
function emit(b: Battle, list: BattleEvent[], e: BattleEvent) {
  annotate(b, e);
  list.push(e);
  return e;
}

// ---------------------------------------------------------------- the round

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
function describe(b: Battle, key: SideKey, action: BattleAction) {
  const sq = activeSquad(b.sides[key]);
  const who = sq.hero ? sq.name : `${cap(possessive(b, key))} ${sq.name}`;
  const name = cap(sideLabel(b, key));
  if (action.kind === "move") return `${who} used ${MOVE_BY_ID[action.id].name.toUpperCase()}!`;
  if (action.kind === "item") return `${name} used ${ITEMS[action.id].icon} ${ITEMS[action.id].label}.`;
  if (action.kind === "switch") return `${name} pulled back ${sq.name}.`;
  if (action.kind === "retreat") return `${name} sounded the retreat!`;
  return "";
}

// What a client sends is checked against what the side could really do right now.
export function validate(b: Battle, key: SideKey, a: BattleAction | null | undefined) {
  if (!a || !a.kind) throw new Error("Pick something to do.");
  const g = actionsFor(b, key);
  const ok = <T extends { enabled: boolean }>(list: T[], pred: (x: T) => boolean) => list.some((x) => x.enabled && pred(x));
  let fine = false;
  if (a.kind === "move") fine = ok([...g.attack, ...g.defend, ...g.tactics, ...g.signature], (x) => x.id === a.id);
  else if (a.kind === "item") fine = ok(g.bag, (x) => x.id === a.id && x.when === "action");
  else if (a.kind === "switch") fine = ok(g.squads, (x) => x.to === a.to);
  else if (a.kind === "retreat") fine = ok(g.retreat, () => true);
  if (!fine) throw new Error(`${sideLabel(b, key)} can't do that right now.`);
  const side = b.sides[key];
  if (a.prep && !(hasItem(side, a.prep) && ITEMS[a.prep] && ITEMS[a.prep].when === "prep")) throw new Error("That item isn't in the bag.");
  if (a.prep && !withinBudget(side, a.kind === "item" ? 2 : 1)) throw new Error("That's more items than the orders allow.");
}

export function beginRound(b: Battle, atkAction: BattleAction, defAction: BattleAction): Pending {
  if (b.over) throw new Error("The battle is over.");
  validate(b, "atk", atkAction);
  validate(b, "def", defAction);
  b.round += 1;
  const ev: BattleEvent[] = [];
  const P: Pending = { round: b.round, actions: { atk: atkAction, def: defAction }, plans: {}, dice: {}, rerolls: [], used: { atk: false, def: false }, blessing: { atk: false, def: false }, events: ev, done: false };
  b.pending = P;
  const A = b.sides.atk;

  // Prep items are paid for up front.
  for (const key of SIDES) {
    const a = P.actions[key];
    if (a.prep && hasItem(b.sides[key], a.prep)) {
      const side = b.sides[key];
      side.bag[a.prep]! -= 1;
      side.itemsUsed += 1;
      emit(b, ev, { t: "item", side: key, item: a.prep, text: `${sideLabel(b, key)} used ${ITEMS[a.prep].icon} ${ITEMS[a.prep].label}.` });
    } else if (a.prep) delete a.prep;
  }

  // Retreat: the attackers pull out, and the defenders get a parting shot unless the line was cut or smoked.
  if (atkAction.kind === "retreat") {
    emit(b, ev, { t: "use", side: "atk", action: atkAction, text: describe(b, "atk", atkAction) });
    if (!A.flags.noChase) {
      const shot = R.retreatShot;
      const vals = Array.from({ length: shot.dice }, () => d6(b));
      const hits = vals.filter((v) => v >= shot.hitOn).length;
      const sq = activeSquad(A);
      emit(b, ev, { t: "roll", atk: [], def: vals, plans: null, text: "Parting shot!" });
      if (hits) {
        const fell = applyDamage(sq, hits * shot.damage);
        emit(b, ev, { t: "damage", side: "atk", squad: sq.id, amount: hits * shot.damage, fell, eff: null, hits, crits: 0, text: `The parting shot caught ${squadLabel(sq) || sq.name} (-${hits * shot.damage}).` });
      } else emit(b, ev, { t: "say", text: "The parting shot missed everyone." });
    } else emit(b, ev, { t: "say", text: "Nobody could follow them." });
    finish(b, "retreat", ev);
    P.done = true;
    return P;
  }

  for (const key of SIDES) emit(b, ev, { t: "use", side: key, action: P.actions[key], text: describe(b, key, P.actions[key]) });

  // Switches happen first.
  for (const key of SIDES) {
    const a = P.actions[key];
    if (a.kind !== "switch") continue;
    const side = b.sides[key];
    side.active = a.to;
    enter(b, key, ev);
  }

  // Support: items, heals, reinforcements, ceasefire, thunder. They land before the dice.
  for (const key of SIDES) support(b, key, P.actions[key], ev);
  if (b.over) {
    P.done = true;
    return P;
  }
  for (const key of SIDES) if (!alive(activeSquad(b.sides[key]))) nextSquad(b, key, ev);
  if (checkEnd(b, ev)) {
    P.done = true;
    return P;
  }

  P.plans.atk = planDice(b, "atk", P.actions.atk);
  P.plans.def = planDice(b, "def", P.actions.def);
  P.dice.atk = Array.from({ length: P.plans.atk.dice }, () => d6(b));
  P.dice.def = Array.from({ length: P.plans.def.dice }, () => d6(b));
  emit(b, ev, { t: "roll", atk: [...P.dice.atk], def: [...P.dice.def], plans: { atk: planSummary(P.plans.atk), def: planSummary(P.plans.def) } });
  return P;
}

const planSummary = (p: Plan): PlanSummary => ({ dice: p.dice, bonus: p.bonus, power: p.power, critOn: p.critOn, notes: p.notes, ranged: p.ranged, pierce: p.pierce, guard: p.guard, brace: p.brace });

function support(b: Battle, key: SideKey, action: BattleAction, ev: BattleEvent[]) {
  const side = b.sides[key];
  const foeKey = other(key);
  const foe = b.sides[foeKey];
  const sq = activeSquad(side);
  if (action.kind === "item") {
    const it = ITEMS[action.id];
    side.bag[action.id]! -= 1;
    side.itemsUsed += 1;
    if (it.heal) {
      const h = heal(b, sq, it.heal);
      emit(b, ev, { t: "heal", side: key, squad: sq.id, amount: h.add, revived: h.revived, text: `${squadLabel(sq)} recovered ${h.add}${h.revived ? ` (${h.revived} back on their feet)` : ""}.` });
    }
    if (it.cure) {
      for (const s of side.squads) for (const k of ["staggered", "shaken", "charmed", "dazzled", "burning", "exposed"] as StatusId[]) delete s.status[k];
      emit(b, ev, { t: "cure", side: key, text: `${sideLabel(b, key)} shook off every bad status.` });
    }
    if (it.team) {
      for (const s of side.squads) if (alive(s)) setStatus(s, it.team, 1);
      emit(b, ev, { t: "status", side: key, squad: null, status: it.team, turns: 1, text: `${sideLabel(b, key)} is Hyped for next round!` });
    }
    if (it.smoke) {
      foe.flags.smokedRound = b.round + 1;
      side.flags.noChase = true;
      emit(b, ev, { t: "say", fx: "smoke", side: key, text: `Smoke fills the field. ${sideLabel(b, foeKey)} will roll 1 fewer die next round.` });
    }
    if (it.hazard) {
      foe.hazard += it.hazard;
      emit(b, ev, { t: "say", fx: "caltrops", side: key, text: `Caltrops scattered! Every squad of ${sideLabel(b, foeKey)} that steps in takes ${it.hazard}.` });
    }
    if (it.hire) {
      const n = it.hire;
      const s = addUnits(side, "nacam", n);
      emit(b, ev, { t: "reinforce", side: key, squad: s.id, unit: "nacam", count: n, text: `${n} mercenary ogres answered the horn and joined ${sideLabel(b, key)}.` });
    }
    if (it.bribe) {
      const roll = d6(b);
      const n = Math.ceil(roll / 2);
      const target = activeSquad(foe);
      const gone = Math.min(n, target.count);
      applyDamage(target, gone * target.hpPer);
      target.lost -= gone; // they went home, they didn't fall
      emit(b, ev, { t: "bribe", side: key, roll, count: gone, squad: target.id, text: `The bribe (🎲 ${roll}) worked on ${gone} of ${NATIVE_NAMES[foe.native!]}. They went home richer.` });
    }
    return;
  }
  if (action.kind !== "move") return;
  const m = MOVE_BY_ID[action.id];
  pay(side, moveCost(b, m));
  if (m.tags.includes("once")) side.used[m.id] = true;
  if (m.tags.includes("reload")) side.flags.catapultRound = b.round;
  if (m.heal) {
    const h = heal(b, sq, m.heal);
    emit(b, ev, { t: "heal", side: key, squad: sq.id, amount: h.add, revived: h.revived, text: `${squadLabel(sq)} recovered ${h.add}${h.revived ? ` (${h.revived} back on their feet)` : ""}.` });
  }
  if (m.healTeam) {
    for (const s of side.squads) if (alive(s)) heal(b, s, m.healTeam);
    emit(b, ev, { t: "heal", side: key, squad: null, amount: m.healTeam, revived: 0, text: `Every squad of ${sideLabel(b, key)} recovered ${m.healTeam}.` });
  }
  if (m.revive) {
    const h = heal(b, sq, sq.hpPer * m.revive);
    emit(b, ev, { t: "heal", side: key, squad: sq.id, amount: h.add, revived: h.revived, text: h.revived ? `${h.revived} napping panda got back up!` : "Everyone was already awake." });
  }
  if (m.reinforce) {
    sq.count += m.reinforce;
    sq.maxCount += m.reinforce;
    sq.hp += m.reinforce * sq.hpPer;
    emit(b, ev, { t: "reinforce", side: key, squad: sq.id, unit: sq.unit, count: m.reinforce, text: `${m.reinforce} cubs tumbled out of the sanctuary to help!` });
  }
  if (m.hire) {
    const s = addUnits(side, "nacam", m.hire);
    emit(b, ev, { t: "reinforce", side: key, squad: s.id, unit: "nacam", count: m.hire, text: `${m.hire} ogres took the Warlord's coin and joined the fight.` });
  }
  if (m.cable) {
    const s = addUnits(side, "armedPanda", m.cable);
    emit(b, ev, { t: "reinforce", side: key, squad: s.id, unit: "armedPanda", count: m.cable, text: `${m.cable} Armed Pandas slid in on the gondola cable!` });
  }
  if (m.cutLine) {
    if (key === "atk") side.flags.noChase = true;
    else foe.flags.trappedUntil = b.round + 2;
    emit(b, ev, { t: "say", fx: "cable", side: key, text: key === "atk" ? "The Piecer Captain cut the line behind them. Nobody can chase a retreat now." : "The Piecer Captain cut the gondola line. The invaders can't retreat for 2 rounds." });
  }
  if (m.smite) {
    side.thunderCharged = false;
    const order: UnitId[] = ["cam", "armedPanda", "nacam", "panda"];
    const killed: Record<string, number> = {};
    let left = m.smite;
    while (left > 0) {
      const sqs = foe.squads.filter((s) => alive(s) && !s.hero);
      const t = order.map((u) => sqs.find((s) => s.unit === u)).find(Boolean);
      if (!t) break;
      applyDamage(t, t.hp - (t.count - 1) * t.hpPer);
      killed[t.id] = (killed[t.id] || 0) + 1;
      left -= 1;
    }
    emit(b, ev, { t: "smite", side: key, killed, text: "⚡ Thunder! The sky took three of their strongest." });
  }
  if (m.ends === "truce") {
    emit(b, ev, { t: "say", fx: "hearts", side: key, text: "Tea is poured. Both sides lower their weapons." });
    finish(b, "truce", ev);
  }
}

// Free reactions after the roll: Lucky Gem, Chance Cube Blessing, the Josserkid's Loaded Dice.
export function reactionsFor(b: Battle, key: SideKey): ReactionOption[] {
  const P = b.pending;
  if (!P || P.done || P.used[key]) return [];
  const side = b.sides[key];
  const out: ReactionOption[] = [];
  for (const id of ["luckyGem", "blessing"] as const) if (hasItem(side, id) && withinBudget(side)) out.push({ id, label: ITEMS[id].label, icon: ITEMS[id].icon, text: ITEMS[id].text, count: side.bag[id], needsDie: id === "luckyGem" });
  if (side.squads.some((s) => s.hero === "josserkid" && alive(s)) && !side.used.loadedDice) out.push({ id: "loadedDice", label: "Loaded Dice", icon: "🃏", text: "The Josserkid turns one of your dice to a 6. Once per battle.", needsDie: true });
  return out;
}

export function react(b: Battle, key: SideKey, id: ReactionId, die = 0): BattleEvent | null {
  const P = b.pending!;
  const side = b.sides[key];
  const vals = P.dice[key]!;
  P.used[key] = true;
  if (id === "luckyGem") {
    side.bag.luckyGem! -= 1;
    side.itemsUsed += 1;
    const from = vals[die];
    const to = d6(b);
    vals[die] = to;
    const e: BattleEvent = { t: "reroll", side: key, item: id, die, from, to, text: `${sideLabel(b, key)} threw a Lucky Gem: ${from} became ${to}.` };
    P.rerolls.push(e);
    emit(b, P.events, e);
    return e;
  }
  if (id === "loadedDice") {
    side.used.loadedDice = true;
    const from = vals[die];
    vals[die] = 6;
    const e: BattleEvent = { t: "reroll", side: key, item: id, die, from, to: 6, text: `🃏 The Josserkid palmed a die. ${from} became 6.` };
    P.rerolls.push(e);
    emit(b, P.events, e);
    return e;
  }
  if (id === "blessing") {
    side.bag.blessing! -= 1;
    side.itemsUsed += 1;
    P.blessing[key] = true;
    const e: BattleEvent = { t: "blessing", side: key, text: `🎲 The Chance Cube Blessing: ties go to ${sideLabel(b, key)} this round.` };
    emit(b, P.events, e);
    return e;
  }
  return null;
}

// The computer side decides whether to spend a reaction on its dice.
export function aiReact(b: Battle, key: SideKey): BattleEvent | null {
  const P = b.pending;
  if (!P || P.used[key]) return null;
  const side = b.sides[key];
  const doc = DOCTRINES[side.doctrine] || DOCTRINES.counter;
  const opts = reactionsFor(b, key);
  if (!opts.length) return null;
  const pairs = pairUp(b, P);
  const lost = pairs.filter((p) => p.win !== key);
  if (!lost.length) return null;
  const idx = key === "atk" ? "ai" : "di";
  const dice = P.dice[key]!;
  const worst = lost.map((p) => p[idx]).sort((x, y) => dice[x] - dice[y])[0];
  const eager = doc.weights.items >= 1.2 || lost.length >= 2;
  if (opts.some((o) => o.id === "loadedDice")) return react(b, key, "loadedDice", worst);
  const ties = lost.filter((p) => p.tie).length;
  if (ties && opts.some((o) => o.id === "blessing") && (eager || ties >= 2)) return react(b, key, "blessing");
  if (opts.some((o) => o.id === "luckyGem") && (eager || dice[worst] <= 2)) return react(b, key, "luckyGem", worst);
  return null;
}

function sortIdx(vals: number[], bonus: number) {
  return vals.map((_, i) => i).sort((x, y) => vals[y] + bonus - (vals[x] + bonus) || vals[y] - vals[x]);
}

type PairInput = { plans: { atk?: Plan; def?: Plan }; dice: { atk?: number[]; def?: number[] }; blessing: { atk: boolean; def: boolean } };

export function tieWinner(b: Battle, P: PairInput): SideKey {
  const A = P.plans.atk!;
  const D = P.plans.def!;
  if (D.losesTies && !A.losesTies) return "atk";
  if (A.losesTies && !D.losesTies) return "def";
  const aClaim = P.blessing.atk || A.winsTies;
  const dClaim = P.blessing.def || D.winsTies;
  if (aClaim && !dClaim) return "atk";
  return "def";
}

function pairUp(b: Battle, P: PairInput): Pair[] {
  const A = P.plans.atk!;
  const D = P.plans.def!;
  const atkDice = P.dice.atk!;
  const defDice = P.dice.def!;
  const aBonus = A.bonus - (D.pierce ? A.pierceable : 0);
  const dBonus = D.bonus - (A.pierce ? D.pierceable : 0);
  const ai = sortIdx(atkDice, aBonus);
  const di = sortIdx(defDice, dBonus);
  const tw = tieWinner(b, P);
  const n = Math.min(ai.length, di.length);
  const pairs: Pair[] = [];
  for (let i = 0; i < n; i++) {
    const aRaw = atkDice[ai[i]];
    const dRaw = defDice[di[i]];
    const a = aRaw + aBonus;
    const d = dRaw + dBonus;
    const win: SideKey = a > d ? "atk" : a < d ? "def" : tw;
    const raw = win === "atk" ? aRaw : dRaw;
    const crit = raw >= (win === "atk" ? A.critOn : D.critOn);
    pairs.push({ ai: ai[i], di: di[i], aRaw, dRaw, a, d, win, tie: a === d, crit });
  }
  return pairs;
}

export function finishRound(b: Battle): BattleEvent[] {
  const P = b.pending;
  if (!P) throw new Error("No round in progress.");
  if (P.done) {
    b.log.push({ round: P.round, actions: P.actions, dice: { atk: [...(P.dice.atk || [])], def: [...(P.dice.def || [])] }, plans: {}, events: P.events.slice() });
    b.pending = null;
    return P.events;
  }
  const ev = P.events;
  const start = ev.length;
  const pairs = pairUp(b, P);
  emit(b, ev, { t: "pairs", pairs, tieWinner: tieWinner(b, P), bonus: { atk: P.plans.atk!.bonus, def: P.plans.def!.bonus } });

  const wins = { atk: pairs.filter((p) => p.win === "atk"), def: pairs.filter((p) => p.win === "def") };
  const hitTargets = {} as Record<SideKey, Squad>;
  // Both sides' damage is worked out from the same moment, then applied together.
  const dmg = {} as Record<SideKey, { amount: number; mult: number; crits: number; hits: number; decoy: boolean } | null>;
  for (const key of SIDES) {
    const plan = P.plans[key]!;
    const foeKey = other(key);
    const me = activeSquad(b.sides[key]);
    const target = activeSquad(b.sides[foeKey]);
    hitTargets[key] = target;
    const w = wins[key];
    if (!w.length || !plan.power) {
      dmg[key] = null;
      continue;
    }
    const mult = typeMult(me.type, target.type);
    const foePlan = P.plans[foeKey]!;
    let total = 0;
    let crits = 0;
    for (const p of w) {
      let d = plan.power * mult;
      if (p.crit) {
        d *= R.critMult;
        crits += 1;
      }
      if (hasStatus(target, "enraged") || hasStatus(target, "exposed")) d *= R.enragedTaken;
      if (foePlan.ranged) d *= R.rangedTaken;
      d *= foePlan.brace;
      if (foePlan.decoy) d = 0;
      total += d;
    }
    dmg[key] = { amount: Math.round(total), mult, crits, hits: w.length, decoy: foePlan.decoy };
  }
  for (const key of SIDES) {
    const d = dmg[key];
    if (!d) continue;
    const foeKey = other(key);
    const target = hitTargets[key];
    const fell = applyDamage(target, d.amount);
    const eff = d.mult > 1 ? "super" : d.mult < 1 ? "resist" : null;
    emit(b, ev, {
      t: "damage",
      side: foeKey,
      squad: target.id,
      amount: d.amount,
      fell,
      eff,
      hits: d.hits,
      crits: d.crits,
      by: key,
      text: d.decoy ? "A decoy took the hit!" : `${d.hits} hit${d.hits === 1 ? "" : "s"} on ${target.name}: -${d.amount}.${fell ? ` ${fell} ${fell === 1 ? "fell" : "fell"}.` : ""}`,
    });
  }

  // Momentum: one per pair won (Casey's side builds it twice as fast during a Casey Sighting).
  for (const key of SIDES) {
    const side = b.sides[key];
    const rate = eventOn(b, "caseySale") && side.squads.some((s) => s.hero === "casey" && alive(s)) ? 2 : 1;
    const before = side.momentum;
    side.momentum = clamp(side.momentum + wins[key].length * rate, 0, R.momentumMax);
    const m = P.plans[key]!.move;
    if (m && m.kind === "signature") side.momentum = 0;
    if (side.momentum !== before) emit(b, ev, { t: "momentum", side: key, value: side.momentum });
  }

  // Effects of each side's move.
  for (const key of SIDES) {
    const plan = P.plans[key]!;
    const m = plan.move;
    const side = b.sides[key];
    const foeKey = other(key);
    const foe = b.sides[foeKey];
    const me = activeSquad(side);
    const target = hitTargets[key];
    const won = wins[key].length > 0;
    const vals = P.dice[key]!;
    const counts: Record<number, number> = {};
    for (const v of vals) counts[v] = (counts[v] || 0) + 1;
    const doubles = Object.values(counts).some((n) => n >= 2);
    const triples = Object.values(counts).some((n) => n >= 3);
    const crit = wins[key].some((p) => p.crit);
    const fires = (on: string) => on === "always" || (on === "win" && won) || (on === "doubles" && doubles) || (on === "triples" && triples) || (on === "crit" && crit);
    if (!m) continue;
    if (m.healOnWin && won && alive(me)) {
      const h = heal(b, me, m.healOnWin);
      if (h.add) emit(b, ev, { t: "heal", side: key, squad: me.id, amount: h.add, revived: h.revived, text: `${me.name} rolled it off (+${h.add}).` });
    }
    if (m.lifesteal && won && alive(me)) {
      const h = heal(b, me, m.lifesteal * wins[key].length);
      if (h.add) emit(b, ev, { t: "heal", side: key, squad: me.id, amount: h.add, revived: h.revived, text: `${me.name} recovered ${h.add} in the pile-on.` });
    }
    if (m.recoil && alive(me)) {
      const fell = applyDamage(me, m.recoil);
      emit(b, ev, { t: "damage", side: key, squad: me.id, amount: m.recoil, fell, eff: null, hits: 0, crits: 0, source: "recoil", text: `${me.name} took ${m.recoil} from the landing.` });
    }
    if (m.splash && fires(m.splashOn || "always")) {
      const others = foe.squads.filter((s) => alive(s) && s !== target);
      const list = m.id === "sweep" ? others.slice(0, 1) : others;
      for (const s of list) {
        const fell = applyDamage(s, m.splash);
        emit(b, ev, { t: "damage", side: foeKey, squad: s.id, amount: m.splash, fell, eff: null, hits: 0, crits: 0, source: "splash", text: `The blast reached ${s.name} (-${m.splash}).` });
      }
    }
    if (m.convert && won && target.unit !== "panda" && alive(target)) {
      setStatus(target, "charmed", 1);
      emit(b, ev, { t: "status", side: foeKey, squad: target.id, status: "charmed", turns: 1, text: `${target.name} ${target.count === 1 ? "is" : "are"} Charmed! 🥺` });
    }
    if (m.convert && won) {
      const pandas = target.unit === "panda" && alive(target) ? target : null;
      if (pandas) {
        const n = Math.min(wins[key].length, pandas.count);
        applyDamage(pandas, n * pandas.hpPer);
        pandas.lost -= n;
        addUnits(side, "panda", n);
        emit(b, ev, { t: "convert", side: key, count: n, from: pandas.id, text: `${n} panda${n === 1 ? "" : "s"} crossed over to ${sideLabel(b, key)}. Panda diplomacy!` });
      }
    }
    if (m.steal && won) {
      const loot = (Object.keys(foe.bag) as ItemId[]).find((k) => foe.bag[k]! > 0);
      if (loot) {
        foe.bag[loot]! -= 1;
        side.bag[loot] = (side.bag[loot] || 0) + 1;
        emit(b, ev, { t: "steal", side: key, item: loot, text: `🃏 Pickpocketed a ${ITEMS[loot].label} from ${sideLabel(b, foeKey)}!` });
      } else {
        const g = (["gems", "iron", "stone", "rice", "bamboo"] as GoodId[]).find((k) => foe.goods[k] > 0);
        if (g) {
          foe.goods[g] -= 1;
          side.goods[g] = (side.goods[g] || 0) + 1;
          emit(b, ev, { t: "steal", side: key, good: g, text: `🃏 Pickpocketed 1 ${GOODS[g].icon} from ${sideLabel(b, foeKey)}!` });
        } else emit(b, ev, { t: "say", text: "🃏 Their pockets were empty." });
      }
    }
    if (gearOf(me).some((w) => w.doublesStagger) && doubles && m.kind === "strike" && alive(target)) {
      setStatus(target, "staggered", 1);
      emit(b, ev, { t: "status", side: foeKey, squad: target.id, status: "staggered", turns: 1, text: `Doubles! The spiked club left ${target.name} Staggered.` });
    }
    for (const e of m.effects || []) {
      if (!fires(e.on)) continue;
      let list: Squad[] = [];
      if (e.to === "enemy") list = alive(target) ? [target] : [];
      else if (e.to === "self") list = alive(me) ? [me] : [];
      else if (e.to === "team") list = side.squads.filter(alive);
      else if (e.to === "brutes") list = side.squads.filter((s) => alive(s) && s.type === "brute");
      const toKey = e.to === "enemy" ? foeKey : key;
      for (const s of list) setStatus(s, e.status, e.turns);
      if (list.length) {
        const S = STATUSES[e.status];
        const who = list.length > 1 ? `Every squad of ${sideLabel(b, toKey)}` : list[0].name;
        emit(b, ev, { t: "status", side: toKey, squad: list.length === 1 ? list[0].id : null, status: e.status, turns: e.turns, text: `${who} ${list.length > 1 ? "is" : list[0].count === 1 ? "is" : "are"} ${S.label}! ${S.icon}` });
      }
    }
  }

  // End of round: burning, then statuses tick down (new ones start counting next round).
  for (const key of SIDES) {
    for (const s of b.sides[key].squads) {
      if (alive(s) && hasStatus(s, "burning") && !s.fresh.burning) {
        const fell = applyDamage(s, 5);
        emit(b, ev, { t: "damage", side: key, squad: s.id, amount: 5, fell, eff: null, hits: 0, crits: 0, source: "burning", text: `${s.name} burned (-5).` });
      }
      for (const k of Object.keys(s.status) as StatusId[]) {
        if (s.fresh[k]) continue;
        s.status[k]! -= 1;
        if (s.status[k]! <= 0) delete s.status[k];
      }
      s.fresh = {};
    }
  }

  for (const key of SIDES) if (!alive(activeSquad(b.sides[key]))) nextSquad(b, key, ev);
  checkEnd(b, ev);
  if (!b.over && b.round >= R.roundLimit) {
    emit(b, ev, { t: "say", text: `Round ${R.roundLimit}: the invasion stalls. The attackers head home.` });
    finish(b, "stalled", ev);
  }
  b.log.push({ round: P.round, actions: P.actions, dice: { atk: [...P.dice.atk!], def: [...P.dice.def!] }, plans: { atk: planSummary(P.plans.atk!), def: planSummary(P.plans.def!) }, events: ev.slice() });
  b.pending = null;
  return ev.slice(start);
}

function nextSquad(b: Battle, key: SideKey, ev: BattleEvent[]) {
  const side = b.sides[key];
  const sq = activeSquad(side);
  if (!alive(sq) && !sq.announcedFaint) {
    sq.announcedFaint = true;
    emit(b, ev, { t: "faint", side: key, squad: sq.id, text: sq.hero ? `${sq.name} was knocked out and fled the field!` : `${cap(possessive(b, key))} ${sq.name} are all down!` });
  }
  const next = side.squads.findIndex((s) => alive(s));
  if (next >= 0 && next !== side.active) {
    side.active = next;
    enter(b, key, ev);
    if (!alive(activeSquad(side))) nextSquad(b, key, ev);
  }
}

function checkEnd(b: Battle, ev: BattleEvent[]) {
  if (b.over) return true;
  const aLeft = b.sides.atk.squads.some(alive);
  const dLeft = b.sides.def.squads.some(alive);
  if (aLeft && dLeft) return false;
  finish(b, !dLeft && aLeft ? "won" : "held", ev);
  return true;
}

function finish(b: Battle, how: ResultHow, ev: BattleEvent[]) {
  b.over = true;
  const place = b.place;
  const text = {
    won: `${sideLabel(b, "atk")} took ${place}!`,
    held: `${sideLabel(b, "def")} held ${place}!`,
    retreat: `${sideLabel(b, "atk")} pulled back. ${sideLabel(b, "def")} held ${place}.`,
    truce: `A truce. ${sideLabel(b, "def")} keeps ${place}, and everyone goes home alive.`,
    stalled: `The invasion stalled. ${sideLabel(b, "def")} held ${place}.`,
  }[how];
  b.result = { how, winner: how === "won" ? "atk" : "def", text, rounds: b.round };
  emit(b, ev, { t: "end", how, winner: b.result.winner, text });
  if (b.pending) b.pending.done = true;
}

// ---------------------------------------------------------------- odds & the computer's choices

// Monte Carlo of one clash between two plans (no state changes). Used for move previews and the AI.
export function estimate(b: Battle, key: SideKey, action: BattleAction, foeAction: BattleAction, trials = 40, random: () => number = Math.random): Estimate {
  const foeKey = other(key);
  const plans = {} as Record<SideKey, Plan>;
  // Plan the switch-in with the incoming squad in place.
  const swap = (k: SideKey, a: BattleAction) => {
    if (a.kind !== "switch") return null;
    const s = b.sides[k];
    const prev = s.active;
    s.active = a.to;
    return () => (s.active = prev);
  };
  const undoA = swap(key, action);
  const undoB = swap(foeKey, foeAction);
  b.round += 1;
  plans[key] = planDice(b, key, action);
  plans[foeKey] = planDice(b, foeKey, foeAction);
  b.round -= 1;
  const me = activeSquad(b.sides[key]);
  const foe = activeSquad(b.sides[foeKey]);
  const multOut = typeMult(me.type, foe.type);
  const multIn = typeMult(foe.type, me.type);
  if (undoA) undoA();
  if (undoB) undoB();
  let dealt = 0;
  let taken = 0;
  let anyWin = 0;
  let winsSum = 0;
  const P: PairInput = { plans: { atk: plans.atk, def: plans.def }, dice: { atk: [], def: [] }, blessing: { atk: false, def: false } };
  for (let t = 0; t < trials; t++) {
    P.dice.atk = Array.from({ length: plans.atk.dice }, () => 1 + Math.floor(random() * 6));
    P.dice.def = Array.from({ length: plans.def.dice }, () => 1 + Math.floor(random() * 6));
    const pairs = pairUp(b, P);
    let w = 0;
    for (const p of pairs) {
      if (p.win === key) {
        w++;
        if (!plans[foeKey].decoy) dealt += plans[key].power * multOut * (p.crit ? R.critMult : 1) * (plans[foeKey].ranged ? R.rangedTaken : 1) * plans[foeKey].brace * (hasStatus(foe, "enraged") || hasStatus(foe, "exposed") ? R.enragedTaken : 1);
      } else if (!plans[key].decoy) taken += plans[foeKey].power * multIn * (p.crit ? R.critMult : 1) * (plans[key].ranged ? R.rangedTaken : 1) * plans[key].brace * (hasStatus(me, "enraged") || hasStatus(me, "exposed") ? R.enragedTaken : 1);
    }
    winsSum += w;
    if (w) anyWin++;
  }
  return { dealt: dealt / trials, taken: taken / trials, pAny: anyWin / trials, hits: winsSum / trials, plan: plans[key], foePlan: plans[foeKey], mult: multOut };
}

// What the other side probably does: its best plain Strike, or its first Guard if it can't strike.
export function likelyAction(b: Battle, key: SideKey): BattleAction {
  const g = actionsFor(b, key);
  const strikes = g.attack.filter((a) => a.enabled);
  const guards = g.defend.filter((a) => a.enabled);
  const side = b.sides[key];
  const doc = DOCTRINES[side.doctrine] || DOCTRINES.counter;
  if (guards.length && (doc.weights.guard > doc.weights.strike || !strikes.length)) return { kind: "move", id: guards[0].id };
  if (strikes.length) {
    const best = strikes.map((a) => a.move).sort((x, y) => y.dice * y.power - x.dice * x.power)[0];
    return { kind: "move", id: best.id };
  }
  const any = [...g.tactics, ...g.signature].find((a) => a.enabled);
  return any ? { kind: "move", id: any.id } : { kind: "item", id: "riceBall" };
}

export function preview(b: Battle, key: SideKey, action: BattleAction, random: () => number = Math.random): Estimate {
  const foeKey = other(key);
  return estimate(b, key, action, likelyAction(b, foeKey), 160, random);
}

// The computer's pick, flavoured by its standing orders (doctrine).
export function aiAction(b: Battle, key: SideKey): BattleAction {
  const side = b.sides[key];
  const foeKey = other(key);
  const foe = b.sides[foeKey];
  const doc = DOCTRINES[side.doctrine] || DOCTRINES.counter;
  const W = doc.weights;
  const me = activeSquad(side);
  const them = activeSquad(foe);
  const guess = likelyAction(b, foeKey);
  const hpRatio = me.hp / (me.maxCount * me.hpPer);
  const g = actionsFor(b, key);
  const ai = () => draw(b, "aiRng");
  const cands: (MoveOption | ItemOption | ActionGroups["squads"][number])[] = [];
  for (const list of [g.attack, g.defend, g.tactics, g.signature]) for (const a of list) if (a.enabled) cands.push(a);
  for (const a of g.bag) if (a.enabled && a.when === "action") cands.push(a);
  for (const a of g.squads) if (a.enabled && (W.switch || 0) > 0) cands.push(a);
  let best: { s: number; action: BattleAction } | null = null;
  for (const c of cands) {
    const action: BattleAction = c.kind === "move" ? { kind: "move", id: c.id } : c.kind === "item" ? { kind: "item", id: c.id } : { kind: "switch", to: c.to };
    const est = estimate(b, key, action, guess, 24, ai);
    let s = est.dealt - est.taken * 0.8;
    if (c.kind === "move") {
      const m = c.move;
      s += m.kind === "strike" ? W.strike : m.kind === "guard" ? W.guard : m.kind === "tactic" ? W.tactic : 10;
      if (W.dice) s += est.plan.dice * W.dice;
      for (const e of m.effects || []) {
        const S = STATUSES[e.status];
        const onEnemy = e.to === "enemy";
        const already = onEnemy ? hasStatus(them, e.status) : hasStatus(me, e.status);
        // Good for us: a bad status on them, or a good one on us. Enraged is a gamble only the bold doctrines like.
        const worth = S.good === null ? (W.strike >= 6 ? 3 : -1) : (S.good === false) === onEnemy ? 4.5 : -5;
        if (already && worth > 0) s -= 6;
        else s += worth * (e.on === "win" ? est.pAny : 1) * Math.min(3, e.turns || 1) * 0.8;
      }
      if (m.heal || m.revive || m.healTeam) s += hpRatio < 0.6 ? W.heal * (1 - hpRatio) * 2 : -8;
      if (m.ends === "truce") s += side.native ? -99 : hpRatio < 0.35 && W.tactic > 5 ? 20 : -20;
      if (m.convert) s += them.unit === "panda" ? 10 * est.pAny : 2;
      if (m.smite) s += 22;
      if (m.hire || m.cable || m.reinforce) s += 12;
      if (m.cutLine) s += key === "def" ? 3 : -4;
      if (m.decoy) s += est.taken * 0.8;
      if (m.steal) s += Object.values(foe.bag).some((n) => (n ?? 0) > 0) ? 3 : -2;
      const spend = Object.values(m.cost || {}).reduce((n: number, v) => n + (v ?? 0), 0);
      s -= spend * (2.2 - (W.items || 1));
    } else if (c.kind === "item") {
      const it = c.item;
      s += (W.items || 0) * 2 - 3;
      if (it.heal) s += hpRatio < 0.5 ? W.heal * 1.6 : -10;
      if (it.cure) s += (Object.keys(me.status) as StatusId[]).some((k) => STATUSES[k].good === false) ? 6 : -6;
      if (it.hire) s += 9;
      if (it.bribe) s += 6;
      if (it.hazard) s += foe.squads.filter(alive).length > 1 ? 3 : -8;
      if (it.smoke) s += 1;
    } else if (c.kind === "switch") {
      const incoming = c.squad;
      const adv = typeMult(incoming.type, them.type) - typeMult(me.type, them.type);
      const risk = typeMult(them.type, incoming.type) - typeMult(them.type, me.type);
      s += (adv * 14 - risk * 10 + (incoming.hp / (incoming.maxCount * incoming.hpPer) - hpRatio) * 4) * (W.switch || 0) - 4;
    }
    s += (ai() - 0.5) * 2.5;
    if (!best || s > best.s) best = { s, action };
  }
  if (!best) return { kind: "item", id: "riceBall" };
  // Prep items: the bold doctrines sharpen up before a big swing.
  if (best.action.kind === "move" && withinBudget(side)) {
    const m = MOVE_BY_ID[best.action.id];
    if ((W.items || 0) >= 1.2 && m.power >= 12 && hasItem(side, "whetstone")) best.action.prep = "whetstone";
    else if ((W.items || 0) >= 1.2 && hasItem(side, "gemFocus")) best.action.prep = "gemFocus";
  }
  return best.action;
}

// Fight a whole round for two computer-picked (or given) actions. Handy for auto-battle and replays.
export function autoRound(b: Battle, atkAction?: BattleAction | null, defAction?: BattleAction | null): Pending {
  const a = atkAction || aiAction(b, "atk");
  const d = defAction || aiAction(b, "def");
  const P = beginRound(b, a, d);
  if (!P.done) {
    aiReact(b, "atk");
    aiReact(b, "def");
  }
  finishRound(b);
  return P;
}

export function summary(b: Battle): BattleSummary {
  const out = {} as BattleSummary;
  for (const key of SIDES) {
    const s = b.sides[key];
    const tally = (f: (q: Squad) => number) => {
      const m: Partial<Record<UnitId, number>> = {};
      for (const q of s.squads) if (!q.hero) m[q.unit!] = (m[q.unit!] || 0) + f(q);
      return m;
    };
    out[key] = {
      name: sideLabel(b, key),
      survivors: tally((q) => q.count),
      lost: tally((q) => q.lost),
      heroes: s.squads.filter((q) => q.hero).map((q) => ({ hero: q.hero!, standing: alive(q) })),
      spent: { ...s.spent },
      luck: 0,
    };
  }
  // Dice luck: average of every die each side threw.
  const all: Record<SideKey, number[]> = { atk: [], def: [] };
  for (const r of b.log) for (const k of SIDES) all[k].push(...((r.dice && r.dice[k]) || []));
  for (const k of SIDES) out[k].luck = all[k].length ? all[k].reduce((a, c) => a + c, 0) / all[k].length : 0;
  return out;
}

// The pairs as they stand right now, before anyone resolves the round (for "use a reaction?" prompts).
export const pairsNow = (b: Battle): Pair[] => (b.pending && !b.pending.done ? pairUp(b, b.pending) : []);

// Everything above under one name, the way the prototype pages call it (Battle.actionsFor(b, "atk")).
export const BattleEngine = {
  createBattle,
  validate,
  pairsNow,
  tieWinner,
  moveCost,
  gearOf,
  actionsFor,
  planDice,
  beginRound,
  reactionsFor,
  react,
  aiReact,
  finishRound,
  aiAction,
  autoRound,
  preview,
  estimate,
  likelyAction,
  summary,
  squadStats,
  activeSquad,
  sideLabel,
  possessive,
  squadLabel,
  costText,
  movesOf,
  mulberry,
};
