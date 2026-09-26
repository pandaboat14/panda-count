// ============================================================================================
// "Since your last turn": three ways to catch up, all replaying the real recorded battles.
// ============================================================================================
const A = window.__arena;
const q = (s, el = document) => el.querySelector(s);

const WHO = {
  you: { name: "You", color: "#d64a2b", icon: "🐼" },
  mei: { name: "Mei", color: "#2b6fd6", icon: "🌸" },
  otto: { name: "Otto", color: "#e0a526", icon: "🦊" },
  bot: { name: "🤖 Bot Hard", color: "#8a3fd1", icon: "🤖" },
  world: { name: "The world", color: "#1f4b35", icon: "🌍" },
};

const BATTLES = {
  sichuan: {
    seed: 3,
    who: "mei",
    you: "def",
    title: "Mei invaded your Sichuan",
    sc: {
      id: "cu-sichuan",
      title: "Mei invades Sichuan",
      place: "Sichuan",
      terrain: "bamboo",
      buildings: ["sanctuary", "fort"],
      events: [],
      atk: { name: "Mei", color: "#2b6fd6", doctrine: "counter", squads: [{ unit: "armedPanda", count: 4, gear: ["bambooSpear"] }, { unit: "nacam", count: 3, gear: ["spikedClub"] }], bag: { luckyGem: 1, whetstone: 1 }, goods: { iron: 2, stone: 2, coin: 6 } },
      def: { name: "You", color: "#d64a2b", doctrine: "turtle", squads: [{ unit: "panda", count: 5, gear: ["towerShield"] }, { unit: "armedPanda", count: 2 }], traps: ["caltrops"], bag: { riceBall: 2, luckyGem: 1 }, goods: { rice: 2 } },
    },
  },
  mongolia: {
    seed: 2,
    who: "otto",
    you: null,
    title: "Otto and Casey stormed Mongolia",
    sc: {
      id: "cu-mongolia",
      title: "Otto and Casey vs the Ogre Nation",
      place: "Mongolia",
      terrain: "stone",
      buildings: [],
      events: ["caseySale"],
      atk: { name: "Otto", color: "#e0a526", doctrine: "allin", squads: [{ unit: "armedPanda", count: 3, gear: ["towerShield"] }, { unit: "cam", count: 2 }], hero: "casey", bag: { riceBall: 1 }, goods: { stone: 3, coin: 8 } },
      def: { name: "Ogre Nation", native: "nacams", color: "#6f8a3a", squads: [{ unit: "nacam", count: 8 }] },
    },
  },
  japan: {
    seed: 3,
    who: "bot",
    you: null,
    title: "🤖 Bot Hard hit Mei's Gem Caves",
    sc: {
      id: "cu-japan",
      title: "Bot Hard vs Mei's Gem Caves",
      place: "Japan",
      terrain: "gems",
      buildings: ["fort"],
      events: [],
      atk: { name: "🤖 Bot Hard", color: "#8a3fd1", doctrine: "counter", squads: [{ unit: "panda", count: 6, gear: ["gemArrows"] }, { unit: "cam", count: 3, gear: ["gemKnuckles"] }], catapult: true, bag: { luckyGem: 2, gemFocus: 1 }, goods: { gems: 3, stone: 3, iron: 1, coin: 6 } },
      def: { name: "Mei", color: "#2b6fd6", doctrine: "counter", squads: [{ unit: "armedPanda", count: 3, gear: ["towerShield"] }, { unit: "cam", count: 3 }], hero: "josserkid", bag: { riceBall: 2, blessing: 1 }, goods: { rice: 2, gems: 1 } },
    },
  },
};

// Fight every battle once, computer against computer, and keep the recordings.
for (const bt of Object.values(BATTLES)) {
  const { b, records } = A.simulateRecords(bt.sc, bt.seed);
  bt.b = b;
  bt.records = records;
  bt.sum = A.Battle.summary(b);
  bt.persp = bt.you || "atk";
  analyse(bt);
}

function unitWords(units) {
  const parts = Object.entries(units || {})
    .filter(([, n]) => n > 0)
    .map(([u, n]) => `${n} ${n === 1 ? CODEX.UNITS[u].label : CODEX.UNITS[u].plural}`);
  if (!parts.length) return "nobody";
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}
function force(side) {
  const u = {};
  for (const s of side.squads || []) u[s.unit] = (u[s.unit] || 0) + s.count;
  const w = unitWords(u);
  return side.hero ? `${w}, led by ${CODEX.HEROES[side.hero].name}` : w;
}
function sideName(bt, k) {
  const s = bt.sc[k];
  return s.native ? CODEX.NATIVE_NAMES[s.native].replace(/^the /, "the ") : s.name;
}
function cap(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Pull the story out of the recording: the key round, the biggest hit, what each side leaned on.
function analyse(bt) {
  let best = null;
  const marks = [];
  const used = { atk: {}, def: {} };
  let crits = 0;
  bt.records.forEach((r) => {
    for (const k of ["atk", "def"]) {
      const a = r.actions[k];
      if (a && a.kind === "move") used[k][a.id] = (used[k][a.id] || 0) + 1;
      if (a && a.kind === "item") used[k][`item:${a.id}`] = (used[k][`item:${a.id}`] || 0) + 1;
    }
    let dmg = 0;
    for (const e of r.events) {
      if (e.t === "damage" && e.by) {
        dmg += e.amount;
        if (e.crits) {
          crits += e.crits;
          marks.push({ round: r.round, kind: "crit" });
        }
        if (e.eff === "super") marks.push({ round: r.round, kind: "super" });
        if (!best || e.amount > best.amount) best = { ...e, round: r.round, move: r.actions[e.by]?.id };
      }
      if (e.t === "faint") marks.push({ round: r.round, kind: "ko" });
    }
    r.dmg = dmg;
  });
  const ko = bt.records.find((r) => r.events.some((e) => e.t === "faint"));
  bt.key = best ? best.round : ko ? ko.round : bt.records.at(-1).round;
  bt.best = best;
  bt.marks = marks;
  bt.used = used;
  bt.crits = crits;
  const won = bt.b.result.how === "won";
  const atk = sideName(bt, "atk");
  const def = sideName(bt, "def");
  const place = bt.sc.place;
  const top = (k) =>
    Object.entries(bt.used[k])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id, n]) => {
        const name = id.startsWith("item:") ? CODEX.ITEMS[id.slice(5)].label : CODEX.MOVE_BY_ID[id].name;
        return `${name}${n > 1 ? ` (${n}×)` : ""}`;
      });
  const moveName = best?.move ? CODEX.MOVE_BY_ID[best.move]?.name : null;
  if (bt.you === "def") {
    bt.headline = won ? `${place} falls to ${atk}` : `${place} holds`;
    bt.deck = won ? `Your Standing Orders fought ${bt.b.round} rounds before the last defender went down.` : `Your pandas turned back ${atk}'s invasion in ${bt.b.round} rounds, and you slept through all of it.`;
  } else {
    bt.headline = won ? `${place} falls to ${atk}` : `${cap(def)} holds ${place}`;
    bt.deck = won ? `${atk} needed ${bt.b.round} rounds to break ${def}.` : `${atk}'s attack broke apart after ${bt.b.round} rounds.`;
  }
  const doc = CODEX.DOCTRINES[bt.b.sides.def.doctrine];
  const ordersLine = bt.sc.def.native ? `${cap(def)} fought the way natives do (${doc.label}).` : `${bt.you === "def" ? "Your" : `${def}'s`} Standing Orders (${doc.icon} ${doc.label}) answered with ${top("def").join(" and ") || "everything they had"}.`;
  bt.paras = [
    `${atk} rode the gondola into ${place} with ${force(bt.sc.atk)}. ${ordersLine}`,
    best ? `The key moment came in round ${best.round}: ${moveName || "a heavy blow"} for ${best.amount}${best.eff === "super" ? ", super effective" : ""}${best.crits ? `, with ${best.crits > 1 ? `${best.crits} critical hits` : "a critical hit"}` : ""}. ${atk} leaned on ${top("atk").join(" and ") || "brute force"}.` : `Neither side landed much.`,
    `${bt.b.result.text} ${cap(atk)} lost ${unitWords(bt.sum.atk.lost)}; ${def} lost ${unitWords(bt.sum.def.lost)}.`,
  ];
  bt.facts = [`${bt.b.round} rounds`, `${crits} crit${crits === 1 ? "" : "s"}`, best ? `Biggest hit: ${best.amount}` : null, `Dice ${bt.sum.atk.luck.toFixed(1)} vs ${bt.sum.def.luck.toFixed(1)}`, bt.sc.buildings.includes("fort") ? "Behind a Fort" : null].filter(Boolean);
  bt.short = `${bt.b.round} rounds · ${won ? `${atk} won` : `${cap(def)} held`}`;
}

// Everything that happened, in order.
const ITEMS = [
  { kind: "news", who: "mei", icon: "🎲", title: "Mei rolled 8", text: "Harvest: you got 1 🎋 from Sichuan, Mei got 1 ⛓️ from Korea, Otto got nothing." },
  { kind: "battle", id: "sichuan" },
  { kind: "news", who: "mei", icon: "🤝", title: "Mei and Otto signed a pact", text: "Neither can invade the other now. Breaking it makes you an Oathbreaker: half PandaCoin for 3 rounds." },
  { kind: "news", who: "otto", icon: "⚡", title: "Otto recruited Casey, the Norse God", text: "THE HEAVENS SPLIT. Casey adds +3 to every die in battles fought from or in his region." },
  { kind: "battle", id: "mongolia" },
  { kind: "news", who: "otto", icon: "🚡", title: "Otto built a gondola toward your Sichuan", text: "A line from Tibet now reaches your border. Otto can invade Sichuan on his next turn." },
  { kind: "battle", id: "japan" },
  { kind: "news", who: "world", icon: "🍂", title: "Round 15: Bamboo Blight", text: "A fungus hit the bamboo. Bamboo regions produce nothing this round, and 🎋 moves can't be used in battles." },
];
for (const it of ITEMS) if (it.kind === "battle") it.bt = BATTLES[it.id];

const nBattles = ITEMS.filter((i) => i.kind === "battle").length;
q("#cu-sub").innerHTML = `<b>${ITEMS.length} things</b> happened while you were away, <b>${nBattles} of them battles</b>. One was yours: ${BATTLES.sichuan.b.result.how === "won" ? "you lost Sichuan" : "your pandas held Sichuan"}.`;

// ---------------------------------------------------------------------------------- shared bits
let gen = 0;
const sleep = (ms) =>
  new Promise((resolve) => {
    let left = ms;
    let prev = performance.now();
    const step = () => {
      const now = performance.now();
      if (!A.S.paused) left -= (now - prev) * A.S.speed;
      prev = now;
      if (left <= 0) resolve();
      else setTimeout(step, 40);
    };
    step();
  });
function mountArena(slot, layout) {
  const app = q("#app");
  if (app.parentElement !== slot) slot.appendChild(app);
  if (layout && A.S.layout !== layout) {
    A.S.layout = layout;
    app.dataset.layout = layout;
  }
  A.applyViewport();
}
function showCard(slot, html) {
  hideCard(slot);
  const el = document.createElement("div");
  el.className = "card-over";
  el.innerHTML = html;
  slot.appendChild(el);
  return el;
}
function hideCard(slot) {
  slot.querySelectorAll(".card-over").forEach((e) => e.remove());
}
const dot = (who) => `<span class="dot" style="background:${WHO[who].color}"></span>`;
function newsCard(it) {
  return `<div><div class="big">${it.icon}</div><p class="kicker">${WHO[it.who].name}</p><h3>${it.title}</h3><p>${it.text}</p></div>`;
}
function battleIntro(it) {
  const bt = it.bt;
  return `<div><div class="big">⚔️</div><p class="kicker">Battle for ${bt.sc.place}${bt.you ? " · You were defending" : ""}</p><h3>${bt.title}</h3><p>${cap(sideName(bt, "atk"))}: ${force(bt.sc.atk)}.<br>${cap(sideName(bt, "def"))}: ${force(bt.sc.def)}.</p></div>`;
}
function battleOutro(it) {
  const bt = it.bt;
  return `<div><p class="kicker">${bt.short}</p><h3>${bt.b.result.text}</h3><div class="stats"><span>${cap(sideName(bt, "atk"))} lost ${unitWords(bt.sum.atk.lost)}</span><span>${cap(sideName(bt, "def"))} lost ${unitWords(bt.sum.def.lost)}</span>${bt.facts
    .slice(1, 3)
    .map((f) => `<span>${f}</span>`)
    .join("")}</div></div>`;
}
async function playBattle(bt, opts = {}) {
  return A.replayRecords({ scenario: bt.sc, seed: bt.seed, records: bt.records, final: bt.b, persp: bt.persp, bar: false, ...opts });
}

// ---------------------------------------------------------------------------------- Theater
const theater = { cur: 0, playing: true, done: new Set() };
function renderPlaylist() {
  q("#pl").innerHTML = ITEMS.map((it, i) => {
    const on = i === theater.cur;
    const icon = it.kind === "battle" ? "⚔️" : it.icon;
    const title = it.kind === "battle" ? it.bt.title : it.title;
    const sub = it.kind === "battle" ? it.bt.short : WHO[it.who].name;
    return `<button class="pl ${on ? "on" : ""} ${theater.done.has(i) ? "done" : ""}" data-i="${i}"><span class="ic">${icon}</span><span class="t">${title}</span><span class="s"><span class="who" style="background:${WHO[it.kind === "battle" ? it.bt.who : it.who].color}"></span>${sub}</span></button>`;
  }).join("");
  q("#pl")
    .querySelectorAll(".pl")
    .forEach((b) => b.addEventListener("click", () => theaterPlay(+b.dataset.i)));
  const it = ITEMS[theater.cur];
  q("#t-now").textContent = it ? `${theater.cur + 1} of ${ITEMS.length} · ${it.kind === "battle" ? it.bt.title : it.title}` : "All caught up";
}
function renderTimeline() {
  q("#tl").innerHTML = ITEMS.map((it, i) => {
    const marks =
      it.kind === "battle"
        ? it.bt.marks
            .map((m) => `<i class="mk ${m.kind}" style="left:${(((m.round - 0.5) / it.bt.b.round) * 100).toFixed(1)}%"></i>`)
            .join("")
        : "";
    const label = it.kind === "battle" ? `⚔️ ${it.bt.sc.place}` : it.icon;
    return `<button class="seg-t ${it.kind === "battle" ? "battle" : ""} ${i === theater.cur ? "on" : ""} ${theater.done.has(i) ? "done" : ""}" data-i="${i}" title="${it.kind === "battle" ? it.bt.title : it.title}"><span class="fill"></span><span class="lbl">${label}</span>${marks}</button>`;
  }).join("");
  q("#tl")
    .querySelectorAll(".seg-t")
    .forEach((b) => b.addEventListener("click", () => theaterPlay(+b.dataset.i)));
}
async function theaterPlay(i) {
  const my = ++gen;
  const slot = q("#slot-theater");
  mountArena(slot, theater.layout || "classic");
  A.setPaused(false);
  theater.playing = true;
  q("#t-play").textContent = "❚❚ Pause";
  if (i >= ITEMS.length) {
    theater.cur = ITEMS.length;
    renderPlaylist();
    renderTimeline();
    showCard(slot, `<div><div class="big">🐼</div><p class="kicker">All caught up</p><h3>It's your turn.</h3><p>Otto can reach Sichuan next turn. Maybe check your Standing Orders there.</p></div>`);
    return;
  }
  theater.cur = i;
  renderPlaylist();
  renderTimeline();
  const it = ITEMS[i];
  if (it.kind === "news") {
    showCard(slot, newsCard(it));
    await sleep(3800);
  } else {
    showCard(slot, battleIntro(it));
    await sleep(2400);
    if (my !== gen) return;
    hideCard(slot);
    const ok = await playBattle(it.bt);
    if (!ok || my !== gen) return;
    showCard(slot, battleOutro(it));
    await sleep(3200);
  }
  if (my !== gen) return;
  theater.done.add(i);
  if (theater.playing) theaterPlay(i + 1);
}
q("#t-play").addEventListener("click", () => {
  const paused = !A.S.paused;
  A.setPaused(paused);
  q("#t-play").textContent = paused ? "▶ Play" : "❚❚ Pause";
});
q("#t-prev").addEventListener("click", () => theaterPlay(Math.max(0, theater.cur - 1)));
q("#t-next").addEventListener("click", () => theaterPlay(theater.cur + 1));
q("#t-battle").addEventListener("click", () => {
  const next = ITEMS.findIndex((it, i) => i > theater.cur && it.kind === "battle");
  theaterPlay(next < 0 ? ITEMS.length : next);
});
q("#t-speed").addEventListener("click", () => {
  const fast = A.S.speed <= 1;
  A.setSpeed(fast ? 2 : 1);
  q("#t-speed").setAttribute("aria-pressed", String(fast));
});

// ---------------------------------------------------------------------------------- Chronicle
function renderPaper() {
  const lead = BATTLES.sichuan;
  const others = [BATTLES.mongolia, BATTLES.japan];
  const regions = { you: 9, mei: 11, otto: 12, bot: 8 };
  if (lead.b.result.how === "won") (regions.you -= 1), (regions.mei += 1);
  if (BATTLES.mongolia.b.result.how === "won") regions.otto += 1;
  if (BATTLES.japan.b.result.how === "won") (regions.bot += 1), (regions.mei -= 1);
  const standings = Object.entries(regions).sort((a, b) => b[1] - a[1]);
  const news = ITEMS.filter((i) => i.kind === "news");
  q("#paper").innerHTML = `
    <header class="mast"><h2>The Kird Gazette</h2><div class="dateline"><span>Round 15</span><span>Since your last turn</span><span>Price: 1 🪙</span></div></header>
    <section class="lead">
      <div><div class="slot" id="slot-paper"></div><p class="caption">The key moment, round ${lead.key}. Replayed from the record: same dice, same throws.</p></div>
      <div class="story">
        <h3>${lead.headline}</h3>
        <p class="deck">${lead.deck}</p>
        ${lead.paras.map((p) => `<p>${p}</p>`).join("")}
        <div class="facts">${lead.facts.map((f) => `<span>${f}</span>`).join("")}</div>
        <button class="watch" data-watch="sichuan">▶ Watch the whole battle</button>
      </div>
    </section>
    <section class="columns">
      ${others
        .map(
          (bt) => `<div class="story"><h4>${bt.headline}</h4><p class="deck">${bt.deck}</p><p>${bt.paras[0]}</p><p>${bt.paras[1]}</p><div class="facts">${bt.facts
            .slice(0, 3)
            .map((f) => `<span>${f}</span>`)
            .join("")}</div><button class="watch" data-watch="${Object.keys(BATTLES).find((k) => BATTLES[k] === bt)}">▶ Watch it</button></div>`,
        )
        .join("")}
      <div>
        <h4>Standings</h4>
        <table class="ledger"><tbody>${standings.map(([k, n]) => `<tr><td>${dot(k)}${WHO[k].name}</td><td>${n} regions</td></tr>`).join("")}</tbody></table>
        ${news.map((n) => `<div class="brief"><b>${n.icon} ${WHO[n.who].name}</b><p><strong>${n.title}.</strong> ${n.text}</p></div>`).join("")}
      </div>
    </section>`;
  q("#paper")
    .querySelectorAll("[data-watch]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        const bt = BATTLES[b.dataset.watch];
        const slot = q("#slot-paper");
        slot.scrollIntoView({ behavior: "smooth", block: "center" });
        paperPlay(bt, false);
      }),
    );
}
async function paperPlay(bt, keyOnly = true) {
  const my = ++gen;
  const slot = q("#slot-paper");
  mountArena(slot, "classic");
  A.setPaused(false);
  hideCard(slot);
  const ok = await playBattle(bt, keyOnly ? { rounds: [bt.key] } : {});
  if (!ok || my !== gen) return;
  showCard(slot, battleOutro({ bt }));
  await sleep(3500);
  if (my !== gen) return;
  paperPlay(BATTLES.sichuan, true);
}

// ---------------------------------------------------------------------------------- Highlights
const STORIES = ITEMS.map((it) => ({ ...it }));
const hl = { cur: 0 };
function renderBars() {
  q("#bars").innerHTML = STORIES.map((_, i) => `<i class="${i < hl.cur ? "done" : ""}"><b id="bar-${i}"></b></i>`).join("");
}
async function storyPlay(i) {
  const my = ++gen;
  const slot = q("#slot-stories");
  mountArena(slot, "showdown");
  A.setPaused(false);
  if (i < 0) i = 0;
  if (i >= STORIES.length) {
    hl.cur = STORIES.length;
    renderBars();
    showCard(slot, `<div><div class="big">🐼</div><p class="kicker">That's everything</p><h3>It's your turn.</h3><p>Tap the left side to watch again.</p></div>`);
    return;
  }
  hl.cur = i;
  renderBars();
  const it = STORIES[i];
  const who = it.kind === "battle" ? it.bt.who : it.who;
  q("#story-cap").innerHTML = `<span class="av" style="--c:${WHO[who].color}">${WHO[who].icon}</span><span>${WHO[who].name} · ${it.kind === "battle" ? `Battle for ${it.bt.sc.place}` : "News"}</span>`;
  const bar = q(`#bar-${i}`);
  const fill = (ms) => {
    bar.style.transition = "none";
    bar.style.width = "0";
    void bar.offsetWidth;
    bar.style.transition = `width ${ms / A.S.speed}ms linear`;
    bar.style.width = "100%";
  };
  if (it.kind === "news") {
    showCard(slot, newsCard(it));
    fill(4200);
    await sleep(4200);
  } else {
    showCard(slot, `<div><div class="big">⚔️</div><p class="kicker">Round ${it.bt.key} of ${it.bt.b.round}</p><h3>${it.bt.title}</h3><p>The moment that decided it.</p></div>`);
    fill(15000);
    await sleep(1800);
    if (my !== gen) return;
    hideCard(slot);
    const ok = await playBattle(it.bt, { rounds: [it.bt.key] });
    if (!ok || my !== gen) return;
    showCard(slot, battleOutro(it));
    await sleep(2600);
    bar.style.transition = "width .2s";
    bar.style.width = "100%";
  }
  if (my !== gen) return;
  storyPlay(i + 1);
}
q("#s-next").addEventListener("click", () => storyPlay(hl.cur + 1));
q("#s-prev").addEventListener("click", () => storyPlay(hl.cur - 1));

// ---------------------------------------------------------------------------------- switching views
const VARIANTS = [
  ["theater", "Theater"],
  ["chronicle", "Chronicle"],
  ["highlights", "Highlights"],
];
function setVariant(v) {
  q("#cu").dataset.variant = v;
  q("#variants")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === v)));
  gen++;
  A.S.gen++;
  A.setPaused(false);
  if (v === "theater") theaterPlay(theater.cur >= ITEMS.length ? 0 : theater.cur);
  if (v === "chronicle") {
    renderPaper();
    paperPlay(BATTLES.sichuan, true);
  }
  if (v === "highlights") storyPlay(0);
}
q("#variants").innerHTML = VARIANTS.map(([k, l]) => `<button data-k="${k}" aria-pressed="${k === "theater"}">${l}</button>`).join("");
q("#variants")
  .querySelectorAll("button")
  .forEach((b) => b.addEventListener("click", () => setVariant(b.dataset.k)));
const startVariant = VARIANTS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "theater";
renderPlaylist();
renderTimeline();
setVariant(startVariant);
window.__catchup = { ITEMS, BATTLES, setVariant, theaterPlay, storyPlay };
