// Panda Diplomacy battle engine: pure rules over a plain object, no rendering. Needs CODEX in scope.
// A round: both sides pick an action, support effects happen, both sides roll together, dice pair off
// highest against highest (ties go to the defender, as in Risk), and every pair a side wins deals its move's power.
const Battle = (() => {
  const C = CODEX;
  const R = C.RULES;
  const other = (k) => (k === "atk" ? "def" : "atk");
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function mulberry(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const costText = (c) =>
    Object.entries(c || {})
      .filter(([, n]) => n)
      .map(([g, n]) => `${n} ${C.GOODS[g].icon}`)
      .join(" ");

  // ---------------------------------------------------------------- setup

  function makeSquad(key, spec, i) {
    if (spec.hero) {
      const h = C.HEROES[spec.hero];
      return { id: `${key}${i}`, hero: spec.hero, unit: null, kind: spec.hero, name: h.name, icon: h.icon, type: "legend", count: 1, maxCount: 1, hpPer: h.hp, hp: h.hp, gear: [], status: {}, fresh: {}, lost: 0 };
    }
    const u = C.UNITS[spec.unit];
    return { id: `${key}${i}`, hero: null, unit: spec.unit, kind: spec.unit, name: u.plural, icon: u.icon, type: u.type, count: spec.count, maxCount: spec.count, hpPer: u.hp, hp: spec.count * u.hp, gear: spec.gear || (spec.weapon ? [spec.weapon] : []), status: {}, fresh: {}, lost: 0 };
  }

  function makeSide(key, cfg) {
    const specs = [...(cfg.squads || [])];
    if (cfg.hero) specs.push({ hero: cfg.hero });
    const squads = specs.filter((s) => s.hero || s.count > 0).map((s, i) => makeSquad(key, s, i));
    return {
      key,
      name: cfg.name,
      color: cfg.color || "#888",
      native: cfg.native || null,
      player: Boolean(cfg.player),
      doctrine: cfg.doctrine || (cfg.native ? C.NATIVE_DOCTRINE[cfg.native] : "counter"),
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
    };
  }

  function createBattle(cfg) {
    const b = {
      cfg,
      seed: cfg.seed ?? 1,
      rand: mulberry(cfg.seed ?? 1),
      ai: mulberry((cfg.seed ?? 1) * 7919 + 13),
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
      opening: null,
    };
    b.opening = eventLog(b);
    const d = b.sides.def;
    const a = b.sides.atk;
    // Standing orders can lay caltrops before anyone arrives.
    if ((cfg.def.traps || []).includes("caltrops")) a.hazard += C.ITEMS.caltrops.hazard;
    if (b.buildings.includes("gym")) for (const s of d.squads) if (s.unit === "cam") setStatus(s, "focused", 1, false);
    b.opening.push({ t: "say", text: `${a.name} rode the gondola into ${b.place}. ${defenderName(b)} ${d.name === "You" ? "stand" : "stands"} ready.` });
    enter(b, "atk", b.opening, true);
    enter(b, "def", b.opening, true);
    return b;
  }

  function defenderName(b) {
    const d = b.sides.def;
    return d.native ? C.NATIVE_NAMES[d.native].replace(/^the /, "The ") : d.name;
  }

  // ---------------------------------------------------------------- queries

  const alive = (s) => s.hp > 0;
  // What a display needs to show a squad right after an event.
  const snap = (sq) => ({ id: sq.id, unit: sq.unit, hero: sq.hero, kind: sq.kind, name: sq.name, type: sq.type, hp: sq.hp, count: sq.count, maxCount: sq.maxCount, hpPer: sq.hpPer, gear: [...(sq.gear || [])] });
  const activeSquad = (side) => side.squads[side.active];
  const hasStatus = (sq, k) => (sq.status[k] || 0) > 0;
  const heroAura = (side) => side.squads.filter((s) => s.hero && alive(s)).reduce((n, s) => n + C.HEROES[s.hero].aura, 0);
  const eventOn = (b, k) => b.events.includes(k);
  const canPay = (side, cost) => Object.entries(cost || {}).every(([g, n]) => (side.goods[g] || 0) >= n);
  function pay(side, cost) {
    for (const [g, n] of Object.entries(cost || {})) {
      side.goods[g] -= n;
      side.spent[g] = (side.spent[g] || 0) + n;
    }
  }

  function squadStats(b, side, sq) {
    let atk = sq.hero ? C.HEROES[sq.hero].atk : C.UNITS[sq.unit].atk;
    let def = sq.hero ? C.HEROES[sq.hero].def : C.UNITS[sq.unit].def;
    for (const w of gearOf(sq)) {
      atk += w.atk || 0;
      def += w.def || 0;
    }
    const aura = heroAura(side);
    const fort = side.key === "def" && b.buildings.includes("fort") ? 1 : 0;
    return { atk: atk + aura + fort, def: def + aura + fort, aura, fort };
  }

  const gearOf = (sq) => (sq.gear || []).map((g) => C.WEAPONS[g]).filter(Boolean);

  // Moves this squad knows: its own list, its gear's moves, the army catapult.
  function movesOf(side, sq) {
    const out = C.MOVES.filter((m) => m.user === sq.kind);
    for (const w of gearOf(sq)) if (w.move && !out.includes(C.MOVE_BY_ID[w.move])) out.push(C.MOVE_BY_ID[w.move]);
    if (side.catapult && side.key === "atk") out.push(C.MOVE_BY_ID.boulderBarrage);
    return out;
  }

  // What a move costs right now (the Mercenary Market takes 1 Coin off per hired ogre).
  function moveCost(b, m) {
    if (m.hire && eventOn(b, "mercMarket")) return { ...m.cost, coin: Math.max(0, (m.cost.coin || 0) - m.hire) };
    return m.cost;
  }

  function moveBlocked(b, side, sq, m) {
    if (m.kind === "signature" && side.momentum < R.momentumMax) return `Needs ${R.momentumMax} Momentum`;
    if (m.kind === "strike" && hasStatus(sq, "charmed")) return "Charmed: no Strikes";
    if (m.tags.includes("once") && side.used[m.id]) return "Used this battle";
    if (m.needs && !(side.key === "def" && b.buildings.includes(m.needs))) return `Only defending a ${C.BUILDINGS[m.needs].label}`;
    if (m.element === "bamboo" && eventOn(b, "blight")) return "Bamboo Blight";
    if (m.tags.includes("reload") && b.round + 1 - side.flags.catapultRound < 2) return "Reloading";
    if (m.id === "thunderCall" && !side.thunderCharged) return "Thunder isn't charged";
    if (m.id === "cableDrop" && eventOn(b, "gondolaStrike")) return "Gondola Strike";
    if (m.id === "pandaDiplomacy" && !b.sides[other(side.key)].squads.some((s) => alive(s))) return "Nobody to talk to";
    if (!canPay(side, moveCost(b, m))) return `Needs ${costText(moveCost(b, m))}`;
    return null;
  }

  function itemBlocked(b, side, id) {
    const it = C.ITEMS[id];
    if (!(side.bag[id] > 0)) return "None left";
    if (id === "bribe" && !b.sides[other(side.key)].native) return "Natives only";
    if (id === "smokeBomb" && eventOn(b, "blight")) return "Bamboo Blight";
    if (id === "caltrops" && side.key === "atk" && b.sides.def.squads.every((s) => !alive(s) || s === activeSquad(b.sides.def))) return "No one left to step in";
    void it;
    return null;
  }

  // Everything a side could do this round, grouped the way the menus show it.
  function actionsFor(b, key) {
    const side = b.sides[key];
    const sq = activeSquad(side);
    const groups = { attack: [], defend: [], tactics: [], signature: [], bag: [], squads: [], retreat: [] };
    for (const m of movesOf(side, sq)) {
      const blocked = moveBlocked(b, side, sq, m);
      const g = m.kind === "strike" ? "attack" : m.kind === "guard" ? "defend" : m.kind === "tactic" ? "tactics" : "signature";
      groups[g].push({ kind: "move", id: m.id, move: m, enabled: !blocked, reason: blocked });
    }
    for (const id of Object.keys(C.ITEMS)) {
      if (!(side.bag[id] > 0)) continue;
      const it = C.ITEMS[id];
      const blocked = itemBlocked(b, side, id);
      groups.bag.push({ kind: "item", id, item: it, when: it.when, enabled: !blocked, reason: blocked, count: side.bag[id] });
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

  function planDice(b, key, action) {
    const side = b.sides[key];
    const sq = activeSquad(side);
    const st = squadStats(b, side, sq);
    const T = C.TERRAIN[b.terrain];
    const p = { key, action, dice: 0, bonus: 0, power: 0, critOn: R.critOn, ranged: false, pierce: false, guard: false, brace: 1, winsTies: false, losesTies: false, decoy: false, pierceable: 0, type: sq.type, move: null, notes: [] };
    const note = (label, value) => p.notes.push({ label, value });
    let base = 0;
    let stat = "def";
    const m = action.kind === "move" ? C.MOVE_BY_ID[action.id] : null;
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
    if (hasStatus(sq, "staggered")) (base -= 1), note("Staggered", "-1 die");
    if (hasStatus(sq, "focused")) (base += 1), note("Focused", "+1 die");
    if (hasStatus(sq, "shaken")) (p.bonus -= 1), note("Shaken", "-1");
    if (hasStatus(sq, "enraged")) (p.bonus += 1), note("Enraged", "+1");
    if (hasStatus(sq, "hyped")) (p.bonus += 1), note("Hyped", "+1");
    if (hasStatus(sq, "dazzled")) {
      p.critOn = 99;
      p.losesTies = true;
      note("Dazzled", "no crits");
    }
    if (side.flags.smokedRound === b.round) (base -= 1), note("Smoke", "-1 die");
    if (key === "def" && b.round === 1 && b.terrain === "bamboo") (base += 1), note("Ambush", "+1 die");
    if (action.prep === "gemFocus") (base += 1), note("Gem Focus", "+1 die");
    if (action.prep === "whetstone" && p.power) (p.power += C.ITEMS.whetstone.power), note("Whetstone", "+4 power");
    p.dice = clamp(base, R.minDice, R.maxDice);
    return p;
  }

  // ---------------------------------------------------------------- statuses & HP

  function setStatus(sq, k, turns, fresh = true) {
    sq.status[k] = Math.max(sq.status[k] || 0, turns);
    if (fresh) sq.fresh[k] = true;
  }

  function applyDamage(sq, amount) {
    const before = sq.count;
    sq.hp = Math.max(0, sq.hp - amount);
    sq.count = sq.hp <= 0 ? 0 : Math.ceil(sq.hp / sq.hpPer);
    const fell = before - sq.count;
    sq.lost += fell;
    return fell;
  }

  function heal(b, sq, amount) {
    if (!alive(sq)) return 0;
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

  function addUnits(side, unit, n) {
    let sq = side.squads.find((s) => s.unit === unit && alive(s));
    if (!sq) {
      sq = makeSquad(side.key, { unit, count: 0 }, side.squads.length);
      sq.hp = 0;
      side.squads.push(sq);
    }
    sq.count += n;
    sq.maxCount += n;
    sq.hp += n * sq.hpPer;
    sq.name = C.UNITS[unit].plural;
    return sq;
  }

  // A squad steps into the fight (the first one, a switch, or the next in line after a wipe).
  function enter(b, key, ev, opening = false) {
    const side = b.sides[key];
    const sq = activeSquad(side);
    ev.push({ t: "enter", side: key, squad: sq.id, text: opening ? `${cap(sideLabel(b, key))} ${verb(b, key, "lead", "leads")} with ${squadLabel(sq)}.` : `${squadLabel(sq)} step${sq.count === 1 ? "s" : ""} up for ${sideLabel(b, key) === "You" ? "you" : sideLabel(b, key)}.` });
    if (side.hazard > 0 && alive(sq)) {
      const fell = applyDamage(sq, side.hazard);
      ev.push({ t: "damage", side: key, squad: sq.id, amount: side.hazard, fell, eff: null, hits: 0, crits: 0, source: "caltrops", text: `${squadLabel(sq)} stepped on caltrops! (-${side.hazard})` });
    }
  }

  function squadLabel(sq) {
    return sq.hero ? sq.name : `${sq.count} ${sq.count === 1 ? (sq.unit ? C.UNITS[sq.unit].label : sq.name) : sq.name}`;
  }
  function sideLabel(b, key) {
    const s = b.sides[key];
    if (s.native) return C.NATIVE_NAMES[s.native];
    return s.name;
  }
  // "Your Ogres", "Mei's Ogres", "the Panda Nation's Pandas"
  function possessive(b, key) {
    const n = sideLabel(b, key);
    if (n === "You") return "Your";
    return n.endsWith("s") ? `${n}'` : `${n}'s`;
  }
  // "You lead", "Mei leads"
  const verb = (b, key, plural, singular) => (sideLabel(b, key) === "You" ? plural : singular);

  // ---------------------------------------------------------------- the round

  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function describe(b, key, action) {
    const sq = activeSquad(b.sides[key]);
    const who = sq.hero ? sq.name : `${cap(possessive(b, key))} ${sq.name}`;
    const name = cap(sideLabel(b, key));
    if (action.kind === "move") return `${who} used ${C.MOVE_BY_ID[action.id].name.toUpperCase()}!`;
    if (action.kind === "item") return `${name} used ${C.ITEMS[action.id].icon} ${C.ITEMS[action.id].label}.`;
    if (action.kind === "switch") return `${name} pulled back ${sq.name}.`;
    if (action.kind === "retreat") return `${name} sounded the retreat!`;
    return "";
  }

  // What a client sends is checked against what the side could really do right now.
  function validate(b, key, a) {
    if (!a || !a.kind) throw new Error("Pick something to do.");
    const g = actionsFor(b, key);
    const ok = (list, pred) => list.some((x) => x.enabled && pred(x));
    let fine = false;
    if (a.kind === "move") fine = ok([...g.attack, ...g.defend, ...g.tactics, ...g.signature], (x) => x.id === a.id);
    else if (a.kind === "item") fine = ok(g.bag, (x) => x.id === a.id && x.when === "action");
    else if (a.kind === "switch") fine = ok(g.squads, (x) => x.to === a.to);
    else if (a.kind === "retreat") fine = ok(g.retreat, () => true);
    if (!fine) throw new Error(`${sideLabel(b, key)} can't do that right now.`);
    if (a.prep && !(b.sides[key].bag[a.prep] > 0 && C.ITEMS[a.prep] && C.ITEMS[a.prep].when === "prep")) throw new Error("That item isn't in the bag.");
  }

  function beginRound(b, atkAction, defAction) {
    if (b.over) throw new Error("The battle is over.");
    validate(b, "atk", atkAction);
    validate(b, "def", defAction);
    b.round += 1;
    const ev = eventLog(b);
    const P = { round: b.round, actions: { atk: atkAction, def: defAction }, plans: {}, dice: {}, rerolls: [], used: { atk: false, def: false }, blessing: { atk: false, def: false }, events: ev, done: false };
    b.pending = P;
    const A = b.sides.atk;
    const D = b.sides.def;

    // Prep items are paid for up front.
    for (const key of ["atk", "def"]) {
      const a = P.actions[key];
      if (a.prep && b.sides[key].bag[a.prep] > 0) {
        const side = b.sides[key];
        side.bag[a.prep] -= 1;
        ev.push({ t: "item", side: key, item: a.prep, text: `${sideLabel(b, key)} used ${C.ITEMS[a.prep].icon} ${C.ITEMS[a.prep].label}.` });
      } else if (a.prep) delete a.prep;
    }

    // Retreat: the attackers pull out, and the defenders get a parting shot unless the line was cut or smoked.
    if (atkAction.kind === "retreat") {
      ev.push({ t: "use", side: "atk", action: atkAction, text: describe(b, "atk", atkAction) });
      if (!A.flags.noChase) {
        const shot = R.retreatShot;
        const vals = Array.from({ length: shot.dice }, () => 1 + Math.floor(b.rand() * 6));
        const hits = vals.filter((v) => v >= shot.hitOn).length;
        const sq = activeSquad(A);
        ev.push({ t: "roll", atk: [], def: vals, plans: null, text: "Parting shot!" });
        if (hits) {
          const fell = applyDamage(sq, hits * shot.damage);
          ev.push({ t: "damage", side: "atk", squad: sq.id, amount: hits * shot.damage, fell, eff: null, hits, crits: 0, text: `The parting shot caught ${squadLabel(sq) || sq.name} (-${hits * shot.damage}).` });
        } else ev.push({ t: "say", text: "The parting shot missed everyone." });
      } else ev.push({ t: "say", text: "Nobody could follow them." });
      finish(b, "retreat", ev);
      P.done = true;
      return P;
    }

    for (const key of ["atk", "def"]) ev.push({ t: "use", side: key, action: P.actions[key], text: describe(b, key, P.actions[key]) });

    // Switches happen first.
    for (const key of ["atk", "def"]) {
      const a = P.actions[key];
      if (a.kind !== "switch") continue;
      const side = b.sides[key];
      side.active = a.to;
      enter(b, key, ev);
    }

    // Support: items, heals, reinforcements, ceasefire, thunder. They land before the dice.
    for (const key of ["atk", "def"]) support(b, key, P.actions[key], ev);
    if (b.over) {
      P.done = true;
      return P;
    }
    for (const key of ["atk", "def"]) if (!alive(activeSquad(b.sides[key]))) nextSquad(b, key, ev);
    if (checkEnd(b, ev)) {
      P.done = true;
      return P;
    }

    P.plans.atk = planDice(b, "atk", P.actions.atk);
    P.plans.def = planDice(b, "def", P.actions.def);
    P.dice.atk = Array.from({ length: P.plans.atk.dice }, () => 1 + Math.floor(b.rand() * 6));
    P.dice.def = Array.from({ length: P.plans.def.dice }, () => 1 + Math.floor(b.rand() * 6));
    ev.push({ t: "roll", atk: [...P.dice.atk], def: [...P.dice.def], plans: { atk: planSummary(P.plans.atk), def: planSummary(P.plans.def) } });
    return P;
  }

  const planSummary = (p) => ({ dice: p.dice, bonus: p.bonus, power: p.power, critOn: p.critOn, notes: p.notes, ranged: p.ranged, pierce: p.pierce, guard: p.guard, brace: p.brace });

  function support(b, key, action, ev) {
    const side = b.sides[key];
    const foeKey = other(key);
    const foe = b.sides[foeKey];
    const sq = activeSquad(side);
    if (action.kind === "item") {
      const it = C.ITEMS[action.id];
      side.bag[action.id] -= 1;
      if (it.heal) {
        const h = heal(b, sq, it.heal);
        ev.push({ t: "heal", side: key, squad: sq.id, amount: h.add, revived: h.revived, text: `${squadLabel(sq)} recovered ${h.add}${h.revived ? ` (${h.revived} back on their feet)` : ""}.` });
      }
      if (it.cure) {
        for (const s of side.squads) for (const k of ["staggered", "shaken", "charmed", "dazzled", "burning", "exposed"]) delete s.status[k];
        ev.push({ t: "cure", side: key, text: `${sideLabel(b, key)} shook off every bad status.` });
      }
      if (it.team) {
        for (const s of side.squads) if (alive(s)) setStatus(s, it.team, 1);
        ev.push({ t: "status", side: key, squad: null, status: it.team, turns: 1, text: `${sideLabel(b, key)} is Hyped for next round!` });
      }
      if (it.smoke) {
        foe.flags.smokedRound = b.round + 1;
        side.flags.noChase = true;
        ev.push({ t: "say", fx: "smoke", side: key, text: `Smoke fills the field. ${sideLabel(b, foeKey)} will roll 1 fewer die next round.` });
      }
      if (it.hazard) {
        foe.hazard += it.hazard;
        ev.push({ t: "say", fx: "caltrops", side: key, text: `Caltrops scattered! Every squad of ${sideLabel(b, foeKey)} that steps in takes ${it.hazard}.` });
      }
      if (it.hire) {
        const n = it.hire;
        const s = addUnits(side, "nacam", n);
        ev.push({ t: "reinforce", side: key, squad: s.id, unit: "nacam", count: n, text: `${n} mercenary ogres answered the horn and joined ${sideLabel(b, key)}.` });
      }
      if (it.bribe) {
        const roll = 1 + Math.floor(b.rand() * 6);
        const n = Math.ceil(roll / 2);
        const target = activeSquad(foe);
        const gone = Math.min(n, target.count);
        applyDamage(target, gone * target.hpPer);
        target.lost -= gone; // they went home, they didn't fall
        ev.push({ t: "bribe", side: key, roll, count: gone, squad: target.id, text: `The bribe (🎲 ${roll}) worked on ${gone} of ${C.NATIVE_NAMES[foe.native]}. They went home richer.` });
      }
      return;
    }
    if (action.kind !== "move") return;
    const m = C.MOVE_BY_ID[action.id];
    pay(side, moveCost(b, m));
    if (m.tags.includes("once")) side.used[m.id] = true;
    if (m.tags.includes("reload")) side.flags.catapultRound = b.round;
    if (m.heal) {
      const h = heal(b, sq, m.heal);
      ev.push({ t: "heal", side: key, squad: sq.id, amount: h.add, revived: h.revived, text: `${squadLabel(sq)} recovered ${h.add}${h.revived ? ` (${h.revived} back on their feet)` : ""}.` });
    }
    if (m.healTeam) {
      for (const s of side.squads) if (alive(s)) heal(b, s, m.healTeam);
      ev.push({ t: "heal", side: key, squad: null, amount: m.healTeam, revived: 0, text: `Every squad of ${sideLabel(b, key)} recovered ${m.healTeam}.` });
    }
    if (m.revive) {
      const h = heal(b, sq, sq.hpPer * m.revive);
      ev.push({ t: "heal", side: key, squad: sq.id, amount: h.add, revived: h.revived, text: h.revived ? `${h.revived} napping panda got back up!` : "Everyone was already awake." });
    }
    if (m.reinforce) {
      sq.count += m.reinforce;
      sq.maxCount += m.reinforce;
      sq.hp += m.reinforce * sq.hpPer;
      ev.push({ t: "reinforce", side: key, squad: sq.id, unit: sq.unit, count: m.reinforce, text: `${m.reinforce} cubs tumbled out of the sanctuary to help!` });
    }
    if (m.hire) {
      const s = addUnits(side, "nacam", m.hire);
      ev.push({ t: "reinforce", side: key, squad: s.id, unit: "nacam", count: m.hire, text: `${m.hire} ogres took the Warlord's coin and joined the fight.` });
    }
    if (m.cable) {
      const s = addUnits(side, "armedPanda", m.cable);
      ev.push({ t: "reinforce", side: key, squad: s.id, unit: "armedPanda", count: m.cable, text: `${m.cable} Armed Pandas slid in on the gondola cable!` });
    }
    if (m.cutLine) {
      if (key === "atk") side.flags.noChase = true;
      else foe.flags.trappedUntil = b.round + 2;
      ev.push({ t: "say", fx: "cable", side: key, text: key === "atk" ? "The Piecer Captain cut the line behind them. Nobody can chase a retreat now." : "The Piecer Captain cut the gondola line. The invaders can't retreat for 2 rounds." });
    }
    if (m.smite) {
      side.thunderCharged = false;
      const order = ["cam", "armedPanda", "nacam", "panda"];
      const killed = {};
      let left = m.smite;
      while (left > 0) {
        const sqs = foe.squads.filter((s) => alive(s) && !s.hero);
        const t = order.map((u) => sqs.find((s) => s.unit === u)).find(Boolean);
        if (!t) break;
        applyDamage(t, t.hp - (t.count - 1) * t.hpPer);
        killed[t.id] = (killed[t.id] || 0) + 1;
        left -= 1;
      }
      ev.push({ t: "smite", side: key, killed, text: "⚡ Thunder! The sky took three of their strongest." });
    }
    if (m.ends === "truce") {
      ev.push({ t: "say", fx: "hearts", side: key, text: "Tea is poured. Both sides lower their weapons." });
      finish(b, "truce", ev);
    }
  }

  // Free reactions after the roll: Lucky Gem, Chance Cube Blessing, the Josserkid's Loaded Dice.
  function reactionsFor(b, key) {
    const P = b.pending;
    if (!P || P.done || P.used[key]) return [];
    const side = b.sides[key];
    const out = [];
    for (const id of ["luckyGem", "blessing"]) if (side.bag[id] > 0) out.push({ id, label: C.ITEMS[id].label, icon: C.ITEMS[id].icon, text: C.ITEMS[id].text, count: side.bag[id], needsDie: id === "luckyGem" });
    if (side.squads.some((s) => s.hero === "josserkid" && alive(s)) && !side.used.loadedDice) out.push({ id: "loadedDice", label: "Loaded Dice", icon: "🃏", text: "The Josserkid turns one of your dice to a 6. Once per battle.", needsDie: true });
    return out;
  }

  function react(b, key, id, die = 0) {
    const P = b.pending;
    const side = b.sides[key];
    const vals = P.dice[key];
    P.used[key] = true;
    if (id === "luckyGem") {
      side.bag.luckyGem -= 1;
      const from = vals[die];
      const to = 1 + Math.floor(b.rand() * 6);
      vals[die] = to;
      const e = { t: "reroll", side: key, item: id, die, from, to, text: `${sideLabel(b, key)} threw a Lucky Gem: ${from} became ${to}.` };
      P.rerolls.push(e);
      P.events.push(e);
      return e;
    }
    if (id === "loadedDice") {
      side.used.loadedDice = true;
      const from = vals[die];
      vals[die] = 6;
      const e = { t: "reroll", side: key, item: id, die, from, to: 6, text: `🃏 The Josserkid palmed a die. ${from} became 6.` };
      P.rerolls.push(e);
      P.events.push(e);
      return e;
    }
    if (id === "blessing") {
      side.bag.blessing -= 1;
      P.blessing[key] = true;
      const e = { t: "blessing", side: key, text: `🎲 The Chance Cube Blessing: ties go to ${sideLabel(b, key)} this round.` };
      P.events.push(e);
      return e;
    }
    return null;
  }

  // The computer side decides whether to spend a reaction on its dice.
  function aiReact(b, key) {
    const P = b.pending;
    if (!P || P.used[key]) return null;
    const side = b.sides[key];
    const doc = C.DOCTRINES[side.doctrine] || C.DOCTRINES.counter;
    const opts = reactionsFor(b, key);
    if (!opts.length) return null;
    const pairs = pairUp(b, P);
    const lost = pairs.filter((p) => p.win !== key);
    if (!lost.length) return null;
    const idx = key === "atk" ? "ai" : "di";
    const worst = lost.map((p) => p[idx]).sort((x, y) => P.dice[key][x] - P.dice[key][y])[0];
    const eager = doc.weights.items >= 1.2 || lost.length >= 2;
    if (opts.some((o) => o.id === "loadedDice")) return react(b, key, "loadedDice", worst);
    const ties = lost.filter((p) => p.tie).length;
    if (ties && opts.some((o) => o.id === "blessing") && (eager || ties >= 2)) return react(b, key, "blessing");
    if (opts.some((o) => o.id === "luckyGem") && (eager || P.dice[key][worst] <= 2)) return react(b, key, "luckyGem", worst);
    return null;
  }

  function sortIdx(vals, bonus) {
    return vals.map((v, i) => i).sort((x, y) => vals[y] + bonus - (vals[x] + bonus) || vals[y] - vals[x]);
  }

  function tieWinner(b, P) {
    const A = P.plans.atk;
    const D = P.plans.def;
    if (D.losesTies && !A.losesTies) return "atk";
    if (A.losesTies && !D.losesTies) return "def";
    const aClaim = P.blessing.atk || A.winsTies;
    const dClaim = P.blessing.def || D.winsTies;
    if (aClaim && !dClaim) return "atk";
    return "def";
  }

  function pairUp(b, P) {
    const A = P.plans.atk;
    const D = P.plans.def;
    const aBonus = A.bonus - (D.pierce ? A.pierceable : 0);
    const dBonus = D.bonus - (A.pierce ? D.pierceable : 0);
    const ai = sortIdx(P.dice.atk, aBonus);
    const di = sortIdx(P.dice.def, dBonus);
    const tw = tieWinner(b, P);
    const n = Math.min(ai.length, di.length);
    const pairs = [];
    for (let i = 0; i < n; i++) {
      const aRaw = P.dice.atk[ai[i]];
      const dRaw = P.dice.def[di[i]];
      const a = aRaw + aBonus;
      const d = dRaw + dBonus;
      const win = a > d ? "atk" : a < d ? "def" : tw;
      const raw = win === "atk" ? aRaw : dRaw;
      const crit = raw >= (win === "atk" ? A.critOn : D.critOn);
      pairs.push({ ai: ai[i], di: di[i], aRaw, dRaw, a, d, win, tie: a === d, crit });
    }
    return pairs;
  }

  // Every event that names a squad carries that squad's state at that moment (and, when armies change shape, every squad's).
  function annotateOne(b, e) {
    const find = (id) => b.sides.atk.squads.find((q) => q.id === id) || b.sides.def.squads.find((q) => q.id === id);
    if (e.squad) {
      const sq = find(e.squad);
      if (sq) e.after = snap(sq);
    }
    if (e.t === "enter") e.index = b.sides[e.side].squads.findIndex((q) => q.id === e.squad);
    if (["reinforce", "convert", "bribe", "heal", "smite", "enter", "faint"].includes(e.t)) e.squads = { atk: b.sides.atk.squads.map(snap), def: b.sides.def.squads.map(snap) };
    if (e.t === "momentum") e.value = b.sides[e.side].momentum;
  }
  function eventLog(b) {
    const ev = [];
    Object.defineProperty(ev, "push", {
      enumerable: false,
      value(...items) {
        for (const e of items) {
          annotateOne(b, e);
          Array.prototype.push.call(this, e);
        }
        return this.length;
      },
    });
    return ev;
  }

  function finishRound(b) {
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
    ev.push({ t: "pairs", pairs, tieWinner: tieWinner(b, P), bonus: { atk: P.plans.atk.bonus, def: P.plans.def.bonus } });

    const wins = { atk: pairs.filter((p) => p.win === "atk"), def: pairs.filter((p) => p.win === "def") };
    const hitTargets = {};
    // Both sides' damage is worked out from the same moment, then applied together.
    const dmg = {};
    for (const key of ["atk", "def"]) {
      const plan = P.plans[key];
      const foeKey = other(key);
      const me = activeSquad(b.sides[key]);
      const target = activeSquad(b.sides[foeKey]);
      hitTargets[key] = target;
      const w = wins[key];
      if (!w.length || !plan.power) {
        dmg[key] = null;
        continue;
      }
      const mult = C.typeMult(me.type, target.type);
      const foePlan = P.plans[foeKey];
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
    for (const key of ["atk", "def"]) {
      const d = dmg[key];
      if (!d) continue;
      const foeKey = other(key);
      const target = hitTargets[key];
      const fell = applyDamage(target, d.amount);
      const eff = d.mult > 1 ? "super" : d.mult < 1 ? "resist" : null;
      ev.push({
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
    for (const key of ["atk", "def"]) {
      const side = b.sides[key];
      const rate = eventOn(b, "caseySale") && side.squads.some((s) => s.hero === "casey" && alive(s)) ? 2 : 1;
      const before = side.momentum;
      side.momentum = clamp(side.momentum + wins[key].length * rate, 0, R.momentumMax);
      const m = P.plans[key].move;
      if (m && m.kind === "signature") side.momentum = 0;
      if (side.momentum !== before) ev.push({ t: "momentum", side: key, value: side.momentum });
    }

    // Effects of each side's move.
    for (const key of ["atk", "def"]) {
      const plan = P.plans[key];
      const m = plan.move;
      const side = b.sides[key];
      const foeKey = other(key);
      const foe = b.sides[foeKey];
      const me = activeSquad(side);
      const target = hitTargets[key];
      const won = wins[key].length > 0;
      const vals = P.dice[key];
      const counts = {};
      for (const v of vals) counts[v] = (counts[v] || 0) + 1;
      const doubles = Object.values(counts).some((n) => n >= 2);
      const triples = Object.values(counts).some((n) => n >= 3);
      const crit = wins[key].some((p) => p.crit);
      const fires = (on) => on === "always" || (on === "win" && won) || (on === "doubles" && doubles) || (on === "triples" && triples) || (on === "crit" && crit);
      if (!m) continue;
      if (m.healOnWin && won && alive(me)) {
        const h = heal(b, me, m.healOnWin);
        if (h.add) ev.push({ t: "heal", side: key, squad: me.id, amount: h.add, revived: h.revived, text: `${me.name} rolled it off (+${h.add}).` });
      }
      if (m.lifesteal && won && alive(me)) {
        const h = heal(b, me, m.lifesteal * wins[key].length);
        if (h.add) ev.push({ t: "heal", side: key, squad: me.id, amount: h.add, revived: h.revived, text: `${me.name} recovered ${h.add} in the pile-on.` });
      }
      if (m.recoil && alive(me)) {
        const fell = applyDamage(me, m.recoil);
        ev.push({ t: "damage", side: key, squad: me.id, amount: m.recoil, fell, eff: null, hits: 0, crits: 0, source: "recoil", text: `${me.name} took ${m.recoil} from the landing.` });
      }
      if (m.splash && fires(m.splashOn || "always")) {
        const others = foe.squads.filter((s) => alive(s) && s !== target);
        const list = m.id === "sweep" ? others.slice(0, 1) : others;
        for (const s of list) {
          const fell = applyDamage(s, m.splash);
          ev.push({ t: "damage", side: foeKey, squad: s.id, amount: m.splash, fell, eff: null, hits: 0, crits: 0, source: "splash", text: `The blast reached ${s.name} (-${m.splash}).` });
        }
      }
      if (m.convert && won && target.unit !== "panda" && alive(target)) {
        setStatus(target, "charmed", 1);
        ev.push({ t: "status", side: foeKey, squad: target.id, status: "charmed", turns: 1, text: `${target.name} ${target.count === 1 ? "is" : "are"} Charmed! 🥺` });
      }
      if (m.convert && won) {
        const pandas = target.unit === "panda" && alive(target) ? target : null;
        if (pandas) {
          const n = Math.min(wins[key].length, pandas.count);
          applyDamage(pandas, n * pandas.hpPer);
          pandas.lost -= n;
          addUnits(side, "panda", n);
          ev.push({ t: "convert", side: key, count: n, from: pandas.id, text: `${n} panda${n === 1 ? "" : "s"} crossed over to ${sideLabel(b, key)}. Panda diplomacy!` });
        }
      }
      if (m.steal && won) {
        const loot = Object.keys(foe.bag).find((k) => foe.bag[k] > 0);
        if (loot) {
          foe.bag[loot] -= 1;
          side.bag[loot] = (side.bag[loot] || 0) + 1;
          ev.push({ t: "steal", side: key, item: loot, text: `🃏 Pickpocketed a ${C.ITEMS[loot].label} from ${sideLabel(b, foeKey)}!` });
        } else {
          const g = ["gems", "iron", "stone", "rice", "bamboo"].find((k) => foe.goods[k] > 0);
          if (g) {
            foe.goods[g] -= 1;
            side.goods[g] = (side.goods[g] || 0) + 1;
            ev.push({ t: "steal", side: key, good: g, text: `🃏 Pickpocketed 1 ${C.GOODS[g].icon} from ${sideLabel(b, foeKey)}!` });
          } else ev.push({ t: "say", text: "🃏 Their pockets were empty." });
        }
      }
      if (gearOf(me).some((w) => w.doublesStagger) && doubles && m.kind === "strike" && alive(target)) {
        setStatus(target, "staggered", 1);
        ev.push({ t: "status", side: foeKey, squad: target.id, status: "staggered", turns: 1, text: `Doubles! The spiked club left ${target.name} Staggered.` });
      }
      for (const e of m.effects || []) {
        if (!fires(e.on)) continue;
        let list = [];
        if (e.to === "enemy") list = alive(target) ? [target] : [];
        else if (e.to === "self") list = alive(me) ? [me] : [];
        else if (e.to === "team") list = side.squads.filter(alive);
        else if (e.to === "brutes") list = side.squads.filter((s) => alive(s) && s.type === "brute");
        const toKey = e.to === "enemy" ? foeKey : key;
        for (const s of list) setStatus(s, e.status, e.turns);
        if (list.length) {
          const S = C.STATUSES[e.status];
          const who = list.length > 1 ? `Every squad of ${sideLabel(b, toKey)}` : list[0].name;
          ev.push({ t: "status", side: toKey, squad: list.length === 1 ? list[0].id : null, status: e.status, turns: e.turns, text: `${who} ${list.length > 1 ? "is" : list[0].count === 1 ? "is" : "are"} ${S.label}! ${S.icon}` });
        }
      }
    }

    // End of round: burning, then statuses tick down (new ones start counting next round).
    for (const key of ["atk", "def"]) {
      for (const s of b.sides[key].squads) {
        if (alive(s) && hasStatus(s, "burning") && !s.fresh.burning) {
          const fell = applyDamage(s, 5);
          ev.push({ t: "damage", side: key, squad: s.id, amount: 5, fell, eff: null, hits: 0, crits: 0, source: "burning", text: `${s.name} burned (-5).` });
        }
        for (const k of Object.keys(s.status)) {
          if (s.fresh[k]) continue;
          s.status[k] -= 1;
          if (s.status[k] <= 0) delete s.status[k];
        }
        s.fresh = {};
      }
    }

    for (const key of ["atk", "def"]) if (!alive(activeSquad(b.sides[key]))) nextSquad(b, key, ev);
    checkEnd(b, ev);
    if (!b.over && b.round >= R.roundLimit) {
      ev.push({ t: "say", text: `Round ${R.roundLimit}: the invasion stalls. The attackers head home.` });
      finish(b, "stalled", ev);
    }
    b.log.push({ round: P.round, actions: P.actions, dice: { atk: [...P.dice.atk], def: [...P.dice.def] }, plans: { atk: planSummary(P.plans.atk), def: planSummary(P.plans.def) }, events: ev.slice() });
    b.pending = null;
    return ev.slice(start);
  }

  function nextSquad(b, key, ev) {
    const side = b.sides[key];
    const sq = activeSquad(side);
    if (!alive(sq) && !sq.announcedFaint) {
      sq.announcedFaint = true;
      ev.push({ t: "faint", side: key, squad: sq.id, text: sq.hero ? `${sq.name} was knocked out and fled the field!` : `${cap(possessive(b, key))} ${sq.name} are all down!` });
    }
    const next = side.squads.findIndex((s) => alive(s));
    if (next >= 0 && next !== side.active) {
      side.active = next;
      enter(b, key, ev);
      if (!alive(activeSquad(side))) nextSquad(b, key, ev);
    }
  }

  function checkEnd(b, ev) {
    if (b.over) return true;
    const aLeft = b.sides.atk.squads.some(alive);
    const dLeft = b.sides.def.squads.some(alive);
    if (aLeft && dLeft) return false;
    finish(b, !dLeft && aLeft ? "won" : "held", ev);
    return true;
  }

  function finish(b, how, ev) {
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
    ev.push({ t: "end", how, winner: b.result.winner, text });
    if (b.pending) b.pending.done = true;
  }

  // ---------------------------------------------------------------- odds & the computer's choices

  // Monte Carlo of one clash between two plans (no state changes). Used for move previews and the AI.
  function estimate(b, key, action, foeAction, trials = 40, rand = Math.random) {
    const foeKey = other(key);
    const sideSq = activeSquad(b.sides[key]);
    const plans = {};
    // Plan the switch-in with the incoming squad in place.
    const swap = (k, a) => {
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
    const multOut = C.typeMult(me.type, foe.type);
    const multIn = C.typeMult(foe.type, me.type);
    if (undoA) undoA();
    if (undoB) undoB();
    void sideSq;
    let dealt = 0;
    let taken = 0;
    let anyWin = 0;
    let winsSum = 0;
    const P = { plans: { atk: plans.atk, def: plans.def }, dice: { atk: [], def: [] }, blessing: { atk: false, def: false } };
    for (let t = 0; t < trials; t++) {
      P.dice.atk = Array.from({ length: plans.atk.dice }, () => 1 + Math.floor(rand() * 6));
      P.dice.def = Array.from({ length: plans.def.dice }, () => 1 + Math.floor(rand() * 6));
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
  function likelyAction(b, key) {
    const g = actionsFor(b, key);
    const strikes = g.attack.filter((a) => a.enabled);
    const guards = g.defend.filter((a) => a.enabled);
    const side = b.sides[key];
    const doc = C.DOCTRINES[side.doctrine] || C.DOCTRINES.counter;
    if (guards.length && (doc.weights.guard > doc.weights.strike || !strikes.length)) return { kind: "move", id: guards[0].id };
    if (strikes.length) {
      const best = strikes.map((a) => a.move).sort((x, y) => y.dice * y.power - x.dice * x.power)[0];
      return { kind: "move", id: best.id };
    }
    const any = [...g.tactics, ...g.signature].find((a) => a.enabled);
    return any ? { kind: "move", id: any.id } : { kind: "item", id: "riceBall" };
  }

  function preview(b, key, action) {
    const foeKey = other(key);
    return estimate(b, key, action, likelyAction(b, foeKey), 160);
  }

  // The computer's pick, flavoured by its standing orders (doctrine).
  function aiAction(b, key) {
    const side = b.sides[key];
    const foeKey = other(key);
    const foe = b.sides[foeKey];
    const doc = C.DOCTRINES[side.doctrine] || C.DOCTRINES.counter;
    const W = doc.weights;
    const me = activeSquad(side);
    const them = activeSquad(foe);
    const guess = likelyAction(b, foeKey);
    const hpRatio = me.hp / (me.maxCount * me.hpPer);
    const g = actionsFor(b, key);
    const cands = [];
    for (const list of [g.attack, g.defend, g.tactics, g.signature]) for (const a of list) if (a.enabled) cands.push(a);
    for (const a of g.bag) if (a.enabled && a.when === "action") cands.push(a);
    for (const a of g.squads) if (a.enabled && (W.switch || 0) > 0) cands.push(a);
    let best = null;
    for (const c of cands) {
      const action = c.kind === "move" ? { kind: "move", id: c.id } : c.kind === "item" ? { kind: "item", id: c.id } : { kind: "switch", to: c.to };
      const est = estimate(b, key, action, guess, 24, b.ai);
      let s = est.dealt - est.taken * 0.8;
      const m = c.move;
      if (m) {
        s += m.kind === "strike" ? W.strike : m.kind === "guard" ? W.guard : m.kind === "tactic" ? W.tactic : 10;
        if (W.dice) s += est.plan.dice * W.dice;
        for (const e of m.effects || []) {
          const S = C.STATUSES[e.status];
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
        if (m.steal) s += Object.values(foe.bag).some((n) => n > 0) ? 3 : -2;
        const spend = Object.values(m.cost || {}).reduce((n, v) => n + v, 0);
        s -= spend * (2.2 - (W.items || 1));
      } else if (c.kind === "item") {
        const it = c.item;
        s += (W.items || 0) * 2 - 3;
        if (it.heal) s += hpRatio < 0.5 ? W.heal * 1.6 : -10;
        if (it.cure) s += Object.keys(me.status).some((k) => C.STATUSES[k].good === false) ? 6 : -6;
        if (it.hire) s += 9;
        if (it.bribe) s += 6;
        if (it.hazard) s += foe.squads.filter(alive).length > 1 ? 3 : -8;
        if (it.smoke) s += 1;
      } else if (c.kind === "switch") {
        const incoming = c.squad;
        const adv = C.typeMult(incoming.type, them.type) - C.typeMult(me.type, them.type);
        const risk = C.typeMult(them.type, incoming.type) - C.typeMult(them.type, me.type);
        s += (adv * 14 - risk * 10 + (incoming.hp / (incoming.maxCount * incoming.hpPer) - hpRatio) * 4) * (W.switch || 0) - 4;
      }
      s += (b.ai() - 0.5) * 2.5;
      if (!best || s > best.s) best = { s, action };
    }
    if (!best) return { kind: "item", id: "riceBall" };
    // Prep items: the bold doctrines sharpen up before a big swing.
    if (best.action.kind === "move") {
      const m = C.MOVE_BY_ID[best.action.id];
      if ((W.items || 0) >= 1.2 && m.power >= 12 && side.bag.whetstone > 0) best.action.prep = "whetstone";
      else if ((W.items || 0) >= 1.2 && side.bag.gemFocus > 0) best.action.prep = "gemFocus";
    }
    return best.action;
  }

  // Fight a whole round for two computer-picked (or given) actions. Handy for auto-battle and replays.
  function autoRound(b, atkAction, defAction) {
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

  function summary(b) {
    const out = {};
    for (const key of ["atk", "def"]) {
      const s = b.sides[key];
      out[key] = {
        name: sideLabel(b, key),
        survivors: s.squads.filter((q) => !q.hero).reduce((m, q) => ((m[q.unit] = (m[q.unit] || 0) + q.count), m), {}),
        lost: s.squads.filter((q) => !q.hero).reduce((m, q) => ((m[q.unit] = (m[q.unit] || 0) + q.lost), m), {}),
        heroes: s.squads.filter((q) => q.hero).map((q) => ({ hero: q.hero, standing: alive(q) })),
        spent: { ...s.spent },
      };
    }
    // Dice luck: average of every die each side threw.
    const all = { atk: [], def: [] };
    for (const r of b.log) for (const k of ["atk", "def"]) all[k].push(...((r.dice && r.dice[k]) || []));
    for (const k of ["atk", "def"]) out[k].luck = all[k].length ? all[k].reduce((a, c) => a + c, 0) / all[k].length : 0;
    return out;
  }

  // The pairs as they stand right now, before anyone resolves the round (for "use a reaction?" prompts).
  const pairsNow = (b) => (b.pending && !b.pending.done ? pairUp(b, b.pending) : []);

  return { createBattle, validate, pairsNow, tieWinner, moveCost, gearOf, actionsFor, planDice, beginRound, reactionsFor, react, aiReact, finishRound, aiAction, autoRound, preview, estimate, likelyAction, summary, squadStats, activeSquad, sideLabel, possessive, squadLabel, costText, movesOf, mulberry };
})();
