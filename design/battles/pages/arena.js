// ============================================================================================
// Panda Diplomacy battle arena prototype: one engine, three looks (Classic Duel, War Table, Showdown).
// ============================================================================================
const C = CODEX;
const $ = (s, el = document) => el.querySelector(s);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const other = (k) => (k === "atk" ? "def" : "atk");
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// Every unit gets a figure on the field, up to this many per squad (the panels always show the true count).
const MAX_FIGURES = 16;
// Reserves stand a little smaller than the squad on point.
const RESERVE_SCALE = 0.88;
const store = {
  get(k, d) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

// ---------------------------------------------------------------------------------- scenarios
const SCENARIOS = [
  {
    id: "sichuan",
    title: "Take Sichuan",
    place: "Sichuan",
    terrain: "bamboo",
    buildings: ["sanctuary"],
    events: [],
    replayName: "Rowan",
    atk: {
      name: "You",
      color: "#d64a2b",
      player: true,
      squads: [
        { unit: "armedPanda", count: 5, gear: ["ironGlaive", "ironHelm"] },
        { unit: "nacam", count: 4, gear: ["spikedClub"] },
        { unit: "cam", count: 2, gear: ["gemKnuckles"] },
      ],
      hero: "cockpenis",
      bag: { riceBall: 2, luckyGem: 2, whetstone: 1, smokeBomb: 1, blessing: 1, warDrums: 1 },
      goods: { bamboo: 3, stone: 2, iron: 2, rice: 3, gems: 2, coin: 12, pandaCoin: 4, camCoin: 1 },
    },
    def: { name: "Panda Nation", native: "pandas", color: "#f7f4ec", squads: [{ unit: "panda", count: 6 }, { unit: "armedPanda", count: 3 }], bag: { riceBall: 1 }, goods: { rice: 2 } },
  },
  {
    id: "japan",
    title: "Mei's Gem Caves",
    place: "Japan",
    terrain: "gems",
    buildings: ["fort"],
    events: [],
    replayName: "Rowan",
    atk: {
      name: "You",
      color: "#d64a2b",
      player: true,
      squads: [
        { unit: "panda", count: 6, gear: ["gemArrows"] },
        { unit: "cam", count: 3, gear: ["gemKnuckles", "ironHelm"] },
      ],
      hero: "ping",
      catapult: true,
      bag: { feast: 1, luckyGem: 2, gemFocus: 1, warDrums: 1, riceBall: 1 },
      goods: { bamboo: 2, stone: 3, iron: 2, rice: 3, gems: 3, coin: 10, pandaCoin: 6, camCoin: 1 },
    },
    def: {
      name: "Mei",
      color: "#2b6fd6",
      doctrine: "counter",
      squads: [
        { unit: "armedPanda", count: 3, gear: ["towerShield"] },
        { unit: "cam", count: 3 },
        { unit: "panda", count: 2 },
      ],
      hero: "josserkid",
      traps: ["caltrops"],
      bag: { riceBall: 2, luckyGem: 1, blessing: 1 },
      goods: { rice: 3, gems: 2, iron: 2 },
    },
  },
  {
    id: "mongolia",
    title: "Casey vs the Ogre Nation",
    place: "Mongolia",
    terrain: "stone",
    buildings: [],
    events: ["caseySale"],
    replayName: "Rowan",
    atk: {
      name: "You",
      color: "#d64a2b",
      player: true,
      squads: [
        { unit: "armedPanda", count: 3, gear: ["towerShield"] },
        { unit: "cam", count: 2 },
      ],
      hero: "casey",
      bag: { riceBall: 2, caltrops: 1, luckyGem: 1, mercHorn: 1 },
      goods: { stone: 3, iron: 2, rice: 3, gems: 1, coin: 14, pandaCoin: 3 },
    },
    def: { name: "Ogre Nation", native: "nacams", color: "#6f8a3a", squads: [{ unit: "nacam", count: 8 }], goods: {} },
  },
];

function scenarioBattle(sc, seed) {
  return Battle.createBattle({ seed, terrain: sc.terrain, place: sc.place, buildings: sc.buildings, events: sc.events, atk: structuredClone(sc.atk), def: structuredClone(sc.def) });
}

// ---------------------------------------------------------------------------------- state
const LAYOUT_LIST = [
  ["classic", "Classic Duel"],
  ["table", "War Table"],
  ["showdown", "Showdown"],
];
const STYLE_LIST = [
  ["toy", "Toybox"],
  ["lowpoly", "Low-poly"],
  ["toon", "Toon"],
];
const S = {
  layout: store.get("pdb-layout", "classic"),
  style: store.get("pdb-style", "toy"),
  scenario: SCENARIOS[0],
  seed: 7,
  speed: 1,
  sound: true,
  b: null,
  disp: null,
  busy: false,
  cat: null,
  prep: null,
  auto: false,
  react: null,
  records: [],
  replaying: false,
  persp: "atk",
  hover: null,
  lastRoll: null,
  gen: 0,
  paused: false,
  voiceName: null,
};
if (!LAYOUT_LIST.some(([k]) => k === S.layout)) S.layout = "classic";
if (!STYLE_LIST.some(([k]) => k === S.style)) S.style = "toy";

// ---------------------------------------------------------------------------------- three.js scene
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight("#fff6e6", "#3a4a3a", 1.0);
const sun = new THREE.DirectionalLight("#fff3dc", 2.0);
sun.position.set(-5, 11, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(hemi, sun, sun.target);
const world = { root: new THREE.Group(), set: null, fx: new THREE.Group(), dice: new THREE.Group(), squads: new THREE.Group(), extraLights: [] };
scene.add(world.root);
world.root.add(world.fx, world.dice, world.squads);

// ---------------------------------------------------------------------------------- textures
function gradientTexture(stops, h = 256) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = h;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#7a4f2e";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 512;
    g.strokeStyle = `rgba(${40 + Math.random() * 40},${22 + Math.random() * 20},10,${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 4);
    g.stroke();
  }
  for (let p = 1; p < 4; p++) {
    g.fillStyle = "rgba(20,10,5,.35)";
    g.fillRect(0, p * 128 - 1, 512, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function arenaFloorTexture(accent) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(512, 512, 40, 512, 512, 512);
  gr.addColorStop(0, "#26372d");
  gr.addColorStop(1, "#101a14");
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = accent;
  g.globalAlpha = 0.9;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(512, 512, 470, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.globalAlpha = 0.5;
  for (const r of [300, 140]) {
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 0.35;
  g.beginPath();
  g.moveTo(512, 42);
  g.lineTo(512, 982);
  g.stroke();
  g.globalAlpha = 0.22;
  g.fillStyle = accent;
  g.font = "800 120px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("PD", 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const emojiCache = new Map();
function emojiTexture(ch, color) {
  const key = ch + (color || "");
  if (emojiCache.has(key)) return emojiCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (ch === "star" || ch === "spark") {
    g.fillStyle = color || "#fff6c8";
    g.beginPath();
    const r1 = 60, r2 = ch === "star" ? 18 : 10;
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? r2 : r1;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (ch === "puff") {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, color || "rgba(255,255,255,.95)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  } else if (ch === "plus") {
    g.fillStyle = color || "#7fe07a";
    g.fillRect(50, 18, 28, 92);
    g.fillRect(18, 50, 92, 28);
  } else {
    g.font = "96px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    g.fillText(ch, 64, 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emojiCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------------- terrain props
const TERR = {
  bamboo: { sky: ["#bfdcc8", "#eef3df", "#f7f1de"], ground: "#88b061", rim: "#5d7f40", accent: "#5f9a4a", fog: "#e6eed8", surface: "grass" },
  stone: { sky: ["#b9c9d8", "#e3e6e4", "#f3eee4"], ground: "#aaa596", rim: "#7f7a6e", accent: "#9a968c", fog: "#e2e0d8", surface: "stone" },
  iron: { sky: ["#b8bec6", "#dfe0e0", "#ecebe7"], ground: "#7f868e", rim: "#565d65", accent: "#5d6b7a", fog: "#d9dadd", surface: "stone" },
  rice: { sky: ["#cfe4c8", "#f0f3dc", "#fbf5e3"], ground: "#b9cc7c", rim: "#8ea456", accent: "#e2cf8a", fog: "#edf1da", surface: "grass" },
  gems: { sky: ["#1d1630", "#34284f", "#4c3c6a"], ground: "#5a4a78", rim: "#3b3056", accent: "#9b6fc7", fog: "#2f2548", surface: "stone", dark: true },
};
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function rngFrom(seed) {
  return Battle.mulberry(seed);
}
function bambooClump(rng, scale = 1) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rng() * 4);
  const stalkMat = mat("#6fa653", { roughness: 0.55 });
  const nodeMat = mat("#4e7f39", { roughness: 0.6 });
  const leafMat = mat("#79b35a", { roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const h = (2.2 + rng() * 2.6) * scale;
    const r = 0.06 * scale;
    const x = (rng() - 0.5) * 0.9 * scale, z = (rng() - 0.5) * 0.9 * scale;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 8), stalkMat);
    stalk.position.set(x, h / 2, z);
    stalk.rotation.z = (rng() - 0.5) * 0.12;
    stalk.castShadow = true;
    g.add(stalk);
    for (let y = 0.45 * scale; y < h; y += 0.55 * scale) {
      const node = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.18, 5, 10), nodeMat);
      node.rotation.x = Math.PI / 2;
      node.position.set(x, y, z);
      g.add(node);
    }
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07 * scale, 0.55 * scale, 4), leafMat);
      leaf.position.set(x, h - 0.2 * scale - k * 0.25 * scale, z);
      leaf.rotation.set(Math.PI / 2 + 0.5, rng() * 6, 0.6 + rng() * 0.6);
      g.add(leaf);
    }
  }
  return g;
}
function rock(rng, color, scale = 1) {
  const r = (0.25 + rng() * 0.5) * scale;
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(color, { flatShading: true, roughness: 0.95 }));
  m.scale.set(1 + rng() * 0.5, 0.6 + rng() * 0.5, 1 + rng() * 0.4);
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.position.y = r * 0.35;
  m.castShadow = m.receiveShadow = true;
  return m;
}
function crystal(rng, scale = 1) {
  const g = new THREE.Group();
  const cols = ["#b58af0", "#7fd6e8", "#e58ad2"];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const col = cols[Math.floor(rng() * cols.length)];
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * scale, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1, flatShading: true }));
    m.scale.set(1, 2.2 + rng() * 1.5, 1);
    m.position.set((rng() - 0.5) * 0.5 * scale, 0.35 * scale, (rng() - 0.5) * 0.5 * scale);
    m.rotation.set((rng() - 0.5) * 0.6, rng() * 3, (rng() - 0.5) * 0.6);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
function riceSprouts(rng, scale = 1) {
  const g = new THREE.Group();
  const m = mat("#8fb34e", { roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.03 * scale, (0.35 + rng() * 0.3) * scale, 4), m);
    s.position.set((rng() - 0.5) * 0.8 * scale, 0.18 * scale, (rng() - 0.5) * 0.8 * scale);
    s.rotation.z = (rng() - 0.5) * 0.4;
    g.add(s);
  }
  return g;
}
function propFor(terrain, rng, scale = 1) {
  if (terrain === "bamboo") return bambooClump(rng, scale);
  if (terrain === "gems") return rng() < 0.6 ? crystal(rng, scale * 1.4) : rock(rng, "#3f3458", scale * 1.6);
  if (terrain === "rice") return riceSprouts(rng, scale * 1.4);
  if (terrain === "iron") return rock(rng, rng() < 0.5 ? "#5a6068" : "#6e5a4a", scale * 1.6);
  return rock(rng, rng() < 0.5 ? "#9c978b" : "#b3ad9f", scale * 1.8);
}
function mountain(color, r, h) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat(color, { flatShading: true, roughness: 1 }));
  m.position.y = h / 2 - 0.1;
  return m;
}

// ---------------------------------------------------------------------------------- the three sets
function buildSet(layout, terrain) {
  const T = TERR[terrain];
  const g = new THREE.Group();
  const rng = rngFrom(terrain.length * 97 + layout.length * 13);
  const out = { group: g, anchors: {}, dice: {}, cams: {}, lights: [] };
  scene.fog = null;
  if (layout === "classic") {
    scene.background = gradientTexture(T.sky);
    scene.fog = new THREE.Fog(T.fog, 18, 60);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), mat(T.ground, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);
    const platform = (x, z, s) => {
      const p = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.7 * s, 1.85 * s, 0.22, 56), mat(new THREE.Color(T.ground).offsetHSL(0, 0.02, 0.08), { roughness: 0.9 }));
      top.scale.z = 0.72;
      top.position.y = 0.11;
      top.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.86 * s, 1.95 * s, 0.1, 56), mat(T.rim, { roughness: 0.95 }));
      rim.scale.z = 0.72;
      rim.position.y = 0.05;
      p.add(top, rim);
      p.position.set(x, 0, z);
      return p;
    };
    const A = V3(-2.5, 0.22, 1.95);
    const D = V3(2.45, 0.22, -2.35);
    g.add(platform(A.x, A.z, 1.25), platform(D.x, D.z, 1.3));
    // The forest and hills stand behind the far side. Watched from the defenders' end (their replays),
    // they swing round to the other side, so nothing grows between the camera and the fight.
    const scenery = new THREE.Group();
    if (S.persp === "def") scenery.rotation.y = Math.PI;
    g.add(scenery);
    for (let i = 0; i < 26; i++) {
      const a = -1.45 + (i / 25) * 2.95 + (rng() - 0.5) * 0.12;
      const r = 12.5 + rng() * 6;
      const p = propFor(terrain, rng, 1.2 + rng() * 0.6);
      p.position.set(Math.sin(a) * r + 2, 0, -Math.cos(a) * r - 1);
      scenery.add(p);
    }
    const hillColor = new THREE.Color(T.rim).lerp(new THREE.Color(T.fog), 0.45);
    for (let i = 0; i < 7; i++) {
      const m = mountain(hillColor, 4 + rng() * 5, 3 + rng() * (terrain === "stone" ? 8 : 4));
      const a = -1.6 + i * 0.5;
      m.position.set(Math.sin(a) * 26 + 3, m.position.y, -Math.cos(a) * 26 - 4);
      scenery.add(m);
    }
    // a few props off to the sides, never between the camera and the fight
    for (let i = 0; i < 8; i++) {
      const p = propFor(terrain, rng, 0.45 + rng() * 0.3);
      const side = i % 2 ? 1 : -1;
      p.position.set(side * (12.5 + rng() * 2.5) + (side < 0 ? -1.5 : 1.5), 0, -3.5 + rng() * 4 - (side < 0 ? 2 : 0));
      scenery.add(p);
    }
    out.anchors = { atk: { pos: A, face: D }, def: { pos: D, face: A } };
    out.dice = { center: V3(0.15, 0, -0.2), bounds: { minX: -1.55, maxX: 1.85, minZ: -1.55, maxZ: 1.15 }, floorY: 0, surface: T.surface };
    out.cams = {
      atk: { pos: V3(-6.3, 4.1, 8.4), look: V3(0.5, 0.45, -0.9), fov: 32 },
      def: { pos: V3(6.6, 4.1, -8.6), look: V3(-0.5, 0.45, 0.8), fov: 32 },
    };
    out.sunPos = V3(-5, 11, 7);
  } else if (layout === "table") {
    scene.background = gradientTexture(["#120c08", "#2a1c12", "#3b2718"]);
    const wood = woodTexture();
    wood.repeat.set(2, 1);
    const table = new THREE.Mesh(new RoundedBoxGeometry(17, 0.6, 11, 4, 0.2), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0.02 }));
    table.position.y = -0.31;
    table.receiveShadow = true;
    g.add(table);
    const board = new THREE.Mesh(new RoundedBoxGeometry(10.5, 0.24, 7.2, 3, 0.1), mat(T.ground, { roughness: 0.95 }));
    board.position.y = 0.02;
    board.receiveShadow = true;
    g.add(board);
    const edge = new THREE.Mesh(new RoundedBoxGeometry(10.9, 0.18, 7.6, 3, 0.08), mat("#3a2616", { roughness: 0.6 }));
    edge.position.y = -0.03;
    g.add(edge);
    // a dotted "no man's land" strip where the dice land
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 2.2), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.ground).offsetHSL(0, -0.05, -0.08), roughness: 1 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.141;
    strip.receiveShadow = true;
    g.add(strip);
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const p = propFor(terrain, rng, 0.26 + rng() * 0.14);
      p.position.set(side * (4.55 + rng() * 0.55), 0.14, (rng() - 0.5) * 6.4);
      g.add(p);
    }
    for (let i = 0; i < 8; i++) {
      const p = propFor(terrain, rng, 0.22);
      p.position.set((rng() - 0.5) * 8.5, 0.14, (i % 2 ? 1 : -1) * (3.3 + rng() * 0.15));
      g.add(p);
    }
    // tokens and cards scattered on the table, for the board-game feel
    const tok = (x, z, col, r = 0.3) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 28), mat(col, { roughness: 0.4 }));
      m.position.set(x, 0.04, z);
      m.castShadow = true;
      g.add(m);
    };
    tok(-7.2, 3.6, "#e2cf8a");
    tok(-6.6, 4.1, "#e2cf8a");
    tok(7.1, -3.9, "#d9a53a", 0.26);
    const card = (x, z, r, col) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.3), mat(col, { roughness: 0.7 }));
      m.position.set(x, 0.01, z);
      m.rotation.y = r;
      g.add(m);
    };
    card(6.8, 3.7, 0.4, "#fff6e6");
    card(7.3, 3.4, 0.9, "#f3e3c4");
    card(-7.1, -3.6, -0.3, "#fff6e6");
    const lamp = new THREE.SpotLight("#ffd9a0", 60, 30, 0.75, 0.6, 1.4);
    lamp.position.set(0, 12, 2);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    g.add(lamp, lamp.target);
    out.lights.push(lamp);
    out.anchors = { atk: { pos: V3(0, 0.14, 2.05), face: V3(0, 0.14, -3) }, def: { pos: V3(0, 0.14, -2.05), face: V3(0, 0.14, 3) } };
    out.dice = { center: V3(0, 0.14, 0), bounds: { minX: -4.1, maxX: 4.1, minZ: -1.0, maxZ: 1.0 }, floorY: 0.14, surface: "felt" };
    out.cams = {
      atk: { pos: V3(0, 9.4, 8.6), look: V3(0, 0, 0.35), fov: 37 },
      def: { pos: V3(0, 9.4, -8.6), look: V3(0, 0, -0.35), fov: 37 },
    };
    out.sunPos = V3(-4, 12, 5);
  } else {
    scene.background = gradientTexture(["#04080a", "#0d1612", "#1a2820"]);
    scene.fog = new THREE.Fog("#0b120e", 22, 58);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(10.4, 10.6, 0.34, 96), new THREE.MeshStandardMaterial({ map: arenaFloorTexture(T.accent === "#e2cf8a" ? "#e8b64a" : T.accent), roughness: 0.45, metalness: 0.15 }));
    floor.position.y = -0.17 + 0.15;
    floor.receiveShadow = true;
    g.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.08, 8, 128), new THREE.MeshStandardMaterial({ color: "#e8b64a", emissive: "#e8b64a", emissiveIntensity: 0.9 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    g.add(ring);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), mat("#0a110d", { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    g.add(ground);
    // the crowd: a few hundred capsules on three tiers, bobbing
    const crowdGeo = new THREE.CapsuleGeometry(0.22, 0.45, 3, 6);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const N = 330;
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, N);
    const colors = ["#d64a2b", "#2b6fd6", "#e0a526", "#8a3fd1", "#14a38b", "#d6368f", "#5b7d1f", "#f7f4ec", "#6f8a3a"];
    const base = [];
    const m4 = new THREE.Matrix4();
    const narrow = isNarrow();
    for (let i = 0; i < N; i++) {
      const tier = i % 3;
      let a = rng() * Math.PI * 2;
      if (narrow && Math.abs(Math.cos(a)) > 0.8) a += Math.PI / 2;
      const r = 13.6 + tier * 1.4 + rng() * 0.5;
      const y = 0.5 + tier * 0.9;
      base.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, p: rng() * 6 });
      m4.makeTranslation(base[i].x, y, base[i].z);
      crowd.setMatrixAt(i, m4);
      crowd.setColorAt(i, new THREE.Color(colors[Math.floor(rng() * colors.length)]).multiplyScalar(0.55));
    }
    crowd.userData.base = base;
    g.add(crowd);
    out.crowd = crowd;
    for (let t = 0; t < 3; t++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(13.4 + t * 1.4 + 0.9, 13.4 + t * 1.4 + 0.9, 0.9 * (t + 1), 64, 1, true), mat("#16211b", { side: THREE.BackSide, roughness: 1 }));
      step.position.y = (0.9 * (t + 1)) / 2 - 0.2;
      g.add(step);
    }
    // Props ring the floor at the two ends only: nothing stands between either camera and the fight.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      if (Math.abs(narrow ? Math.cos(a) : Math.sin(a)) > 0.55) continue;
      const p = propFor(terrain, rng, 0.8);
      p.position.set(Math.cos(a) * 11.8, 0, Math.sin(a) * 11.8);
      g.add(p);
    }
    const spots = [
      ["#ffe3a6", V3(-6, 11, 6)],
      ["#ffb3c7", V3(6, 11, -6)],
      ["#bfe6ff", V3(0, 12, -8)],
    ];
    for (const [col, pos] of spots) {
      const s = new THREE.SpotLight(col, 110, 36, 0.62, 0.55, 1.2);
      s.position.copy(pos);
      s.target.position.set(0, 0, 0);
      g.add(s, s.target);
      out.lights.push(s);
    }
    out.spots = out.lights;
    out.anchors = { atk: { pos: V3(-2.9, 0.15, 0.55), face: V3(2.9, 0.15, -0.55) }, def: { pos: V3(2.9, 0.15, -0.55), face: V3(-2.9, 0.15, 0.55) } };
    out.dice = { center: V3(0, 0.15, 0), bounds: { minX: -1.9, maxX: 1.9, minZ: -1.7, maxZ: 1.7 }, floorY: 0.15, surface: "stone" };
    out.narrow = narrow;
    out.cams = narrow
      ? {
          atk: { pos: V3(-11.8, 8.4, 1.4), look: V3(0.7, 0.3, -0.1), fov: 38 },
          def: { pos: V3(11.8, 8.4, -1.4), look: V3(-0.7, 0.3, 0.1), fov: 38 },
        }
      : {
          atk: { pos: V3(-1.2, 5.0, 11.2), look: V3(0.1, 0.55, -1.4), fov: 35 },
          def: { pos: V3(1.2, 5.0, -11.2), look: V3(-0.1, 0.55, 1.4), fov: 35 },
        };
    out.sunPos = V3(-3, 14, 4);
  }
  hemi.intensity = layout === "showdown" ? 0.35 : layout === "table" ? 0.55 : T.dark ? 0.55 : 1.05;
  hemi.color.set(T.dark ? "#cdb8ff" : "#fff6e6");
  sun.intensity = layout === "showdown" ? 0.55 : layout === "table" ? 0.9 : T.dark ? 1.1 : 2.1;
  sun.color.set(T.dark ? "#d9c8ff" : "#fff3dc");
  sun.position.copy(out.sunPos);
  renderer.toneMappingExposure = layout === "showdown" ? 1.15 : 1.02;
  return out;
}

// ---------------------------------------------------------------------------------- display model
function snapOf(sq) {
  return { id: sq.id, unit: sq.unit, hero: sq.hero, kind: sq.kind, name: sq.name, type: sq.type, hp: sq.hp, count: sq.count, maxCount: sq.maxCount, hpPer: sq.hpPer, gear: [...(sq.gear || [])], status: { ...(sq.status || {}) } };
}
function dispFrom(b) {
  const side = (k) => ({ active: b.sides[k].active, momentum: b.sides[k].momentum, squads: b.sides[k].squads.map(snapOf) });
  return { atk: side("atk"), def: side("def") };
}
function applyAfter(e) {
  const d = S.disp;
  if (e.squads) {
    for (const k of ["atk", "def"]) {
      d[k].squads = e.squads[k].map((sn) => ({ ...sn, status: d[k].squads.find((x) => x.id === sn.id)?.status || {} }));
      for (const sn of d[k].squads) ensureView(k, sn);
    }
    if ([...views.atk.values(), ...views.def.values()].some((v) => v.fresh)) layoutSquads();
  }
  if (e.after) {
    for (const k of ["atk", "def"]) {
      const sq = d[k].squads.find((x) => x.id === e.after.id);
      if (sq) Object.assign(sq, { ...e.after, status: sq.status });
    }
  }
  if (e.t === "enter" && e.index >= 0) d[e.side].active = e.index;
  if (e.t === "momentum") d[e.side].momentum = e.value;
  if (e.t === "status") {
    const list = e.squad ? d[e.side].squads.filter((x) => x.id === e.squad) : d[e.side].squads.filter((x) => x.hp > 0);
    for (const sq of list) sq.status[e.status] = Math.max(sq.status[e.status] || 0, e.turns);
  }
  if (e.t === "cure") for (const sq of d[e.side].squads) for (const k of Object.keys(sq.status)) if (C.STATUSES[k].good === false) delete sq.status[k];
}
function endSnapshot() {
  return dispFrom(S.b);
}

// ---------------------------------------------------------------------------------- squads on the field
const views = { atk: new Map(), def: new Map() };
let SET = null;
function sideColor(k) {
  const sc = S.scenario;
  return k === "atk" ? sc.atk.color : sc.def.color || "#bbb";
}
function heroSquad(kind, opts) {
  const fig = Models.buildFigure(kind, opts);
  const root = new THREE.Group();
  root.add(fig.root);
  let down = false;
  return {
    root,
    figures: [fig],
    leader: fig,
    count: 1,
    setCount(n) {
      if (n <= 0 && !down) {
        down = true;
        fig.play("faint");
      } else if (n > 0 && down) {
        down = false;
        fig.play("idle");
      }
    },
    play: (n) => fig.play(n),
    update: (dt) => fig.update(dt),
    flash: (h, s) => fig.flash(h, s),
    setGear() {},
    dispose: () => fig.dispose && fig.dispose(),
  };
}
function ensureView(k, sn) {
  if (views[k].has(sn.id)) return views[k].get(sn.id);
  // One figure per unit, with room for a few reinforcements (Cub Swarm, the Mercenary Horn).
  const room = Math.min(MAX_FIGURES, Math.max(sn.maxCount || 0, sn.count) + 4);
  const opts = { style: S.style, teamColor: sideColor(k), gear: sn.gear, weapon: sn.gear?.[0] || null, maxVisible: room };
  const model = sn.hero ? heroSquad(sn.hero, opts) : Models.buildSquad(sn.unit, Math.max(1, sn.count), opts);
  if (!sn.hero && sn.count <= 0) model.setCount(0);
  // (Figures set their own shadows: outline hulls and tiny eye parts don't cast any.)
  const holder = new THREE.Group();
  holder.add(model.root);
  world.squads.add(holder);
  const v = { id: sn.id, key: k, hero: sn.hero, unit: sn.unit, model, holder, shown: sn.count, target: V3(), pos: V3(), visible: true, vis: 1, visTarget: 1, scale: 1, fresh: true };
  views[k].set(sn.id, v);
  return v;
}
function clearViews() {
  for (const k of ["atk", "def"]) {
    for (const v of views[k].values()) {
      world.squads.remove(v.holder);
      v.model.dispose && v.model.dispose();
    }
    views[k].clear();
  }
}
function activeView(k) {
  const d = S.disp[k];
  return views[k].get(d.squads[d.active]?.id);
}
// Where each squad stands. Every squad is on the field in every look: the squad on point up front, the reserves
// in a line behind it, off to their own side of the picture so they never stand between the camera and the fight.
// j = 1 is next in line.
function reserveSpot(k, j) {
  const a = SET.anchors[k];
  const p = a.pos.clone();
  if (S.layout === "table" || (S.layout === "showdown" && SET.narrow)) {
    const face = a.face.clone().sub(a.pos).setY(0).normalize();
    if (S.layout === "showdown") {
      const side = j % 2 ? 1 : -1;
      const step = Math.ceil(j / 2);
      return p.addScaledVector(V3(face.z, 0, -face.x), side * (step * 2.1 - (j % 2 ? 0 : 0.6))).addScaledVector(face, -(1.3 + step * 0.9));
    }
    const side = j % 2 ? 1 : -1;
    const step = Math.ceil(j / 2);
    return p.addScaledVector(V3(face.z, 0, -face.x), side * step * 2.35).addScaledVector(face, -(0.55 + step * 0.25));
  }
  const shot = SET.cams[S.persp];
  const view = shot.look.clone().sub(shot.pos).setY(0).normalize();
  const right = V3(-view.z, 0, view.x);
  // Their own side of the screen: whichever side of the dice their squad on point stands.
  const out = Math.sign(p.clone().sub(SET.dice.center).dot(right)) || (k === "atk" ? -1 : 1);
  // On a portrait screen the reserves line up deeper and narrower, so the camera needn't back off so far.
  const narrow = isNarrow();
  if (S.layout === "classic") {
    // A column beside the platform, stepping back into the distance (the side nearer the camera starts further back).
    const near = p.distanceTo(shot.pos) < SET.anchors[other(k)].pos.distanceTo(shot.pos);
    p.y = 0;
    const wide = narrow ? 2.3 + 0.6 * (j - 1) : 2.7 + 1.5 * (j - 1);
    const deep = (near ? (narrow ? 1.8 : 0.9) : 0) + (narrow ? 2.6 : 2.3) * (j - 1);
    return p.addScaledVector(right, out * wide).addScaledVector(view, deep);
  }
  // Showdown: ranks stepping back toward the stands, square to the arena.
  const back = Math.sign(view.z) || -1;
  return p.add(V3(Math.sign(p.x) * (narrow ? 0.7 : 1.8) * j, 0, back * (narrow ? 2.2 : 1.5) * j));
}
function isNarrow() {
  return (camera.aspect || 1.6) < 1;
}
function layoutSquads(instant = false) {
  if (!SET) return;
  for (const k of ["atk", "def"]) {
    const a = SET.anchors[k];
    const d = S.disp[k];
    const face = a.face.clone().sub(a.pos);
    const yaw = Math.atan2(face.x, face.z);
    let slot = 0;
    d.squads.forEach((sq, i) => {
      const v = ensureView(k, sq);
      v.yaw = yaw;
      if (instant) v.holder.rotation.y = yaw;
      const isActive = i === d.active;
      if (isActive) {
        v.target.copy(a.pos);
        v.visTarget = 1;
        v.scaleTarget = 1;
        v.fadeIn = null;
      } else if (sq.hp > 0) {
        v.target.copy(reserveSpot(k, ++slot));
        v.visTarget = 1;
        v.scaleTarget = RESERVE_SCALE;
        v.fadeIn = null;
      } else if (v.fadeIn == null && v.visTarget > 0) {
        // Wiped out: they stay where they fell until the last of them has fainted, then the spot clears.
        v.fadeIn = instant ? 0 : 3.4;
      }
      // A squad that has just joined (hired mercenaries) appears in its spot rather than marching in from nowhere.
      if (instant || v.fresh) {
        if (instant && v.fadeIn != null) {
          v.visTarget = 0;
          v.fadeIn = null;
        }
        v.pos.copy(v.target);
        v.holder.rotation.y = yaw;
        v.vis = instant ? v.visTarget : 0.01;
        v.scale = v.scaleTarget ?? 1;
        v.fresh = false;
      }
    });
  }
}
// A ring in the side's colour under the squad on point, so the front line reads at a glance among the reserves.
function makePointRings() {
  SET.pointRings = {};
  for (const k of ["atk", "def"]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 72), new THREE.MeshBasicMaterial({ color: sideColor(k), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1;
    ring.visible = false;
    SET.group.add(ring);
    SET.pointRings[k] = ring;
  }
}
function updatePointRings(dt) {
  if (!SET?.pointRings) return;
  const up = V3(0, 1, 0);
  for (const k of ["atk", "def"]) {
    const ring = SET.pointRings[k];
    const v = activeView(k);
    const figs = v ? (v.model.figures || []).filter((f) => f.alive && f.root.visible) : [];
    ring.visible = figs.length > 0 && v.vis > 0.5;
    if (!ring.visible) continue;
    // Centre and size it on the figures actually standing.
    const c = V3();
    const pts = figs.map((f) => f.root.position.clone().setY(0).applyAxisAngle(up, v.holder.rotation.y).multiplyScalar(v.holder.scale.x));
    for (const p of pts) c.add(p);
    c.multiplyScalar(1 / pts.length);
    const rad = Math.max(0.75, ...pts.map((p) => p.distanceTo(c) + 0.55));
    ring.position.set(v.holder.position.x + c.x, SET.anchors[k].pos.y + 0.025, v.holder.position.z + c.z);
    ring.scale.setScalar(ring.scale.x + (rad - ring.scale.x) * (1 - Math.exp(-dt * 6)));
    ring.material.opacity = 0.55 + 0.25 * Math.sin(performance.now() / 420);
  }
}
function reservesOf(k) {
  const d = S.disp[k];
  return d.squads.filter((sq, i) => i !== d.active && sq.hp > 0).map((sq) => views[k].get(sq.id)).filter(Boolean);
}
function updateViews(dt) {
  for (const k of ["atk", "def"]) {
    for (const v of views[k].values()) {
      if (v.fadeIn != null && (v.fadeIn -= dt) <= 0) {
        v.visTarget = 0;
        v.fadeIn = null;
      }
      // Squads march to a new spot (a reserve stepping up to the front) instead of sliding.
      const gap = v.pos.distanceTo(v.target);
      const marching = gap > 0.25 && v.visTarget > 0.5 && v.vis > 0.5;
      if (marching !== !!v.marching && !v.lunge) {
        v.marching = marching;
        v.model.play(marching ? "walk" : "idle");
      }
      if (gap > 1e-4) v.pos.addScaledVector(v.target.clone().sub(v.pos).normalize(), Math.min(gap, dt * 2.8));
      // Face the way they're marching, then turn back to face the enemy.
      const want = v.marching ? Math.atan2(v.target.x - v.pos.x, v.target.z - v.pos.z) : v.yaw ?? v.holder.rotation.y;
      const turn = Math.atan2(Math.sin(want - v.holder.rotation.y), Math.cos(want - v.holder.rotation.y));
      v.holder.rotation.y += turn * (1 - Math.exp(-dt * 7));
      v.vis += (v.visTarget - v.vis) * (1 - Math.exp(-dt * 8));
      v.scale += ((v.scaleTarget ?? 1) - v.scale) * (1 - Math.exp(-dt * 5));
      v.holder.position.copy(v.pos);
      if (v.lunge) {
        const L = v.lunge;
        L.t += dt;
        const k2 = clamp01(L.t / L.dur);
        const out = k2 < L.peak ? easeOut(k2 / L.peak) : 1 - ease((k2 - L.peak) / (1 - L.peak));
        v.holder.position.addScaledVector(L.dir, out * L.dist);
        if (k2 >= 1) v.lunge = null;
      }
      const s = Math.max(0.001, v.vis) * v.scale;
      v.holder.scale.setScalar(s);
      v.holder.visible = v.vis > 0.02;
      v.model.update(dt);
    }
  }
  updatePointRings(dt);
}

// ---------------------------------------------------------------------------------- dice on the field
let tray = null;
const DIE = 0.4;
const throwDice = { atk: [], def: [] };
function makeTray() {
  if (tray) tray.dispose();
  world.dice.clear();
  const D = SET.dice;
  tray = Dice.createTray({ scene: world.dice, bounds: D.bounds, floorY: D.floorY, wallHeight: 3.2, gravity: -26, dieSize: DIE, surface: D.surface, sound: S.sound });
}
function diceStyle(k) {
  const c = sideColor(k);
  if (k === "atk") return { face: c, pip: "#fffaf3", edge: "#fffaf3" };
  const light = new THREE.Color(c).getHSL({}).l > 0.75;
  return light ? { face: "#fffaf3", pip: "#1c1b17", edge: "#b3955c" } : { face: "#fffaf3", pip: c, edge: c };
}
function originsFor(k, n) {
  const a = SET.anchors[k].pos;
  const D = SET.dice;
  const c = D.center;
  const dir = V3(a.x - c.x, 0, a.z - c.z).normalize();
  const side = V3(-dir.z, 0, dir.x);
  const b = D.bounds;
  const reach = Math.min(b.maxX - b.minX, b.maxZ - b.minZ) * 0.42;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = c.clone().addScaledVector(dir, reach).addScaledVector(side, (i - (n - 1) / 2) * DIE * 1.6);
    p.x = Math.min(b.maxX - DIE, Math.max(b.minX + DIE, p.x));
    p.z = Math.min(b.maxZ - DIE, Math.max(b.minZ + DIE, p.z));
    out.push({ x: p.x, z: p.z, y: D.floorY + DIE * 3.2 });
  }
  return out;
}
async function doThrow(atkVals, defVals, recorded) {
  tray.clear();
  throwDice.atk = atkVals.map(() => tray.addDie({ style: diceStyle("atk"), size: DIE, position: { x: 0, y: -5, z: 0 } }));
  throwDice.def = defVals.map(() => tray.addDie({ style: diceStyle("def"), size: DIE, position: { x: 0, y: -5, z: 0 } }));
  const dice = [...throwDice.atk, ...throwDice.def];
  const values = [...atkVals, ...defVals];
  if (!dice.length) return null;
  const origin = [...originsFor("atk", atkVals.length), ...originsFor("def", defVals.length)];
  if (recorded && recorded.layout === S.layout && recorded.rec) {
    try {
      await tray.replay(recorded.rec);
      return recorded;
    } catch {
      /* fall through to a fresh throw of the same numbers */
    }
  }
  const rec = await tray.throw({ dice, values, origin, seed: (S.seed * 131 + S.b.round * 17 + values.length) >>> 0, spin: 18 });
  return { layout: S.layout, rec };
}
async function rethrowDie(k, index, value, recorded) {
  const die = throwDice[k][index];
  if (!die) return null;
  tray.setGlow(die, null);
  if (recorded && recorded.layout === S.layout && recorded.rec) {
    try {
      await tray.replay(recorded.rec);
      return recorded;
    } catch {
      /* throw it fresh */
    }
  }
  const o = originsFor(k, 1)[0];
  const rec = await tray.throw({ dice: [die], values: [value], origin: [o], seed: (S.seed * 977 + index * 31 + value) >>> 0, spin: 20 });
  return { layout: S.layout, rec };
}

// ---------------------------------------------------------------------------------- effects
const fx = [];
function spawn(obj, life, step) {
  world.fx.add(obj);
  fx.push({ obj, life, age: 0, step });
  return obj;
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.age += dt;
    const k = clamp01(f.age / f.life);
    f.step && f.step(k, dt, f);
    if (k >= 1) {
      world.fx.remove(f.obj);
      f.obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !o.material.userData.keep) o.material.dispose();
      });
      fx.splice(i, 1);
    }
  }
}
function sprite(tex, size, color = "#ffffff", opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}
function burst(pos, { tex = emojiTexture("spark"), color = "#fff3b0", count = 14, speed = 2.6, size = 0.22, gravity = -5, life = 0.8, up = 1.2 } = {}) {
  if (REDUCED) count = Math.min(count, 5);
  for (let i = 0; i < count; i++) {
    const s = sprite(tex, size * (0.6 + Math.random() * 0.8), color);
    s.position.copy(pos);
    const v = V3((Math.random() - 0.5) * 2, Math.random() * up + 0.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
    spawn(s, life * (0.7 + Math.random() * 0.5), (k, dt) => {
      v.y += gravity * dt;
      s.position.addScaledVector(v, dt);
      s.material.opacity = 1 - k * k;
    });
  }
}
function floaters(pos, ch, { count = 6, size = 0.45, rise = 1.4, spread = 0.9, life = 1.6, color } = {}) {
  if (REDUCED) count = Math.min(count, 2);
  const tex = emojiTexture(ch, color);
  for (let i = 0; i < count; i++) {
    const s = sprite(tex, size * (0.7 + Math.random() * 0.5));
    const start = pos.clone().add(V3((Math.random() - 0.5) * spread, Math.random() * 0.4, (Math.random() - 0.5) * spread));
    s.position.copy(start);
    const delay = Math.random() * 0.35;
    spawn(s, life + delay, (k, dt, f) => {
      const t = Math.max(0, f.age - delay) / life;
      s.visible = f.age > delay;
      s.position.set(start.x + Math.sin(t * 6 + i) * 0.12, start.y + easeOut(clamp01(t)) * rise, start.z);
      s.material.opacity = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
    });
  }
}
function ringWave(pos, color = "#fff3b0", maxR = 1.6, life = 0.55, y = 0.06) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(pos).setY(pos.y + y);
  spawn(m, life, (k) => {
    const r = 0.15 + easeOut(k) * maxR;
    m.scale.setScalar(r);
    m.material.opacity = 1 - k;
  });
}
function bolt(from, to, color = "#fff6a8") {
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const p = from.clone().lerp(to, i / n);
    if (i && i < n) p.add(V3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05, 6), new THREE.MeshBasicMaterial({ color, transparent: true }));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.16, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  const g = new THREE.Group();
  g.add(m, glow);
  const light = new THREE.PointLight(color, 40, 12);
  light.position.copy(to).setY(to.y + 1);
  g.add(light);
  spawn(g, 0.45, (k) => {
    m.material.opacity = 1 - k;
    glow.material.opacity = 0.35 * (1 - k);
    light.intensity = 40 * (1 - k);
  });
  screenFlash("#fff8d8", 0.25);
}
function shield(pos, color = "#cfe8ff", r = 1.1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, wireframe: false }));
  m.position.copy(pos);
  spawn(m, 1.1, (k) => {
    m.scale.setScalar(0.6 + easeOut(Math.min(1, k * 3)) * 0.4);
    m.material.opacity = 0.35 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
  });
}
function projectile(kind, from, to, dur) {
  const n = kind === "rocks" ? 2 : kind === "cards" ? 4 : kind === "arrows" ? 5 : 3;
  const objs = [];
  for (let i = 0; i < n; i++) {
    let o;
    if (kind === "rocks") o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.08, 0), mat("#8d887c", { flatShading: true }));
    else if (kind === "bamboo") o = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), mat("#6fa653"));
    else if (kind === "cards") o = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.32), mat(i % 2 ? "#fffaf3" : "#d64a2b"));
    else if (kind === "arrows") o = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.5, 5), mat("#e7d6a6", { emissive: "#9b6fc7", emissiveIntensity: 0.4 }));
    else o = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.6, 5), mat("#9aa3ad", { metalness: 0.6, roughness: 0.3 }));
    o.castShadow = true;
    const off = V3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
    const a = from.clone().add(off);
    const bpt = to.clone().add(V3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
    const delay = i * 0.06;
    const arc = 1.4 + Math.random() * 0.6;
    const prev = a.clone();
    spawn(o, dur + delay, (k, dt, f) => {
      const t = clamp01((f.age - delay) / dur);
      o.visible = f.age > delay;
      const p = a.clone().lerp(bpt, t);
      p.y += Math.sin(t * Math.PI) * arc;
      o.position.copy(p);
      const dir = p.clone().sub(prev);
      if (dir.lengthSq() > 1e-6) {
        if (kind === "rocks" || kind === "cards") o.rotation.x += dt * 12;
        else o.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
      }
      prev.copy(p);
    });
    objs.push(o);
  }
}
let flashEl = null;
function screenFlash(color = "#ffffff", dur = 0.3) {
  if (REDUCED) return;
  if (!flashEl) {
    flashEl = document.createElement("div");
    flashEl.style.cssText = "position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s";
    $("#overlay").appendChild(flashEl);
  }
  flashEl.style.background = color;
  flashEl.style.transition = "none";
  flashEl.style.opacity = "0.45";
  requestAnimationFrame(() => {
    flashEl.style.transition = `opacity ${dur}s`;
    flashEl.style.opacity = "0";
  });
}

// ---------------------------------------------------------------------------------- HTML floats pinned to 3D points
const pins = [];
function pin(pos3, el, life) {
  $("#overlay").appendChild(el);
  const p = { pos: pos3.clone(), el, life, age: 0 };
  pins.push(p);
  placePin(p);
  return p;
}
function placePin(p) {
  const v = p.pos.clone().project(camera);
  const r = canvas.getBoundingClientRect();
  p.el.style.left = `${((v.x + 1) / 2) * r.width}px`;
  p.el.style.top = `${((1 - v.y) / 2) * r.height}px`;
  p.el.style.display = v.z > 1 ? "none" : "";
}
function updatePins(dt) {
  for (let i = pins.length - 1; i >= 0; i--) {
    const p = pins[i];
    p.age += dt;
    placePin(p);
    if (p.life && p.age > p.life) {
      p.el.remove();
      pins.splice(i, 1);
    }
  }
}
function floatText(pos3, text, cls = "", life = 1.7) {
  const el = document.createElement("div");
  el.className = `float ${cls}`;
  el.textContent = text;
  pin(pos3, el, life / S.speed);
}
function headOf(v) {
  if (!v) return V3();
  const h = (v.model.leader?.height || 1.1) * v.holder.scale.x;
  return v.holder.position.clone().add(V3(0, h + 0.35, 0));
}
function chestOf(v) {
  if (!v) return V3();
  const h = (v.model.leader?.height || 1.1) * v.holder.scale.x;
  return v.holder.position.clone().add(V3(0, h * 0.55, 0));
}

// ---------------------------------------------------------------------------------- camera director
const cam = { pos: V3(), look: V3(), fov: 34, from: null, to: null, t: 0, dur: 0, shake: 0, sway: 0, res: null };
function camSet(shot) {
  cam.pos.copy(shot.pos);
  cam.look.copy(shot.look);
  cam.fov = shot.fov;
  cam.to = null;
  cam.rest = !!shot.rest;
}
function camGo(shot, dur = 0.8) {
  if (REDUCED) dur = Math.min(dur, 0.25);
  cam.from = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov };
  cam.to = { pos: shot.pos.clone(), look: shot.look.clone(), fov: shot.fov ?? cam.fov };
  cam.t = 0;
  cam.dur = dur;
  cam.rest = !!shot.rest;
  return new Promise((r) => (cam.res = r));
}
// The resting shot frames every unit on the field: start from the look's own camera and pull back (in the
// Showdown, widen the lens instead, so the camera stays inside the stadium) until every figure fits between
// the rails and the menu.
const fitCam = new THREE.PerspectiveCamera();
const FIT_BOX = { classic: [-0.86, 0.86, -0.66, 0.8], table: [-0.88, 0.88, -0.72, 0.66], showdown: [-0.88, 0.88, -0.7, 0.5] };
function fieldPoints() {
  const pts = [];
  const up = V3(0, 1, 0);
  for (const k of ["atk", "def"])
    for (const v of views[k].values()) {
      if (v.visTarget < 0.5) continue;
      for (const f of v.model.figures || []) {
        if (!f.alive) continue;
        const sc = v.scaleTarget ?? v.scale;
        const p = f.root.position.clone().setY(0).applyAxisAngle(up, v.yaw ?? v.holder.rotation.y).multiplyScalar(sc).add(v.target);
        pts.push(p, p.clone().add(V3(0, (f.height || 1.2) * sc, 0)));
      }
    }
  return pts;
}
function fits(pts, box, blocks) {
  fitCam.updateMatrixWorld();
  fitCam.matrixWorldInverse.copy(fitCam.matrixWorld).invert();
  const q = V3();
  return pts.every((p) => {
    q.copy(p).project(fitCam);
    if (!(q.z < 1 && q.x > box[0] && q.x < box[1] && q.y > box[2] && q.y < box[3])) return false;
    return !blocks.some((b) => q.x > b[0] && q.x < b[1] && q.y > b[2] && q.y < b[3]);
  });
}
// The side cards that sit over the stage, in the stage's screen coordinates: nobody should stand under one.
function blockedRects() {
  const st = $("#stage")?.getBoundingClientRect();
  if (!st || !st.width || !st.height) return [];
  const out = [];
  for (const id of ["#side-mine", "#side-foe"]) {
    const r = $(id)?.getBoundingClientRect();
    if (!r || !r.width || !r.height || r.right <= st.left || r.left >= st.right || r.bottom <= st.top || r.top >= st.bottom) continue;
    const x0 = ((r.left - st.left) / st.width) * 2 - 1;
    const x1 = ((r.right - st.left) / st.width) * 2 - 1;
    const y0 = 1 - ((r.bottom - st.top) / st.height) * 2;
    const y1 = 1 - ((r.top - st.top) / st.height) * 2;
    out.push([x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03]);
  }
  return out;
}
// The safe box, raised above the text box and menu wherever they float over the bottom of the stage.
function fitBox() {
  const b = FIT_BOX[S.layout].slice();
  const st = $("#stage")?.getBoundingClientRect();
  const con = $("#console")?.getBoundingClientRect();
  if (st && con && st.height > 0 && con.height > 0 && con.top < st.bottom - 4 && con.top > st.top + st.height * 0.3) {
    b[2] = Math.max(b[2], -1 + (2 * (st.bottom - con.top + 10)) / st.height);
  }
  return b;
}
function restShot() {
  const r = SET.cams[S.persp];
  const pts = fieldPoints();
  const box = fitBox();
  fitCam.aspect = camera.aspect || 1.6;
  fitCam.near = 0.1;
  fitCam.far = 400;
  const vw = camera.view;
  if (vw && vw.enabled) fitCam.setViewOffset(vw.fullWidth, vw.fullHeight, vw.offsetX, vw.offsetY, vw.width, vw.height);
  else fitCam.clearViewOffset();
  const blocks = blockedRects();
  const dir = r.pos.clone().sub(r.look);
  const zoom = S.layout === "showdown" && !SET.narrow;
  // Slide sideways a little before backing off further, to frame the armies around the cards.
  const right = V3().crossVectors(dir.clone().negate(), V3(0, 1, 0)).normalize();
  const slides = [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36];
  let shot = null;
  for (let k = 1; k <= 3.4 && !shot; k += 0.04) {
    fitCam.fov = zoom ? Math.min(80, r.fov * Math.max(1, k / 1.12)) : r.fov;
    fitCam.updateProjectionMatrix();
    const back = zoom ? Math.min(k, 1.12) : k;
    const half = Math.tan((fitCam.fov * Math.PI) / 360) * dir.length() * back * fitCam.aspect;
    for (const sl of slides) {
      const look = r.look.clone().addScaledVector(right, sl * half);
      fitCam.position.copy(look).addScaledVector(dir, back);
      fitCam.lookAt(look);
      if (fits(pts, box, blocks)) {
        shot = { pos: fitCam.position.clone(), look, fov: fitCam.fov };
        break;
      }
    }
  }
  if (!shot) {
    fitCam.position.copy(r.look).addScaledVector(dir, zoom ? 1.12 : 3.4);
    shot = { pos: fitCam.position.clone(), look: r.look.clone(), fov: fitCam.fov };
  }
  return Object.assign(shot, { rest: true });
}
function shotOverShoulder(k) {
  const v = activeView(k);
  const t = activeView(other(k));
  if (!v || !t) return restShot();
  const a = v.holder.position.clone();
  const b = t.holder.position.clone();
  const dir = b.clone().sub(a).setY(0).normalize();
  const side = V3(-dir.z, 0, dir.x).multiplyScalar(k === "atk" ? -1 : 1);
  return { pos: a.clone().addScaledVector(dir, -3.1).addScaledVector(side, 1.4).add(V3(0, 1.9, 0)), look: b.clone().add(V3(0, 0.8, 0)), fov: 38 };
}
function shotCloseUp(k) {
  const v = activeView(k);
  if (!v) return restShot();
  const p = v.holder.position.clone();
  const o = activeView(other(k))?.holder.position || V3();
  const dir = o.clone().sub(p).setY(0).normalize();
  return { pos: p.clone().addScaledVector(dir, 3.4).add(V3(0.6, 1.3, 0)), look: p.clone().add(V3(0, 0.75, 0)), fov: 30 };
}
function shotDice() {
  const c = SET.dice.center;
  const r = restShot();
  const back = r.pos.clone().sub(c).setY(0).normalize();
  const far = { classic: 4.6, table: 4.4, showdown: 5.2 }[S.layout];
  const h = { classic: 5.2, table: 7.2, showdown: 5.6 }[S.layout];
  return { pos: c.clone().addScaledVector(back, far).add(V3(0, h, 0)), look: c.clone().addScaledVector(back, -0.3), fov: 34 };
}
function updateCam(dt, time) {
  if (cam.to) {
    cam.t += S.paused ? 0 : dt * S.speed;
    const k = ease(clamp01(cam.t / Math.max(0.001, cam.dur)));
    cam.pos.lerpVectors(cam.from.pos, cam.to.pos, k);
    cam.look.lerpVectors(cam.from.look, cam.to.look, k);
    cam.fov = cam.from.fov + (cam.to.fov - cam.from.fov) * k;
    if (k >= 1) {
      cam.to = null;
      cam.res && cam.res();
      cam.res = null;
    }
  }
  cam.shake *= Math.exp(-dt * 7);
  if (S.paused) cam.shake = 0;
  const sw = REDUCED ? 0 : S.layout === "table" ? 0.05 : 0.08;
  const p = cam.pos.clone().add(V3(Math.sin(time * 0.31) * sw, Math.sin(time * 0.23) * sw * 0.5, 0));
  if (cam.shake > 0.002 && !REDUCED) p.add(V3((Math.random() - 0.5) * cam.shake, (Math.random() - 0.5) * cam.shake, (Math.random() - 0.5) * cam.shake));
  camera.position.copy(p);
  camera.lookAt(cam.look);
  if (Math.abs(camera.fov - cam.fov) > 0.01) {
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }
}
function shake(n) {
  cam.shake = Math.max(cam.shake, n);
}

// ---------------------------------------------------------------------------------- sound
let actx = null;
function audio() {
  if (!S.sound) return null;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  } catch {
    return null;
  }
}
function sfx(kind) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const out = a.createGain();
  out.connect(a.destination);
  const tone = (f, d, type = "sine", v = 0.15, when = 0, glide) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t + when);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + when + d);
    g.gain.setValueAtTime(0.0001, t + when);
    g.gain.exponentialRampToValueAtTime(v, t + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + when + d);
    o.connect(g).connect(out);
    o.start(t + when);
    o.stop(t + when + d + 0.02);
  };
  const noise = (d, v = 0.2, f = 900) => {
    const n = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate);
    const ch = n.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2;
    const s = a.createBufferSource();
    s.buffer = n;
    const bp = a.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = f;
    const g = a.createGain();
    g.gain.value = v;
    s.connect(bp).connect(g).connect(out);
    s.start(t);
  };
  if (kind === "hit") (noise(0.18, 0.35, 700), tone(120, 0.15, "triangle", 0.2, 0, 60));
  if (kind === "crit") (noise(0.25, 0.4, 1600), tone(660, 0.25, "square", 0.08, 0.02, 990));
  if (kind === "block") tone(420, 0.12, "triangle", 0.12, 0, 300);
  if (kind === "blip") tone(880, 0.06, "square", 0.04);
  if (kind === "faint") tone(330, 0.5, "sawtooth", 0.06, 0, 90);
  if (kind === "heal") [523, 659, 784].forEach((f, i) => tone(f, 0.18, "sine", 0.08, i * 0.07));
  if (kind === "win") [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, "triangle", 0.12, i * 0.12));
  if (kind === "lose") [392, 330, 262].forEach((f, i) => tone(f, 0.32, "triangle", 0.1, i * 0.16));
  if (kind === "thunder") (noise(0.9, 0.5, 400), tone(70, 0.8, "sawtooth", 0.15, 0, 40));
  if (kind === "whoosh") noise(0.3, 0.15, 2400);
}

// ---------------------------------------------------------------------------------- narration
// Waits in game time: honours the speed setting and pauses, even when they change mid-wait.
const wait = (ms) =>
  new Promise((resolve) => {
    let left = Math.max(0, ms);
    let prev = performance.now();
    const step = () => {
      const now = performance.now();
      if (!S.paused) left -= (now - prev) * S.speed;
      prev = now;
      if (left <= 0) resolve();
      else setTimeout(step, Math.min(40, left / Math.max(0.25, S.speed)));
    };
    step();
  });
let sayId = 0;
let hurry = false;
function voice(text) {
  const n = S.replaying ? S.voiceName : null;
  if (!n) return text;
  return text.replace(/\bYour\b/g, `${n}'s`).replace(/\bYou\b/g, n).replace(/\byou\b/g, n);
}
async function say(text, hold = 650) {
  const id = ++sayId;
  hurry = false;
  const el = $("#say");
  text = voice(text);
  const chars = Array.from(text);
  const step = REDUCED ? 0 : 12;
  $("#textbox .next").hidden = true;
  if (!step) el.textContent = text;
  else {
    for (let i = 1; i <= chars.length; i += 2) {
      if (id !== sayId) return;
      if (hurry) break;
      el.textContent = chars.slice(0, i).join("");
      await wait(step);
    }
    el.textContent = text;
  }
  $("#textbox .next").hidden = false;
  await wait(hurry ? 120 : hold);
  if (id === sayId) $("#textbox .next").hidden = true;
}
$("#textbox").addEventListener("click", () => {
  hurry = true;
  audio();
});

// ---------------------------------------------------------------------------------- side panels
const typeChip = (t) => `<span class="typechip" style="--tc:${C.TYPES[t].color};--ti:${C.TYPES[t].ink}">${C.TYPES[t].label}</span>`;
function hpClass(r) {
  return r > 0.5 ? "" : r > 0.2 ? "mid" : "low";
}
function statusChips(st) {
  return Object.keys(st || {})
    .filter((k) => st[k] > 0 && C.STATUSES[k])
    .map((k) => {
      const s = C.STATUSES[k];
      return `<span class="stat ${s.good === false ? "bad" : s.good ? "good" : ""}" title="${s.label}: ${s.text}">${s.icon} ${s.label}</span>`;
    })
    .join("");
}
function sqName(sq) {
  if (sq.hero) return C.HEROES[sq.hero].name;
  return sq.count === 1 ? C.UNITS[sq.unit].label : C.UNITS[sq.unit].plural;
}
function sideTitle(k) {
  const s = S.b.sides[k];
  if (s.native) return C.NATIVE_NAMES[s.native].replace(/^the /, "The ");
  return S.replaying && k === "atk" && S.voiceName && s.name === "You" ? S.voiceName : s.name;
}
function gearIcons(sq) {
  return (sq.gear || []).map((g) => `<span title="${C.WEAPONS[g].label}: ${C.WEAPONS[g].text}">${C.WEAPONS[g].icon}</span>`).join("");
}
function hpBar(sq) {
  const max = sq.maxCount * sq.hpPer;
  const r = max ? sq.hp / max : 0;
  return `<div class="hpbar" style="--u:${100 / Math.max(1, sq.maxCount)}%"><i class="${hpClass(r)}" style="width:${(r * 100).toFixed(1)}%"></i><span class="ticks"></span></div>`;
}
function renderSides() {
  if (!S.b) return;
  for (const k of ["atk", "def"]) {
    const el = k === S.persp ? $("#side-mine") : $("#side-foe");
    const mine = k === S.persp;
    const d = S.disp[k];
    const sq = d.squads[d.active];
    const side = S.b.sides[k];
    const doc = C.DOCTRINES[side.doctrine];
    const orders = k === "def" ? `<div class="orders" title="${doc.text}">${doc.icon} Standing orders: ${doc.label}</div>` : "";
    const mom = `<div class="mom${d.momentum >= C.RULES.momentumMax ? " full" : ""}" title="Momentum: +1 per pair won. At 5, unleash a Signature move.">Momentum ${Array.from({ length: C.RULES.momentumMax }, (_, i) => `<i class="${i < d.momentum ? "on" : ""}"></i>`).join("")}</div>`;
    const reserve = `<div class="reserve">${d.squads.map((q, i) => `<span class="${i === d.active ? "on" : ""} ${q.hp <= 0 ? "down" : ""}" title="${sqName(q)}">${q.hero ? C.HEROES[q.hero].icon : C.UNITS[q.unit].icon} ${q.hero ? "" : q.count}</span>`).join("")}</div>`;
    if (!sq) {
      el.innerHTML = "";
      continue;
    }
    const sig = `${S.layout}|${k}|${mine}|${d.active}|${d.squads.length}|${sq.id}|${sq.maxCount}`;
    if (S.layout === "table") {
      const rail = d.squads
        .map((q, i) => `<div class="sq ${i === d.active ? "on" : ""} ${q.hp <= 0 ? "down" : ""}"><span>${q.hero ? C.HEROES[q.hero].icon : C.UNITS[q.unit].icon}</span><span>${sqName(q)} ${gearIcons(q)}</span><span>${q.hero ? `${q.hp}` : `×${q.count}`}</span>${hpBar(q)}</div>`)
        .join("");
      el.innerHTML = `<div class="hpbox"><div class="row1"><span class="nm">${sideTitle(k)}</span></div><div class="who">${k === "atk" ? "Attacking" : "Defending"} · ${statusChips(sq.status) || "No statuses"}</div><div class="rail">${rail}</div>${mom}${orders}</div>`;
      el.dataset.sig = sig;
      continue;
    }
    const max = sq.maxCount * sq.hpPer;
    const r = max ? sq.hp / max : 0;
    if (el.dataset.sig === sig && el.firstChild) {
      const i = el.querySelector(".hpbar i");
      i.style.width = `${(r * 100).toFixed(1)}%`;
      i.className = hpClass(r);
      el.querySelector(".cnt").textContent = sq.hero ? "" : `×${sq.count}`;
      el.querySelector(".hpn").textContent = `${Math.round(sq.hp)} / ${max}`;
      el.querySelector(".stats").innerHTML = statusChips(sq.status);
      const res = el.querySelector(".reserve");
      if (res) res.outerHTML = reserve;
      const m = el.querySelector(".mom");
      if (m) m.outerHTML = mom;
      continue;
    }
    el.dataset.sig = sig;
    el.innerHTML = `<div class="hpbox">
      <div class="row1"><span class="nm">${sqName(sq)}</span><span class="cnt">${sq.hero ? "" : `×${sq.count}`}</span></div>
      <div class="who"><span>${sideTitle(k)}</span>${typeChip(sq.type)}<span>${gearIcons(sq)}</span></div>
      ${hpBar(sq)}
      <div class="row3"><span class="stats">${statusChips(sq.status)}</span><span class="hpn">${Math.round(sq.hp)} / ${max}</span></div>
      ${reserve}${mine || S.layout === "showdown" ? mom : ""}${orders}
    </div>`;
  }
  measureConsole();
}

// ---------------------------------------------------------------------------------- menus
const CATS = [
  ["attack", "⚔️", "Attack"],
  ["defend", "🛡️", "Guard"],
  ["tactics", "✨", "Tactics"],
  ["signature", "🌟", "Signature"],
  ["bag", "🎒", "Bag"],
  ["squads", "🔁", "Squads"],
  ["retreat", "🏳️", "Retreat"],
  ["auto", "⏩", "Sun Tzu"],
];
const pips = (n) => "●".repeat(n);
function moveOdds(action) {
  try {
    const e = Battle.preview(S.b, "atk", action);
    return e;
  } catch {
    return null;
  }
}
function effWord(m) {
  if (!m) return "";
  if (m.power <= 0) return "";
  const me = Battle.activeSquad(S.b.sides.atk);
  const them = Battle.activeSquad(S.b.sides.def);
  const x = C.typeMult(me.type, them.type);
  if (x > 1) return `<span class="eff">Super effective</span>`;
  if (x < 1) return `<span class="eff resist">Not very effective</span>`;
  return "";
}
function costChips(cost) {
  const t = Battle.costText(cost);
  return t ? `<span>${t}</span>` : "";
}
function tagText(m) {
  const t = [];
  if (m.tags.includes("ranged")) t.push("ranged");
  if (m.tags.includes("pierce")) t.push("pierce");
  if (m.tags.includes("once")) t.push("once");
  if (m.tags.includes("reload")) t.push("reload");
  if (m.kind === "guard" || m.guard) t.push("guard");
  return t.length ? `<span>${t.join(" · ")}</span>` : "";
}
function renderMenu() {
  const el = $("#menu");
  if (!S.b) return;
  if (S.replaying) {
    el.innerHTML = `<p class="note">Replaying the battle as ${sideTitle("def")} saw it.</p>`;
    return;
  }
  if (S.b.over) {
    el.innerHTML = `<div class="react"><div class="opts"><button class="primary" id="m-replay">▶ Watch the replay</button><button id="m-again">↺ Fight again</button></div></div>`;
    $("#m-replay").onclick = () => startReplay();
    $("#m-again").onclick = () => newBattle();
    return;
  }
  if (S.react) return renderReaction();
  if (S.busy) {
    el.innerHTML = `<div class="cats">${CATS.map(([k, ic, label]) => `<button class="cat" disabled>${ic} ${label}</button>`).join("")}</div>`;
    return;
  }
  const g = Battle.actionsFor(S.b, "atk");
  if (!S.cat) {
    const has = (k) => (k === "auto" ? true : k === "retreat" ? g.retreat.some((a) => a.enabled) : g[k].some((a) => a.enabled));
    const full = S.b.sides.atk.momentum >= C.RULES.momentumMax;
    el.innerHTML = `<div class="cats">${CATS.map(([k, ic, label]) => `<button class="cat ${k === "signature" && full && has(k) ? "hot" : ""}" data-cat="${k}" ${has(k) ? "" : "disabled"}>${ic} ${label}${k === "bag" ? ` <small>${g.bag.length}</small>` : ""}</button>`).join("")}</div>${S.prep ? `<p class="note">${C.ITEMS[S.prep].icon} ${C.ITEMS[S.prep].label} is ready for your next move.</p>` : ""}`;
    el.querySelectorAll(".cat").forEach((b) =>
      b.addEventListener("click", () => {
        audio();
        sfx("blip");
        const k = b.dataset.cat;
        if (k === "auto") return toggleAuto(true);
        S.cat = k;
        renderMenu();
      }),
    );
    const act = Battle.activeSquad(S.b.sides.atk);
    if (!S.hover) say(`What will ${act.hero ? act.name : `your ${act.name}`} do?`, 0);
    return;
  }
  const head = (t) => `<div class="list-head"><button class="back" id="m-back">◂ Back</button><b>${t}</b></div>`;
  let body = "";
  const cat = S.cat;
  if (["attack", "defend", "tactics", "signature"].includes(cat)) {
    const list = g[cat];
    body = `<div class="moves">${list
      .map((a, i) => {
        const m = a.move;
        const sq = Battle.activeSquad(S.b.sides.atk);
        const t = C.TYPES[sq.type];
        const odds = a.enabled && m.power > 0 ? moveOdds({ kind: "move", id: m.id }) : null;
        const oddsLine = odds ? `<span class="odds">≈${odds.hits.toFixed(1)} hits · ${Math.round(odds.pAny * 100)}% to land one · ~${Math.round(odds.dealt)} dmg</span>` : m.power ? "" : `<span class="odds">${m.text.split(".")[0]}.</span>`;
        const rot = S.layout === "table" ? `--rot:${((i - (list.length - 1) / 2) * 2.2).toFixed(1)}deg;` : "";
        return `<button class="mv" style="--tc:${t.color};${rot}" data-move="${m.id}" ${a.enabled ? "" : "disabled"}>
          <span class="top"><b>${m.name}</b><span class="pips" title="${m.dice} dice">${pips(m.dice)}</span></span>
          <span class="meta">${m.bonus ? `<span>+${m.bonus}</span>` : ""}${m.power ? `<span>${m.power} power</span>` : `<span>No damage</span>`}${costChips(Battle.moveCost(S.b, m))}${tagText(m)}${effWord(m)}</span>
          ${S.layout === "table" ? `<span class="text">${m.text}</span>` : ""}
          ${a.enabled ? oddsLine : `<span class="why">${a.reason}</span>`}
        </button>`;
      })
      .join("")}</div>`;
    const titles = { attack: "Attack", defend: "Guard", tactics: "Tactics", signature: "Signature" };
    el.innerHTML = head(titles[cat]) + (list.length ? body : `<p class="note">${cat === "defend" ? "Ogres don't do defence." : "Nothing here for this squad."}</p>`);
    el.querySelectorAll(".mv").forEach((btn) => {
      const m = C.MOVE_BY_ID[btn.dataset.move];
      const show = () => {
        S.hover = m.id;
        say(`${m.name}: ${m.text} “${m.flavor}”`, 0);
      };
      btn.addEventListener("mouseenter", show);
      btn.addEventListener("focus", show);
      btn.addEventListener("click", () => {
        S.hover = null;
        playerAct({ kind: "move", id: m.id });
      });
    });
  } else if (cat === "bag") {
    body = `<div class="moves">${g.bag
      .map((a) => {
        const it = a.item;
        const when = a.when === "action" ? "Uses your turn" : a.when === "prep" ? "Before your next move" : "After the dice land";
        const armed = S.prep === a.id;
        return `<button class="mv ${armed ? "armed" : ""}" data-item="${a.id}" ${a.enabled && a.when !== "reaction" ? "" : "disabled"}>
          <span class="top"><b>${it.icon} ${it.label}</b><span>×${a.count}</span></span>
          <span class="meta"><span>${when}</span></span>
          <span class="${a.enabled ? "odds" : "why"}">${a.enabled ? (a.when === "reaction" ? "Offered when your dice land." : it.text) : a.reason}</span>
        </button>`;
      })
      .join("")}</div>`;
    el.innerHTML = head("Bag") + (g.bag.length ? body : `<p class="note">Your bag is empty. Items are bought at the Bank before a battle.</p>`);
    el.querySelectorAll(".mv").forEach((btn) => {
      const id = btn.dataset.item;
      const it = C.ITEMS[id];
      btn.addEventListener("mouseenter", () => say(`${it.label}: ${it.text}`, 0));
      btn.addEventListener("click", () => {
        if (it.when === "prep") {
          S.prep = S.prep === id ? null : id;
          S.cat = "attack";
          renderMenu();
          say(S.prep ? `${it.label} ready. Now pick a move.` : `${it.label} put away.`, 0);
          return;
        }
        playerAct({ kind: "item", id });
      });
    });
  } else if (cat === "squads") {
    const them = Battle.activeSquad(S.b.sides.def);
    body = `<div class="moves">${g.squads
      .map((a) => {
        const q = a.squad;
        const x = C.typeMult(q.type, them.type);
        const y = C.typeMult(them.type, q.type);
        const hint = x > 1 ? `<span class="eff">Beats ${C.TYPES[them.type].label}</span>` : y > 1 ? `<span class="why">Weak to ${C.TYPES[them.type].label}</span>` : "";
        return `<button class="mv" style="--tc:${C.TYPES[q.type].color}" data-to="${a.to}" ${a.enabled ? "" : "disabled"}>
          <span class="top"><b>${q.hero ? q.name : `${q.count} ${q.count === 1 ? C.UNITS[q.unit].label : q.name}`}</b>${typeChip(q.type)}</span>
          <span class="meta"><span>${Math.round(q.hp)} / ${q.maxCount * q.hpPer} HP</span>${hint}</span>
          <span class="${a.enabled ? "odds" : "why"}">${a.enabled ? "Switching takes your turn: 2 dice, no damage." : a.reason}</span>
        </button>`;
      })
      .join("")}</div>`;
    el.innerHTML = head("Squads") + (g.squads.length ? body : `<p class="note">Everyone you brought is already here.</p>`);
    el.querySelectorAll(".mv").forEach((btn) => btn.addEventListener("click", () => playerAct({ kind: "switch", to: +btn.dataset.to })));
  } else if (cat === "retreat") {
    const r = g.retreat[0];
    const shot = C.RULES.retreatShot;
    el.innerHTML =
      head("Retreat") +
      `<div class="react"><p class="note">${S.b.sides.atk.flags.noChase ? "The way home is clear: nobody can chase you." : `Pull everyone back along the gondola? The defenders get a parting shot: ${shot.dice} dice, each ${shot.hitOn} or 6 deals ${shot.damage}.`}</p><div class="opts"><button class="primary" id="m-go" ${r?.enabled ? "" : "disabled"}>🏳️ Retreat</button><button id="m-stay">Stay and fight</button></div></div>`;
    $("#m-go").onclick = () => playerAct({ kind: "retreat" });
    $("#m-stay").onclick = () => ((S.cat = null), renderMenu());
  }
  const back = $("#m-back");
  if (back)
    back.onclick = () => {
      S.cat = null;
      S.hover = null;
      renderMenu();
    };
}

function renderReaction() {
  const el = $("#menu");
  const R = S.react;
  const P = S.b.pending;
  const pairs = Battle.pairsNow(S.b);
  const won = pairs.filter((p) => p.win === "atk").length;
  const opts = Battle.reactionsFor(S.b, "atk");
  const loseIdx = new Set(pairs.filter((p) => p.win !== "atk").map((p) => p.ai));
  const chips = (k) =>
    P.dice[k]
      .map((v, i) => `<button class="d ${k === "atk" && loseIdx.has(i) ? "lose" : ""}" data-k="${k}" data-i="${i}" style="--dc:${k === "atk" ? sideColor("atk") : "#6b6457"}" ${k === "atk" && R.mode ? "" : "disabled"} title="${k === "atk" ? "Your die" : "Their die"}">${v}</button>`)
      .join("");
  el.innerHTML = `<div class="react">
    <div class="dicechips">${chips("atk")}<span class="vs">vs</span>${chips("def")}</div>
    <p class="note">${R.mode ? "Tap one of your dice to re-throw it." : `You're winning ${won} of ${pairs.length} pair${pairs.length === 1 ? "" : "s"}. Spend a reaction?`}</p>
    <div class="opts">${opts
      .map((o) => `<button data-r="${o.id}" aria-pressed="${R.mode === o.id}" title="${o.text}">${o.icon} ${o.label}${o.count ? ` ×${o.count}` : ""}</button>`)
      .join("")}<button class="primary" id="m-keep">Keep these dice ▸</button></div>
  </div>`;
  el.querySelectorAll("[data-r]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.r;
      const o = opts.find((x) => x.id === id);
      if (o.needsDie) {
        R.mode = R.mode === id ? null : id;
        renderReaction();
        return;
      }
      const e = Battle.react(S.b, "atk", id);
      R.rec.events.push(e);
      S.react = null;
      await say(e.text, 700);
      R.resolve();
    }),
  );
  el.querySelectorAll(".d[data-k='atk']").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!R.mode) return;
      const e = Battle.react(S.b, "atk", R.mode, +b.dataset.i);
      S.react = null;
      renderMenu();
      await showReroll(e, R.rec);
      R.resolve();
    }),
  );
  $("#m-keep").onclick = () => {
    S.react = null;
    R.resolve();
  };
}

// ---------------------------------------------------------------------------------- the round
function toggleAuto(on, quiet = false) {
  S.auto = on;
  $("#autobar")?.remove();
  if (quiet) return;
  if (on) {
    const b = document.createElement("button");
    b.id = "autobar";
    b.textContent = "⏩ Sun Tzu is commanding. Tap to take over.";
    b.onclick = () => toggleAuto(false);
    $("#stage").appendChild(b);
    say("Sun Tzu takes command. “Let your plans be dark and impenetrable as night.”", 400);
    if (!S.busy) autoStep();
  } else renderMenu();
}
function autoStep() {
  if (!S.auto || S.busy || !S.b || S.b.over || S.replaying) return;
  runRound(Battle.aiAction(S.b, "atk"));
}
async function playerAct(action) {
  if (S.busy || !S.b || S.b.over) return;
  audio();
  if (S.prep && action.kind === "move") action.prep = S.prep;
  S.prep = null;
  S.cat = null;
  S.hover = null;
  await runRound(action);
}
async function runRound(atkAction) {
  const gen = S.gen;
  S.busy = true;
  renderMenu();
  const b = S.b;
  const defAction = Battle.aiAction(b, "def");
  const P = Battle.beginRound(b, atkAction, defAction);
  const rec = { round: P.round, actions: { atk: atkAction, def: defAction }, events: [], throw: null, rerolls: [], end: null };
  S.records.push(rec);
  const pre = P.events.slice();
  const rollIdx = pre.findIndex((e) => e.t === "roll");
  const before = rollIdx >= 0 ? pre.slice(0, rollIdx) : pre;
  rec.events.push(...before);
  await playEvents(before, rec);
  if (gen !== S.gen) return;
  if (!P.done) {
    const rollEv = pre[rollIdx];
    rec.events.push(rollEv);
    await playEvents([rollEv], rec);
    if (gen !== S.gen) return;
    if (S.auto) {
      const r = Battle.aiReact(b, "atk");
      if (r) await showReroll(r, rec);
    } else if (Battle.reactionsFor(b, "atk").length) {
      await new Promise((resolve) => {
        S.react = { resolve, rec, mode: null };
        renderMenu();
      });
      renderMenu();
    }
    if (gen !== S.gen) return;
    const r2 = Battle.aiReact(b, "def");
    if (r2) await showReroll(r2, rec);
    const ev = Battle.finishRound(b);
    rec.events.push(...ev);
    await playEvents(ev, rec);
  } else {
    const rest = rollIdx >= 0 ? pre.slice(rollIdx) : [];
    rec.events.push(...rest);
    await playEvents(rest, rec);
    Battle.finishRound(b);
  }
  if (gen !== S.gen) return;
  rec.end = endSnapshot();
  S.disp = rec.end;
  layoutSquads();
  renderSides();
  S.busy = false;
  if (b.over) {
    await wait(400);
    showResult();
  } else {
    renderMenu();
    if (S.auto) setTimeout(autoStep, 350 / S.speed);
  }
}

async function showReroll(e, rec) {
  rec.events.push(e);
  const k = e.side;
  const die = throwDice[k][e.die];
  if (die) tray.setGlow(die, "#e8b64a");
  await say(e.text, 250);
  const recorded = S.replaying ? rec.rerolls.shift() : null;
  const r = await rethrowDie(k, e.die, e.to, recorded);
  if (!S.replaying) rec.rerolls.push(r);
  sfx("blip");
  await wait(300);
}

function actionOf(rec, k) {
  return rec.actions[k];
}
function moveOf(rec, k) {
  const a = actionOf(rec, k);
  return a && a.kind === "move" ? C.MOVE_BY_ID[a.id] : null;
}
async function announce(e, rec) {
  const a = e.action;
  const k = e.side;
  const m = a.kind === "move" ? C.MOVE_BY_ID[a.id] : null;
  const side = S.b.sides[k];
  let text = e.text;
  if (k === "def" && !side.player) text += ` (${C.DOCTRINES[side.doctrine].icon} ${C.DOCTRINES[side.doctrine].label})`;
  if (a.prep) text = `${C.ITEMS[a.prep].icon} ${text}`;
  if (m && S.layout === "showdown" && !REDUCED) cutIn(m, k);
  const v = activeView(k);
  if (m && v && (m.kind === "guard" || m.guard)) {
    v.model.play("guard");
    shield(v.holder.position, k === "atk" ? "#ffd2c4" : "#cfe8ff", 1.2);
  }
  if (S.layout === "showdown" && m) camGo(shotOverShoulder(k), 0.7);
  await say(text, 520);
}
function cutIn(m, k) {
  const el = $("#cutin");
  const sq = S.disp[k].squads[S.disp[k].active] || Battle.activeSquad(S.b.sides[k]);
  el.querySelector(".band").style.setProperty("--c", k === "atk" ? sideColor("atk") : C.TYPES[sq.type].color);
  el.querySelector("span").textContent = m.name;
  el.querySelector("small").textContent = `${sideTitle(k)} · ${sq.hero ? sq.name : sq.name}`;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  sfx("whoosh");
  clearTimeout(cutIn.t);
  cutIn.t = setTimeout(() => el.classList.remove("show"), 950 / S.speed);
}

async function playEvents(list, rec) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e._done) continue;
    switch (e.t) {
      case "use":
        await announce(e, rec);
        break;
      case "say":
        if (e.fx === "smoke") floaters(activeView(e.side === "atk" ? "def" : "atk")?.holder.position.clone().add(V3(0, 0.6, 0)) || V3(), "puff", { count: 10, size: 1.2, rise: 0.8, color: "rgba(200,200,190,.9)" });
        if (e.fx === "caltrops") burst(activeView(other(e.side))?.holder.position.clone().add(V3(0, 0.2, 0)) || V3(), { tex: emojiTexture("📌"), count: 8, size: 0.3, speed: 1.5 });
        if (e.fx === "cable") bolt(V3(0, 9, 0), SET.anchors[e.side].pos.clone(), "#dcdcdc");
        if (e.fx === "hearts") floaters(V3(0, 1, 0), "💗", { count: 8 });
        await say(e.text, 650);
        break;
      case "enter":
        await enterSquad(e);
        break;
      case "roll":
        await rollDice(e, rec);
        break;
      case "reroll":
        if (S.replaying) await showReroll(e, rec);
        break;
      case "blessing":
        floaters(SET.dice.center.clone().add(V3(0, 0.4, 0)), "🎲", { count: 5, size: 0.35 });
        await say(e.text, 600);
        break;
      case "pairs":
        await showPairs(e);
        await clash(list, i, rec);
        break;
      case "damage":
        await damageFx(e, rec);
        break;
      case "heal":
        await healFx(e);
        break;
      case "status":
        await statusFx(e);
        break;
      case "momentum":
        applyAfter(e);
        renderSides();
        if (e.value >= C.RULES.momentumMax && e.side === "atk") floatText(headOf(activeView("atk")), "Signature ready!", "tag");
        break;
      case "faint":
        applyAfter(e);
        {
          const v = views[e.side].get(e.squad);
          if (v) v.model.setCount(0);
        }
        sfx("faint");
        renderSides();
        await say(e.text, 700);
        break;
      case "reinforce":
      case "convert":
        applyAfter(e);
        for (const k of ["atk", "def"]) for (const sq of S.disp[k].squads) syncCount(k, sq);
        layoutSquads();
        renderSides();
        floaters(headOf(activeView(e.side)), e.t === "convert" ? "💗" : "✨", { count: 6 });
        sfx("heal");
        await say(e.text, 800);
        break;
      case "bribe":
        applyAfter(e);
        for (const sq of S.disp[other(e.side)].squads) syncCount(other(e.side), sq);
        floaters(headOf(activeView(other(e.side))), "💰", { count: 6 });
        renderSides();
        await say(e.text, 900);
        break;
      case "smite":
        applyAfter(e);
        {
          const t = activeView(other(e.side));
          bolt(V3(t?.holder.position.x || 0, 12, t?.holder.position.z || 0), t?.holder.position.clone() || V3(), "#fff6a8");
          sfx("thunder");
          shake(0.35);
          for (const sq of S.disp[other(e.side)].squads) syncCount(other(e.side), sq);
          renderSides();
        }
        await say(e.text, 1000);
        break;
      case "steal":
        floaters(headOf(activeView(e.side)), "🃏", { count: 3 });
        await say(e.text, 800);
        break;
      case "cure":
        applyAfter(e);
        renderSides();
        floaters(headOf(activeView(e.side)), "plus", { count: 6, color: "#7fe07a" });
        await say(e.text, 600);
        break;
      case "item":
        floaters(headOf(activeView(e.side)), C.ITEMS[e.item].icon, { count: 3, size: 0.4 });
        await say(e.text, 600);
        break;
      case "end":
        sfx(e.winner === "atk" ? "win" : "lose");
        {
          const w = activeView(e.winner);
          if (w) w.model.play("cheer");
          if (S.layout === "showdown") burst(V3(0, 3, 0), { count: 40, color: "#e8b64a", speed: 4, gravity: -4, life: 2, size: 0.18 });
          await camGo(restShot(), 0.8);
        }
        await say(e.text, 1200);
        break;
      default:
        if (e.text) await say(e.text, 600);
    }
  }
}

function syncCount(k, sq) {
  const v = ensureView(k, sq);
  if (!v) return;
  if (v.shown !== sq.count) {
    const up = sq.count > v.shown;
    v.shown = sq.count;
    v.model.setCount(Math.max(0, sq.count));
    if (up) burst(v.holder.position.clone().add(V3(0, 0.6, 0)), { tex: emojiTexture("star"), color: "#bff5a8", count: 10 });
  }
}

// A squad steps up: it marches from its place in the reserves to the front while the camera reframes the field.
async function enterSquad(e) {
  applyAfter(e);
  const k = e.side;
  layoutSquads();
  camGo(restShot(), 0.9);
  renderSides();
  const said = say(e.text, 500);
  const v = activeView(k);
  if (v) {
    syncCount(k, S.disp[k].squads[S.disp[k].active]);
    for (let t = 0; t < 2600 && (v.marching || v.pos.distanceTo(v.target) > 0.25); t += 100) await wait(100);
    burst(v.target.clone().add(V3(0, 0.3, 0)), { tex: emojiTexture("puff"), color: "#fffaf3", count: 10, size: 0.7, speed: 1.4, gravity: 0, life: 0.7 });
    v.model.play("cheer");
  }
  await said;
}

async function rollDice(e, rec) {
  S.lastRoll = e;
  const parting = !e.atk.length;
  if (!parting) await camGo(shotDice(), 0.55);
  const vals = { atk: e.atk, def: e.def };
  const recorded = S.replaying ? rec.throw : null;
  const p = doThrow(vals.atk, vals.def, recorded);
  const note = e.plans
    ? `🎲 ${sideTitle("atk")} ${vals.atk.length} ${vals.atk.length === 1 ? "die" : "dice"} ${e.plans.atk.bonus >= 0 ? "+" : ""}${e.plans.atk.bonus} · ${sideTitle("def")} ${vals.def.length} ${vals.def.length === 1 ? "die" : "dice"} ${e.plans.def.bonus >= 0 ? "+" : ""}${e.plans.def.bonus}`
    : "🎲 Parting shot!";
  say(note, 0);
  const res = await p;
  if (!S.replaying) rec.throw = res;
  await wait(250);
}

// Line the dice up in pairs, highest against highest, and show who won each pair.
async function showPairs(e) {
  const pairs = e.pairs;
  const c = SET.dice.center.clone();
  const r = restShot();
  const toCam = r.pos.clone().sub(c).setY(0).normalize();
  const right = V3(toCam.z, 0, -toCam.x).multiplyScalar(-1);
  const gap = DIE * (S.layout === "table" ? 3.2 : 2.5);
  const n = Math.max(throwDice.atk.length, throwDice.def.length);
  const rowNear = S.persp === "atk" ? "atk" : "def";
  const place = (k, slot) => {
    const off = (slot - (n - 1) / 2) * gap;
    const depth = (k === rowNear ? 1 : -1) * DIE * 1.25;
    const p = c.clone().addScaledVector(right, off).addScaledVector(toCam, depth);
    return { x: p.x, y: SET.dice.floorY + DIE / 2, z: p.z };
  };
  const jobs = [];
  const usedA = new Set(pairs.map((p) => p.ai));
  const usedD = new Set(pairs.map((p) => p.di));
  pairs.forEach((p, i) => {
    jobs.push(tray.arrange(throwDice.atk[p.ai], place("atk", i), { duration: 0.55, lift: 0.7 }));
    jobs.push(tray.arrange(throwDice.def[p.di], place("def", i), { duration: 0.55, lift: 0.7 }));
  });
  let extraA = pairs.length;
  let extraD = pairs.length;
  throwDice.atk.forEach((d, i) => {
    if (!usedA.has(i)) jobs.push(tray.arrange(d, place("atk", extraA++), { duration: 0.55, lift: 0.4 }));
  });
  throwDice.def.forEach((d, i) => {
    if (!usedD.has(i)) jobs.push(tray.arrange(d, place("def", extraD++), { duration: 0.55, lift: 0.4 }));
  });
  await camGo(shotDice(), 0.3);
  await Promise.all(jobs);
  const chips = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const a = place("atk", i);
    const d = place("def", i);
    const mid = V3((a.x + d.x) / 2, SET.dice.floorY + DIE * 0.3, (a.z + d.z) / 2);
    const el = document.createElement("div");
    const aw = p.win === "atk";
    const mineWon = p.win === S.persp;
    el.className = `pairchip ${mineWon ? "good" : "bad"}`;
    const label = p.win === "atk" ? (p.crit ? "Crit!" : "Hit") : p.tie ? "Tie" : p.crit ? "Crit!" : "Block";
    el.innerHTML = `<b class="${aw ? "w" : "x"}">${p.a}</b><span>${p.tie ? "=" : aw ? "▸" : "◂"}</span><b class="${aw ? "x" : "w"}">${p.d}</b><em>${label}</em>`;
    el.title = `${sideTitle("atk")} ${p.aRaw}+${e.bonus.atk} = ${p.a} against ${sideTitle("def")} ${p.dRaw}+${e.bonus.def} = ${p.d}${p.tie ? " (tie)" : ""}`;
    chips.push(pin(mid, el, 0));
    tray.setGlow(throwDice[p.win][p.win === "atk" ? p.ai : p.di], p.crit ? "#ff7a5a" : "#e8b64a");
    sfx(p.win === "atk" ? "blip" : "block");
    await wait(260);
  }
  const aw = pairs.filter((p) => p.win === "atk").length;
  const ties = pairs.filter((p) => p.tie).length;
  const tieNote = ties ? ` ${ties === 1 ? "A tie goes" : "Ties go"} to ${e.tieWinner === "def" ? sideTitle("def") : sideTitle("atk")}.` : "";
  const who = sideTitle("atk");
  await say(`${who} ${who === "You" && !S.voiceName ? "win" : "wins"} ${aw} of ${pairs.length} pair${pairs.length === 1 ? "" : "s"}.${tieNote}`, 900);
  S.pairChips = chips;
}
function clearPairChips() {
  for (const p of S.pairChips || []) {
    p.el.remove();
    const i = pins.indexOf(p);
    if (i >= 0) pins.splice(i, 1);
  }
  S.pairChips = [];
}

// Each side's move plays out: strikes fly at the other squad, guards brace, tactics cast.
function fadeDice() {
  if (!tray) return;
  const list = [...tray.dice];
  const start = list.map((d) => d.group.scale.x);
  const obj = new THREE.Object3D();
  spawn(obj, 0.3, (k) => {
    list.forEach((d, j) => d.group.scale.setScalar(Math.max(0.001, start[j] * (1 - easeOut(k)))));
    if (k >= 1) tray.clear();
  });
}
async function clash(list, i, rec) {
  clearPairChips();
  fadeDice();
  await camGo(restShot(), 0.55);
  for (const k of ["atk", "def"]) {
    const m = moveOf(rec, k);
    const dmg = list.slice(i + 1).find((x) => x.t === "damage" && x.by === k && !x._done);
    const v = activeView(k);
    if (!v) continue;
    if (dmg) {
      dmg._done = true;
      await strike(k, m, dmg);
      // The rest of the army is watching: the reserves cheer their side's hits.
      for (const rv of reservesOf(k)) if (!rv.marching && Math.random() < 0.7) rv.model.play("cheer");
    } else if (m && m.power > 0) {
      await whiff(k, m);
    } else if (m && m.kind === "tactic") {
      const r = v.model.play(m.anim === "cheer" ? "cheer" : "cast");
      castFx(k, m);
      await wait((r.duration || 0.8) * 700);
    }
  }
  if (S.layout === "showdown") camGo(restShot(), 0.6);
  tray.dice.forEach((d) => tray.setGlow(d, null));
}
function castFx(k, m) {
  const v = activeView(k);
  const t = activeView(other(k));
  const self = v ? headOf(v) : V3();
  const them = t ? headOf(t) : V3();
  switch (m.fx) {
    case "hearts":
      floaters(them, "💗", { count: 7 });
      break;
    case "zzz":
      floaters(self, "💤", { count: 5 });
      break;
    case "steam":
      floaters(self, "puff", { count: 8, size: 0.6, color: "rgba(255,170,150,.9)" });
      shake(0.08);
      break;
    case "roar":
      ringWave(v.holder.position, "#c4442c", 3.2, 0.8);
      ringWave(v.holder.position, "#c4442c", 2.2, 0.6);
      shake(0.18);
      break;
    case "music":
      floaters(self, "🎵", { count: 6 });
      break;
    case "heal":
      floaters(self, "plus", { count: 8, color: "#7fe07a" });
      break;
    case "sparkle":
      burst(self, { tex: emojiTexture("star"), color: "#fff1a8", count: 16, speed: 1.8 });
      break;
    case "lightning":
      bolt(V3(them.x, 12, them.z), them.clone().setY(0.2));
      sfx("thunder");
      break;
    case "cable":
      bolt(V3(self.x, 10, self.z), self.clone(), "#d9d9d9");
      break;
    case "cards":
      burst(self, { tex: emojiTexture("🃏"), count: 6, size: 0.35, speed: 1.4 });
      break;
    case "coins":
      floaters(self, "🪙", { count: 6 });
      break;
    case "smoke":
      floaters(self, "puff", { count: 10, size: 1, color: "rgba(210,210,200,.9)" });
      break;
    default:
      burst(self, { count: 10 });
  }
}
async function strike(k, m, dmg) {
  const v = activeView(k);
  const tv = views[dmg.side].get(dmg.squad) || activeView(other(k));
  if (!v || !tv) return damageFx(dmg);
  const anim = !m ? "attack" : m.anim === "guard" ? "attack" : m.anim === "cheer" ? "attack" : m.anim;
  if (S.layout === "showdown") camGo(shotOverShoulder(k), 0.45);
  const r = v.model.play(anim);
  const impact = Math.max(0.25, r.impact || 0.4);
  const from = chestOf(v);
  const to = chestOf(tv);
  if (anim === "attack") {
    const dir = tv.holder.position.clone().sub(v.holder.position).setY(0);
    const dist = dir.length();
    v.lunge = { t: 0, dur: (r.duration || 0.8) + 0.15, peak: Math.min(0.8, impact / ((r.duration || 0.8) + 0.15)), dir: dir.normalize(), dist: Math.min(S.layout === "table" ? 1.1 : 1.9, Math.max(0, dist - 2.4) * 0.5) };
    sfx("whoosh");
  } else if (anim === "throw") projectile(m?.fx === "rocks" ? "rocks" : m?.fx === "bamboo" ? "bamboo" : m?.fx === "cards" ? "cards" : m?.fx === "arrows" ? "arrows" : "javelin", from, to, impact * 0.9);
  else if (anim === "cast") castFx(k, m || { fx: "sparkle" });
  await wait(impact * 1000);
  if (S.layout === "showdown") camGo(shotCloseUp(dmg.side), 0.25);
  await damageFx(dmg, m);
  await wait(Math.max(0, (r.duration || 0.8) - impact) * 600);
}
async function whiff(k, m) {
  const v = activeView(k);
  const tv = activeView(other(k));
  if (!v || !tv) return;
  const anim = m.anim === "guard" ? "attack" : m.anim;
  const r = v.model.play(anim);
  const impact = Math.max(0.25, r.impact || 0.4);
  if (anim === "attack") {
    const dir = tv.holder.position.clone().sub(v.holder.position).setY(0);
    const dist = dir.length();
    v.lunge = { t: 0, dur: (r.duration || 0.8) + 0.15, peak: Math.min(0.8, impact / ((r.duration || 0.8) + 0.15)), dir: dir.normalize(), dist: Math.min(S.layout === "table" ? 0.9 : 1.4, Math.max(0, dist - 2.6) * 0.4) };
  } else if (anim === "throw") projectile(m.fx === "rocks" ? "rocks" : m.fx === "bamboo" ? "bamboo" : m.fx === "cards" ? "cards" : m.fx === "arrows" ? "arrows" : "javelin", chestOf(v), chestOf(tv), impact * 0.9);
  await wait(impact * 1000);
  tv.model.play("guard");
  sfx("block");
  floatText(headOf(tv), k === "atk" ? "Blocked!" : "Held off!", "tag miss");
  await wait(Math.max(0, (r.duration || 0.8) - impact) * 600 + 250);
}

async function damageFx(e, m) {
  const tv = views[e.side].get(e.squad) || activeView(e.side);
  const before = S.disp[e.side].squads.find((x) => x.id === e.squad);
  const prevCount = before ? before.count : 0;
  applyAfter(e);
  const pos = tv ? headOf(tv) : V3();
  if (tv) {
    if (!e.source) {
      tv.model.play("hit");
      tv.model.flash("#ffffff", 0.18);
    } else tv.model.flash(e.source === "burning" ? "#ff8a3a" : "#ffffff", 0.2);
    const fxKind = m?.fx || (e.source === "caltrops" ? "caltrops" : e.source === "splash" ? "rocks" : "impact");
    const hitPos = chestOf(tv);
    if (fxKind === "lightning") bolt(V3(hitPos.x, 12, hitPos.z), hitPos);
    else if (fxKind === "rocks") burst(hitPos, { tex: emojiTexture("spark"), color: "#c9c2b0", count: 14, speed: 3 });
    else if (fxKind === "slash") burst(hitPos, { tex: emojiTexture("spark"), color: "#e8f4ff", count: 12, speed: 3.2 });
    else burst(hitPos, { tex: emojiTexture("star"), color: e.crits ? "#ff9a7a" : "#fff3b0", count: 16, speed: 3 });
    if (e.source === "burning") floaters(hitPos, "🔥", { count: 4 });
  }
  const big = e.amount >= 15;
  sfx(e.crits ? "crit" : "hit");
  shake(Math.min(0.4, 0.05 + e.amount / 80));
  if (e.crits) screenFlash("#fff1e0", 0.25);
  floatText(pos, e.amount ? `−${e.amount}` : "0", big ? "" : "small");
  if (e.eff === "super") setTimeout(() => floatText(pos.clone().add(V3(0, 0.45, 0)), "Super effective!", "tag"), 120 / S.speed);
  if (e.eff === "resist") setTimeout(() => floatText(pos.clone().add(V3(0, 0.45, 0)), "Not very effective…", "tag resist"), 120 / S.speed);
  if (e.crits) setTimeout(() => floatText(pos.clone().add(V3(0, 0.85, 0)), e.crits > 1 ? `${e.crits} crits!` : "Critical hit!", "tag crit"), 240 / S.speed);
  renderSides();
  const after = S.disp[e.side].squads.find((x) => x.id === e.squad);
  if (after) syncCount(e.side, after);
  let text = e.text;
  if (!e.source) {
    const bits = [];
    if (e.eff === "super") bits.push("It's super effective!");
    if (e.eff === "resist") bits.push("It's not very effective…");
    if (e.crits) bits.push(e.crits > 1 ? `${e.crits} critical hits!` : "A critical hit!");
    const fell = prevCount - (after ? after.count : 0);
    const who = after ? (after.hero ? after.name : after.name) : "";
    bits.push(fell > 0 ? `${fell} ${who} ${fell === 1 ? "fell" : "fell"}.` : `${who} took ${e.amount}.`);
    text = bits.join(" ");
  }
  await say(text, 700);
}
async function healFx(e) {
  applyAfter(e);
  const v = e.squad ? views[e.side].get(e.squad) : activeView(e.side);
  if (v) {
    floaters(chestOf(v), "plus", { count: 7, color: "#7fe07a" });
    floatText(headOf(v), `+${e.amount}`, "heal");
  }
  for (const sq of S.disp[e.side].squads) syncCount(e.side, sq);
  sfx("heal");
  renderSides();
  await say(e.text, 650);
}
async function statusFx(e) {
  applyAfter(e);
  const s = C.STATUSES[e.status];
  const v = e.squad ? views[e.side].get(e.squad) : activeView(e.side);
  if (v) floatText(headOf(v).add(V3(0, 0.3, 0)), `${s.icon}`, "status");
  renderSides();
  await say(e.text, 600);
}

// ---------------------------------------------------------------------------------- result & replay
function goodsLine(g) {
  return Battle.costText(g) || "nothing";
}
function unitLine(u) {
  const t = Object.entries(u || {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${C.UNITS[k].icon}`)
    .join("  ");
  return t || "none";
}
function showResult() {
  const b = S.b;
  const sm = Battle.summary(b);
  const won = b.result.winner === "atk";
  let best = null;
  for (const r of S.records) for (const e of r.events) if (e.t === "damage" && e.by && (!best || e.amount > best.amount)) best = { ...e, round: r.round };
  const el = $("#result");
  const luck = (x) => (x ? `${x.toFixed(1)} avg${x >= 3.8 ? " (hot)" : x <= 3.2 ? " (cold)" : ""}` : "no rolls");
  el.innerHTML = `<div class="card" role="dialog" aria-label="Battle result">
    <p class="eyebrow">${b.round} round${b.round === 1 ? "" : "s"} · Battle for ${S.scenario.place}</p>
    <h2>${b.result.text}</h2>
    <div class="grid">
      <div><b>You lost</b><p>${unitLine(sm.atk.lost)}</p></div>
      <div><b>They lost</b><p>${unitLine(sm.def.lost)}</p></div>
      <div><b>Survivors moving in</b><p>${won ? unitLine(sm.atk.survivors) : "nobody"}</p></div>
      <div><b>Spent in battle</b><p>${goodsLine(sm.atk.spent)}</p></div>
      <div><b>Your dice</b><p>${luck(sm.atk.luck)}</p></div>
      <div><b>Their dice</b><p>${luck(sm.def.luck)}</p></div>
    </div>
    ${best ? `<p class="moment">Biggest hit: round ${best.round}, ${best.amount} damage${best.crits ? " with a crit" : ""}${best.eff === "super" ? ", super effective" : ""}.</p>` : ""}
    <div class="actions">
      <button class="btn" id="r-replay">▶ Watch the replay</button>
      <button class="btn ghost" id="r-again">↺ Fight again</button>
      <button class="btn ghost" id="r-next">Next battle</button>
    </div>
    <p class="moment">The replay is what ${sideTitle("def")} sees when they log in: the same dice, the same throws, from their side of the field.</p>
  </div>`;
  el.hidden = false;
  $("#r-replay").onclick = () => startReplay();
  $("#r-again").onclick = () => newBattle();
  $("#r-next").onclick = () => {
    const i = SCENARIOS.indexOf(S.scenario);
    S.scenario = SCENARIOS[(i + 1) % SCENARIOS.length];
    $("#scenario").value = S.scenario.id;
    newBattle();
  };
  renderMenu();
}

// Plays recorded rounds back through the same renderer. Used by "Watch the replay" and by the catch-up page.
async function replayRecords({ scenario, seed, records, final, persp = "def", voiceName = null, rounds = null, bar = true, onDone = null }) {
  const gen = ++S.gen;
  $("#result").hidden = true;
  toggleAuto(false, true);
  S.scenario = scenario;
  S.seed = seed;
  const fresh = scenarioBattle(scenario, seed);
  S.b = final || fresh;
  S.replaying = true;
  S.persp = persp;
  S.voiceName = voiceName;
  S.busy = true;
  S.disp = dispFrom(fresh);
  let first = true;
  const list = rounds ? records.filter((r) => rounds.includes(r.round)) : records;
  if (rounds && list.length) {
    const i = records.indexOf(list[0]);
    if (i > 0) S.disp = structuredClone(records[i - 1].end);
  }
  rebuildWorld(true);
  $("#replaybar")?.remove();
  if (bar) {
    const el = document.createElement("div");
    el.id = "replaybar";
    el.innerHTML = `<span>Replay · as <b>${sideTitle(persp)}</b> sees it</span><button class="icon-btn" id="rp-speed">${S.speed > 1 ? "1×" : "2×"}</button><button class="icon-btn" id="rp-stop">✕ Close</button>`;
    $("#stage").appendChild(el);
    $("#rp-speed").onclick = () => setSpeed(S.speed > 1 ? 1 : 2);
    $("#rp-stop").onclick = () => stopReplay();
  }
  renderMenu();
  renderSides();
  if (!rounds) await say(`${voice("You")} rode the gondola into ${scenario.place}.`.replace(/^You rode/, "You rode"), 700);
  for (const rec of list) {
    if (gen !== S.gen) return false;
    if (!first && rounds) {
      S.disp = structuredClone(records[records.indexOf(rec) - 1].end);
      rebuildWorld(true);
    }
    first = false;
    const copy = { ...rec, events: rec.events.map((e) => ({ ...e, _done: false })), rerolls: [...(rec.rerolls || [])] };
    await playEvents(copy.events, copy);
    if (gen !== S.gen) return false;
    S.disp = structuredClone(rec.end);
    layoutSquads();
    renderSides();
  }
  if (gen !== S.gen) return false;
  if (onDone) onDone();
  return true;
}
async function startReplay() {
  if (S.replaying) return;
  const live = S.b;
  const ok = await replayRecords({ scenario: S.scenario, seed: S.seed, records: S.records, final: live, persp: "def", voiceName: S.scenario.replayName });
  if (ok) stopReplay(true);
}
function stopReplay(finished = false) {
  S.gen++;
  S.replaying = false;
  S.voiceName = null;
  S.persp = "atk";
  S.busy = false;
  $("#replaybar")?.remove();
  S.disp = dispFrom(S.b);
  rebuildWorld(true);
  renderSides();
  if (S.b.over) showResult();
  else renderMenu();
  if (finished) say("That's the whole battle, exactly as it happened.", 0);
}

// A whole battle fought computer against computer, recorded round by round, with no animation.
function simulateRecords(sc, seed) {
  const b = scenarioBattle(sc, seed);
  const records = [];
  let guard = 0;
  while (!b.over && guard++ < 40) {
    const a = Battle.aiAction(b, "atk");
    const d = Battle.aiAction(b, "def");
    const P = Battle.beginRound(b, a, d);
    if (!P.done) {
      Battle.aiReact(b, "atk");
      Battle.aiReact(b, "def");
    }
    Battle.finishRound(b);
    const L = b.log[b.log.length - 1];
    records.push({ round: L.round, actions: L.actions, events: L.events, throw: null, rerolls: [], end: dispFrom(b) });
  }
  return { b, records };
}

// ---------------------------------------------------------------------------------- world lifecycle
let builtStyle = null;
function rebuildWorld(keepCam = false) {
  if (world.set) {
    world.root.remove(world.set.group);
    const seen = new Set();
    world.set.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const key of ["map", "emissiveMap", "roughnessMap", "normalMap"]) if (m[key] && !m[key].userData?.shared) m[key].dispose();
        m.dispose();
      }
    });
    if (scene.background && scene.background.isTexture) scene.background.dispose();
  }
  clearViews();
  // Switching looks: free the old style's figure geometry (it's cached per style), or memory piles up.
  if (builtStyle && builtStyle !== S.style) Models.clearCache(builtStyle);
  builtStyle = S.style;
  for (const f of fx.splice(0)) world.fx.remove(f.obj);
  clearPairChips();
  SET = buildSet(S.layout, S.scenario.terrain);
  world.set = SET;
  world.root.add(SET.group);
  makeTray();
  makePointRings();
  for (const k of ["atk", "def"]) for (const sq of S.disp[k].squads) ensureView(k, sq);
  for (const k of ["atk", "def"])
    for (const sq of S.disp[k].squads) {
      const v = views[k].get(sq.id);
      v.shown = sq.count;
      v.model.setCount(Math.max(0, sq.count));
    }
  layoutSquads(true);
  // The cards first: the resting shot frames the armies around them.
  renderSides();
  camSet(restShot());
  void keepCam;
  document.querySelector("#app").dataset.layout = S.layout;
  measureConsole();
}
function newBattle() {
  S.gen++;
  toggleAuto(false);
  $("#result").hidden = true;
  $("#replaybar")?.remove();
  S.replaying = false;
  S.persp = "atk";
  S.seed = (S.seed * 16807 + 11) % 2147483647 || 7;
  S.b = scenarioBattle(S.scenario, S.seed);
  S.disp = dispFrom(S.b);
  S.records = [];
  S.busy = true;
  S.cat = null;
  S.prep = null;
  S.react = null;
  rebuildWorld();
  renderSides();
  renderMenu();
  const gen = S.gen;
  (async () => {
    for (const e of S.b.opening) {
      if (gen !== S.gen) return;
      if (e.t === "damage") await damageFx(e);
      else if (e.t === "enter") {
        const v = views[e.side].get(e.squad);
        if (v) v.model.play("cheer");
        await say(e.text, 450);
      } else await say(e.text, 600);
    }
    if (gen !== S.gen) return;
    S.busy = false;
    renderMenu();
  })();
}

// ---------------------------------------------------------------------------------- controls
function segButtons(el, list, current, onPick) {
  el.innerHTML = list.map(([k, label]) => `<button data-k="${k}" aria-pressed="${k === current}">${label}</button>`).join("");
  el.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onPick(b.dataset.k);
    }),
  );
}
function setSpeed(n) {
  S.speed = n;
  $("#speed")?.setAttribute("aria-pressed", String(n > 1));
  const rp = $("#rp-speed");
  if (rp) rp.textContent = n > 1 ? "1×" : "2×";
}
function setLayout(k) {
  S.layout = k;
  store.set("pdb-layout", k);
  if (S.busy && !S.replaying) {
    S.pendingRebuild = true;
    document.querySelector("#app").dataset.layout = k;
    return;
  }
  rebuildWorld();
  renderSides();
  renderMenu();
}
function setStyle(k) {
  S.style = k;
  store.set("pdb-style", k);
  if (S.busy && !S.replaying) {
    S.pendingRebuild = true;
    return;
  }
  rebuildWorld();
  renderSides();
}
if ($("#layouts")) segButtons($("#layouts"), LAYOUT_LIST, S.layout, setLayout);
if ($("#styles")) segButtons($("#styles"), STYLE_LIST, S.style, setStyle);
if ($("#scenario")) {
  $("#scenario").innerHTML = SCENARIOS.map((s) => `<option value="${s.id}">${s.title}</option>`).join("");
  $("#scenario").addEventListener("change", (ev) => {
    S.scenario = SCENARIOS.find((x) => x.id === ev.target.value) || SCENARIOS[0];
    newBattle();
  });
}
$("#speed")?.addEventListener("click", () => setSpeed(S.speed > 1 ? 1 : 2));
function setSound(on) {
  S.sound = on;
  const b = $("#sound");
  if (b) {
    b.setAttribute("aria-pressed", String(S.sound));
    b.textContent = S.sound ? "🔊" : "🔇";
  }
  try {
    Dice.setSound && Dice.setSound(S.sound);
  } catch {
    /* no audio */
  }
  if (S.sound) audio();
}
$("#sound")?.addEventListener("click", () => setSound(!S.sound));
// Tap a die in the 3D scene during a reaction to re-throw it.
const ray = new THREE.Raycaster();
canvas.addEventListener("pointerdown", async (ev) => {
  audio();
  if (!S.react || !S.react.mode || !tray) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: ((ev.clientX - r.left) / r.width) * 2 - 1, y: -((ev.clientY - r.top) / r.height) * 2 + 1 }, camera);
  const die = tray.pick(ray);
  const i = throwDice.atk.indexOf(die);
  if (i < 0) return;
  const R = S.react;
  const e = Battle.react(S.b, "atk", R.mode, i);
  S.react = null;
  renderMenu();
  await showReroll(e, R.rec);
  R.resolve();
});

// ---------------------------------------------------------------------------------- sizing & loop
function measureConsole() {
  const app = $("#app");
  const con = $("#console");
  const h = con.getBoundingClientRect().height;
  app.style.setProperty("--console-h", `${Math.round(h)}px`);
  applyViewport();
}
function applyViewport() {
  const st = $("#stage").getBoundingClientRect();
  const w = Math.max(1, st.width);
  const h = Math.max(1, st.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // When the text box floats over the bottom of the stage, aim the camera at the part you can see.
  const overlay = S.layout === "classic" && getComputedStyle($("#console")).position === "absolute";
  const ch = overlay ? $("#console").getBoundingClientRect().height + 20 : 0;
  if (ch > 0 && ch < h * 0.6) camera.setViewOffset(w, h + ch, 0, ch, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
new ResizeObserver(() => {
  applyViewport();
  if (!SET) return;
  // Turning a phone between portrait and landscape re-forms the ranks.
  if (S.narrow !== isNarrow()) {
    S.narrow = isNarrow();
    if (S.layout === "showdown" && SET.narrow !== S.narrow) {
      if (S.busy && !S.replaying) S.pendingRebuild = true;
      else {
        rebuildWorld();
        renderSides();
      }
    } else layoutSquads(true);
  }
  if (!cam.to && (cam.rest || !S.busy)) camSet(restShot());
}).observe($("#stage"));
new ResizeObserver(() => measureConsole()).observe($("#console"));

let last = performance.now();
const clock0 = performance.now();
function tick(now) {
  // (The first frame can be stamped before the page finished loading: never step time backwards.)
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  const sdt = S.paused ? 0 : dt * S.speed;
  const time = (now - clock0) / 1000;
  if (S.pendingRebuild && !S.busy) {
    S.pendingRebuild = false;
    rebuildWorld();
    renderSides();
    renderMenu();
  }
  tray && tray.update(sdt);
  updateViews(sdt);
  updateFx(sdt);
  updateCam(dt, time);
  updatePins(dt);
  if (SET?.crowd) {
    const cr = SET.crowd;
    const m4 = new THREE.Matrix4();
    const base = cr.userData.base;
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      m4.makeTranslation(b.x, b.y + Math.abs(Math.sin(time * 3 + b.p)) * 0.12, b.z);
      cr.setMatrixAt(i, m4);
    }
    cr.instanceMatrix.needsUpdate = true;
  }
  if (SET?.spots) SET.spots.forEach((s, i) => s.target.position.set(Math.sin(time * 0.6 + i * 2) * 2.2, 0, Math.cos(time * 0.5 + i) * 1.6));
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------------- boot
const ARENA_MODE = (window.ARENA_CONFIG && window.ARENA_CONFIG.mode) || "play";
function setPaused(p) {
  S.paused = p;
}
window.__arena = { get SET() { return SET; }, S, Battle, views, SCENARIOS, setPaused, get tray() { return tray; }, playerAct, startReplay, stopReplay, newBattle, toggleAuto, setSpeed, setLayout, setStyle, setSound, replayRecords, simulateRecords, rebuildWorld, dispFrom, scenarioBattle, say, renderSides, applyViewport };
applyViewport();
if (ARENA_MODE === "play") newBattle();
else if (window.ARENA_CONFIG && window.ARENA_CONFIG.ready) window.ARENA_CONFIG.ready(window.__arena);
requestAnimationFrame(tick);
