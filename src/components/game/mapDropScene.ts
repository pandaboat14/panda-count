// Map Drop: the start-of-turn roll, thrown onto a tabletop world map. The roller's two dice hover in
// their colour until they're tapped or flicked, bounce across the map and land on the server's roll. The
// regions with that number light up and their resources fly to each Kird's purse at the table's edge; on
// a 7 an ogre stomps in and empties the fullest purses instead.
// Plain three.js on a canvas, torn down by dispose(), so a React effect can own it.
import { geoEquirectangular, geoPath } from "d3-geo";
import {
  ACESFilmicToneMapping,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import type { GameView } from "@/game/engine";
import { REGIONS, type Resource } from "@/game/regions";
import { GOOD_INFO, RESOURCES } from "@/game/rules";
import type { Payout, RollShow } from "@/game/rollReport";
import { canvasTex, cloudTexture, emojiTexture, grain, woodTexture } from "../dice/textures";
import { createTray, mulberry32, randomQuat, type Pose, type ThrowRecord, type Velocity } from "../dice/tray";
import { EMPTY_RIM, FOG_COLORS, NATIVE_COLORS, RESOURCE_COLORS, inkOn } from "./colors";

export type DropPhase = "loading" | "waiting" | "holding" | "rolling" | "landed" | "done";

export type MapDropOptions = {
  host: HTMLElement; // the stage: it takes the taps and flicks, and holds the canvas and the purse tags
  view: GameView;
  show: RollShow;
  payouts: Payout[];
  live: boolean; // wait for the player to throw; otherwise the dice throw themselves (a replay)
  still: boolean; // reduced motion: the dice land at once and nothing flies
  sound: boolean;
  onPhase: (phase: DropPhase) => void;
};

export type MapDropStage = {
  replay(): void; // the throw again, exactly as everyone else sees it
  skip(): void; // straight to where everything lands
  setSound(on: boolean): void;
  dispose(): void;
};

// The board: 18 × 9.6 world units, equirectangular with a little vertical stretch (lat 84° N to 62° S).
const MAP_W = 18;
const MAP_D = 9.6;
const mapX = (lng: number) => (lng / 360) * MAP_W;
const mapZ = (lat: number) => -(lat - 11) * 0.066;
const DIE = 0.85;
const HOVER: [number, number, number][] = [
  [-0.7, 2.3, 3.6],
  [0.7, 2.3, 3.6],
];
const PURSE_Z = MAP_D / 2 + 1.55;
// Where the dice go once they've landed: the empty South Pacific corner, out of the way.
const CORNER = [
  { x: -MAP_W / 2 + 0.8, z: MAP_D / 2 - 0.75 },
  { x: -MAP_W / 2 + 1.9, z: MAP_D / 2 - 0.75 },
];
// Tokens from regions the viewer can't see rise off the far edge of the board, spread along it.
const FOG_EDGE_X = [-2.9, 4.3, -5.7, 7.1, -1.5, 1.5];
const OGRE_AT = new Vector3(0, 1.1, -0.6);

// The throw everyone sees for a roll: where the dice start and how hard they're thrown, all from the seed.
function seededThrow(seed: number): { from: Pose[]; velocity: Velocity } {
  const rng = mulberry32(seed ^ 0x5eed5eed);
  const from = HOVER.map((p): Pose => ({ p: [...p], q: randomQuat(rng) }));
  return { from, velocity: { x: (rng() - 0.5) * 5, y: 3.5 + rng() * 1.5, z: -(9 + rng() * 3.5) } };
}

// The site's own fonts, by the names next/font gave them, for text painted onto the map.
function siteFont(variable: string, fallback: string) {
  const name = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return name ? `${name}, ${fallback}` : fallback;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
const _v3 = new Vector3();

// Pull the camera back along a fixed pitch until every point fits the frame.
function fitCamera(cam: PerspectiveCamera, target: Vector3, pts: Vector3[], pitchDeg: number, fill: number) {
  const pitch = (pitchDeg * Math.PI) / 180;
  const dir = new Vector3(0, Math.sin(pitch), Math.cos(pitch));
  let lo = 2, hi = 150;
  for (let i = 0; i < 28; i++) {
    const d = (lo + hi) / 2;
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let m = 0;
    for (const p of pts) {
      _v3.copy(p).project(cam);
      m = Math.max(m, Math.abs(_v3.x), Math.abs(_v3.y));
    }
    if (m > fill) lo = d;
    else hi = d;
  }
  cam.position.copy(target).addScaledVector(dir, hi);
  cam.lookAt(target);
  cam.updateMatrixWorld();
}
const boxPoints = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const out: Vector3[] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(new Vector3(x, y, z));
  return out;
};

// The flat world: sea, the same Natural Earth coastlines as the game's globe, a graticule and a compass.
function mapTexture(serif: string) {
  const LW = 2048, LH = Math.round((2048 * MAP_D) / MAP_W);
  const lx = (lng: number) => ((lng + 180) / 360) * LW;
  const ly = (lat: number) => ((mapZ(lat) + MAP_D / 2) / MAP_D) * LH;
  return canvasTex(LW, LH, (g) => {
    g.fillStyle = "#6fa592";
    g.fillRect(0, 0, LW, LH);
    const og = g.createRadialGradient(LW / 2, LH / 2, LH * 0.2, LW / 2, LH / 2, LW * 0.7);
    og.addColorStop(0, "rgba(255,255,255,0.07)");
    og.addColorStop(1, "rgba(0,30,20,0.2)");
    g.fillStyle = og;
    g.fillRect(0, 0, LW, LH);
    g.strokeStyle = "rgba(255,250,243,0.14)";
    g.lineWidth = 2;
    for (let lng = -180; lng <= 180; lng += 20) {
      g.beginPath();
      g.moveTo(lx(lng), 0);
      g.lineTo(lx(lng), LH);
      g.stroke();
    }
    for (let lat = -60; lat <= 80; lat += 20) {
      g.beginPath();
      g.moveTo(0, ly(lat));
      g.lineTo(LW, ly(lat));
      g.stroke();
    }
    // Trace the land in projected radians, squeezed onto the board by the canvas transform…
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    g.setTransform(LW / (2 * Math.PI), 0, 0, ((180 / Math.PI) * 0.066 * LH) / MAP_D, LW / 2, ly(0));
    g.beginPath();
    geoPath(geoEquirectangular().scale(1).translate([0, 0]), g)(feature(topo, topo.objects.land));
    // …then paint it with plain pixel-sized strokes.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineJoin = "round";
    g.strokeStyle = "rgba(255,250,243,0.22)";
    g.lineWidth = 16;
    g.stroke();
    g.fillStyle = "#f3e6c8";
    g.fill("evenodd");
    g.strokeStyle = "#b3955c";
    g.lineWidth = 3;
    g.stroke();
    // A compass rose in the South Pacific.
    const cx = lx(-115), cy = ly(-40);
    g.strokeStyle = g.fillStyle = "rgba(255,250,243,0.55)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, 46, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
      g.lineTo(cx + Math.cos(a + 0.5) * 16, cy + Math.sin(a + 0.5) * 16);
      g.lineTo(cx + Math.cos(a - 0.5) * 16, cy + Math.sin(a - 0.5) * 16);
      g.closePath();
      g.fill();
    }
    g.font = `800 30px ${serif}`;
    g.textAlign = "center";
    g.fillText("N", cx, cy - 82);
    grain(g, LW, LH, 9, 99);
  });
}

type Tile = { id: string; token: number; group: Group; disc: Mesh; discMat: MeshStandardMaterial; beam: Mesh; beamMat: MeshBasicMaterial; lit: number; target: number; strong: boolean };
type Purse = { pid: string; mesh: Mesh; bounce: number; tag: HTMLDivElement; tally: HTMLSpanElement };
type Anim = { fn: (t: number, dt: number) => boolean; t: number; resolve: () => void };

export function createMapDrop(o: MapDropOptions): MapDropStage {
  const { host, view, show, live, still } = o;
  // A canvas of its own, so losing its context on the way out can't touch the next one.
  const canvas = document.createElement("canvas");
  canvas.className = "dice-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const tagLayer = document.createElement("div");
  tagLayer.className = "purse-tags";
  tagLayer.setAttribute("aria-hidden", "true");
  // Throws without WebGL; the caller shows flat dice instead.
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  host.append(canvas, tagLayer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  // Everything made here is freed in dispose().
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (trash.push(x), x);
  const input = new AbortController();
  const timers = new Map<number, () => void>();
  let disposed = false;
  let rushing = false; // Skip: everything from here on lands at once
  const fast = () => still || rushing;
  const sleep = (s: number) =>
    new Promise<void>((resolve) => {
      if (fast() || s <= 0) return resolve();
      const t = window.setTimeout(() => {
        timers.delete(t);
        resolve();
      }, s * 1000);
      timers.set(t, resolve);
    });

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = keep(pmrem.fromScene(room, 0.04)).texture;
  scene.environmentIntensity = 0.5;
  room.dispose();
  pmrem.dispose();
  const camera = new PerspectiveCamera(32, 1.8, 0.1, 300);
  scene.add(new HemisphereLight("#fff6e8", "#3b2a1c", 1.05));
  const key = new DirectionalLight("#fff0da", 2.1);
  key.position.set(-6, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 1024);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 9, bottom: -9, near: 1, far: 60 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  // The table and the board the map sits in.
  const table = new Mesh(
    keep(new PlaneGeometry(60, 40)),
    keep(new MeshStandardMaterial({ map: keep(woodTexture({ base: "#5a3820", seed: 21, w: 1024, h: 256, repeat: [3, 6] })), roughness: 0.6 })),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.14;
  table.receiveShadow = true;
  scene.add(table);
  const board = new Mesh(keep(new RoundedBoxGeometry(MAP_W + 0.8, 0.14, MAP_D + 0.8, 2, 0.06)), keep(new MeshStandardMaterial({ color: "#2f2016", roughness: 0.7 })));
  board.position.y = -0.075;
  board.receiveShadow = true;
  scene.add(board);

  // A purse per Kird at the table's edge, in seat order, each with a name tag that keeps a running tally.
  const players = [...view.players].sort((a, b) => a.seat - b.seat);
  const colorOf = new Map(players.map((p) => [p.id, p.color]));
  const n = players.length;
  const spacing = Math.min(4.3, 16.4 / Math.max(1, n - 1));
  const purseScale = Math.min(1, spacing / 2.5);
  const purseGeo = keep(
    new LatheGeometry(
      [[0, 0], [0.55, 0], [0.7, 0.06], [0.84, 0.26], [0.92, 0.52], [0.98, 0.6], [0.9, 0.62], [0.8, 0.36], [0.66, 0.14], [0, 0.12]].map(([x, y]) => new Vector2(x, y)),
      40,
    ),
  );
  const purses: Purse[] = players.map((p, i) => {
    const mesh = new Mesh(purseGeo, keep(new MeshStandardMaterial({ color: p.color, roughness: 0.45, metalness: 0.05 })));
    mesh.position.set((i - (n - 1) / 2) * spacing, -0.12, PURSE_Z);
    mesh.scale.setScalar(purseScale);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const tag = document.createElement("div");
    tag.className = "purse-tag";
    tag.style.setProperty("--c", p.color);
    const name = document.createElement("span");
    name.className = "nm";
    name.textContent = p.id === view.me ? "You" : `${p.bot ? "🤖 " : ""}${p.name}`;
    const tally = document.createElement("span");
    tally.className = "tally";
    tag.append(name, tally);
    tagLayer.append(tag);
    return { pid: p.id, mesh, bounce: 0, tag, tally };
  });
  const purseOf = (pid: string) => purses.find((p) => p.pid === pid);

  // The roller's dice, in their colour, hovering where the seeded throw starts.
  const tray = createTray({ scene, bounds: { minX: -MAP_W / 2, maxX: MAP_W / 2, minZ: -MAP_D / 2, maxZ: MAP_D / 2 }, floorY: 0, wallHeight: 8, dieSize: DIE, surface: "wood", sound: o.sound });
  const dieColor = colorOf.get(show.roller ?? "") ?? colorOf.get(view.me) ?? "#d64a2b";
  const seeded = seededThrow(show.seq);
  for (const pose of seeded.from) {
    const d = tray.addDie({ style: { face: dieColor, pip: inkOn(dieColor) } });
    d.group.position.fromArray(pose.p);
    d.group.quaternion.fromArray(pose.q);
  }
  const values = [...show.roll];

  // Painted numbers use the site's own font once it's in (see the end of this function).
  let numFont = "system-ui, sans-serif";

  // Resource tokens that fly to the purses; plain "card" tokens for other Kirds' raid losses (theirs are private).
  const tokenGeo = keep(new CylinderGeometry(0.26, 0.26, 0.08, 28));
  const tokenMats = new Map<string, MeshStandardMaterial[]>();
  const tokenFor = (kind: Resource | "card") => {
    let mats = tokenMats.get(kind);
    if (!mats) {
      const color = kind === "card" ? "#c9b48a" : RESOURCE_COLORS[kind];
      const face =
        kind === "card"
          ? emojiTexture("?", { bg: "#fbf3df", ring: "#8a6a3a", font: numFont, color: "#6b4e24" })
          : emojiTexture(GOOD_INFO[kind].icon, { bg: "#fbf3df", ring: color });
      const side = keep(new MeshStandardMaterial({ color, roughness: 0.5 }));
      mats = [side, keep(new MeshStandardMaterial({ map: keep(face), roughness: 0.5 })), side];
      tokenMats.set(kind, mats);
    }
    const m = new Mesh(tokenGeo, mats);
    m.castShadow = true;
    return m;
  };
  const puffMat = keep(new SpriteMaterial({ map: keep(cloudTexture()), transparent: true, depthWrite: false }));
  const flyers = new Set<Mesh | Sprite>();

  // The ogre who comes for the fullest purses on a 7.
  const ogreMat = keep(new SpriteMaterial({ map: keep(emojiTexture("👹", { size: 256 })), transparent: true, depthWrite: false }));
  const ogre = new Sprite(ogreMat);
  ogre.visible = false;
  scene.add(ogre);
  const ringMat = keep(new MeshBasicMaterial({ color: "#b3261e", transparent: true, opacity: 0, depthWrite: false }));
  const ogreRing = new Mesh(keep(new RingGeometry(1.1, 1.45, 64)), ringMat);
  ogreRing.rotation.x = -Math.PI / 2;
  ogreRing.position.set(OGRE_AT.x, 0.03, OGRE_AT.z);
  scene.add(ogreRing);

  // ---------------------------------------------------------------- the map and its regions (after the fonts)

  const tiles: Tile[] = [];
  function buildMap(serif: string) {
    const map = new Mesh(keep(new PlaneGeometry(MAP_W, MAP_D)), keep(new MeshStandardMaterial({ map: keep(mapTexture(serif)), roughness: 0.92 })));
    map.rotation.x = -Math.PI / 2;
    map.position.y = 0.001;
    map.receiveShadow = true;
    scene.add(map);

    // Tiles like the globe's: owner rim, resource hex, number token. Only what the viewer can see is shown:
    // a fogged region is grey, and its size doesn't give away whether anyone holds it.
    const tokenTextures = new Map<number, Texture>();
    const tokenTexture = (num: number) => {
      let t = tokenTextures.get(num);
      if (!t) {
        t = keep(
          canvasTex(128, 128, (g) => {
            g.fillStyle = "#fbf3df";
            g.beginPath();
            g.arc(64, 64, 62, 0, Math.PI * 2);
            g.fill();
            g.lineWidth = 4;
            g.strokeStyle = "rgba(28,27,23,.18)";
            g.stroke();
            g.fillStyle = num === 6 || num === 8 ? "#b3261e" : "#1c1b17";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.font = `800 ${num >= 10 ? 56 : 64}px ${numFont}`;
            g.fillText(String(num), 64, 56);
            const dots = 6 - Math.abs(7 - num);
            for (let i = 0; i < dots; i++) {
              g.beginPath();
              g.arc(64 + (i - (dots - 1) / 2) * 11, 100, 4, 0, Math.PI * 2);
              g.fill();
            }
          }),
        );
        tokenTextures.set(num, t);
      }
      return t;
    };
    const regionView = new Map(view.regions.map((r) => [r.id, r]));
    const pos = REGIONS.map((def) => {
      const r = regionView.get(def.id);
      const held = Boolean(r && !r.fog && r.owner);
      return { def, r, held, x: mapX(def.lng), z: mapZ(def.lat), ax: mapX(def.lng), az: mapZ(def.lat), rad: held ? 0.34 : 0.26 };
    });
    // Nudge crowded tiles apart, then let them drift back toward where they really are.
    for (let it = 0; it < 160; it++) {
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j];
          let dx = b.x - a.x, dz = b.z - a.z;
          const d = Math.hypot(dx, dz) || 0.001, need = (a.rad + b.rad) * 1.08;
          if (d < need) {
            const push = (need - d) / 2;
            dx /= d;
            dz /= d;
            a.x -= dx * push;
            a.z -= dz * push;
            b.x += dx * push;
            b.z += dz * push;
          }
        }
      }
      for (const p of pos) {
        p.x += (p.ax - p.x) * 0.04;
        p.z += (p.az - p.z) * 0.04;
      }
    }
    const beamAlpha = keep(
      canvasTex(
        8,
        128,
        (g) => {
          const gr = g.createLinearGradient(0, 0, 0, 128);
          gr.addColorStop(0, "rgba(255,255,255,0)");
          gr.addColorStop(1, "rgba(255,255,255,1)");
          g.fillStyle = gr;
          g.fillRect(0, 0, 8, 128);
        },
        { srgb: false },
      ),
    );
    // Shared geometry and materials keep 60-odd tiles cheap; only each number disc and beam is its own (they glow).
    const shared = new Map<string, CylinderGeometry | MeshStandardMaterial>();
    const once = <T extends CylinderGeometry | MeshStandardMaterial>(k: string, make: () => T) => {
      if (!shared.has(k)) shared.set(k, keep(make()));
      return shared.get(k) as T;
    };
    const sideMat = keep(new MeshStandardMaterial({ color: "#efe2c4", roughness: 0.6 }));
    for (const p of pos) {
      if (!p.r) continue;
      const { r, rad } = p;
      const fog = r.fog;
      const owner = !fog && r.owner ? colorOf.get(r.owner) ?? "#888888" : null;
      const rimColor = fog ? FOG_COLORS.rim : owner ?? (r.native ? NATIVE_COLORS[r.native] : EMPTY_RIM);
      const hexColor = fog ? FOG_COLORS.tile : RESOURCE_COLORS[p.def.resource];
      const group = new Group();
      group.position.set(p.x, 0, p.z);
      const rim = new Mesh(
        once(`rg${rad}`, () => new CylinderGeometry(rad * 1.16, rad * 1.16, 0.035, 6)),
        once(`rm${rimColor}`, () => new MeshStandardMaterial({ color: rimColor, roughness: 0.6 })),
      );
      rim.position.y = 0.018;
      const hex = new Mesh(
        once(`hg${rad}`, () => new CylinderGeometry(rad, rad, 0.03, 6)),
        once(`hm${hexColor}`, () => new MeshStandardMaterial({ color: hexColor, roughness: 0.7 })),
      );
      hex.position.y = 0.045;
      const discMat = keep(new MeshStandardMaterial({ map: tokenTexture(r.token), roughness: 0.55, emissive: new Color("#ffc94a"), emissiveIntensity: 0 }));
      if (fog) discMat.color.set("#d9d6cf");
      const disc = new Mesh(once(`tg${rad}`, () => new CylinderGeometry(rad * 0.64, rad * 0.64, 0.03, 28)), [sideMat, discMat, sideMat]);
      disc.rotation.y = Math.PI / 2;
      disc.position.y = 0.075;
      rim.receiveShadow = hex.receiveShadow = disc.receiveShadow = true;
      const beamMat = keep(
        new MeshBasicMaterial({ color: owner ?? "#fffaf3", alphaMap: beamAlpha, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }),
      );
      const beam = new Mesh(once(`bg${rad}`, () => new CylinderGeometry(rad * 0.55, rad * 0.9, 1.5, 24, 1, true)), beamMat);
      beam.position.y = 0.8;
      beam.visible = false;
      group.add(rim, hex, disc, beam);
      scene.add(group);
      tiles.push({ id: r.id, token: r.token, group, disc, discMat, beam, beamMat, lit: 0, target: 0, strong: Boolean(owner) });
    }
  }

  // ---------------------------------------------------------------- staging

  let phase: DropPhase = "loading";
  const setPhase = (p: DropPhase) => {
    if (phase === p || disposed) return;
    phase = p;
    o.onPhase(p);
  };
  const anims: Anim[] = [];
  const animate = (fn: Anim["fn"]) => new Promise<void>((resolve) => anims.push({ fn, t: 0, resolve }));
  // Skip: run every animation to its end right now.
  const flushAnims = () => {
    for (const a of anims.splice(0)) {
      a.fn(1e6, 0);
      a.resolve();
    }
  };
  let clock = 0;
  let hovering = true; // the dice bob where the throw starts, waiting
  let hold: { target: Vector3; axes: Vector3[] } | null = null; // the dice follow a finger mid-flick
  let run = 0; // bumped by every throw, so a stale landing sequence stops

  const drawTally = (pu: Purse, parts: { text: string; cls: string; res?: Resource }[]) => {
    pu.tally.replaceChildren(
      ...parts.map((p) => {
        const s = document.createElement("span");
        s.className = p.cls;
        s.textContent = p.text;
        if (p.res) s.style.setProperty("--res", RESOURCE_COLORS[p.res]);
        return s;
      }),
    );
    layout();
  };
  const bump = (pu: Purse) => {
    pu.bounce = 1;
    pu.tag.classList.add("bump");
    const settle = () => pu.tag.classList.remove("bump");
    const t = window.setTimeout(() => {
      timers.delete(t);
      settle();
    }, 180);
    timers.set(t, settle);
  };

  function reset() {
    flushAnims();
    for (const f of flyers) scene.remove(f);
    flyers.clear();
    for (const t of tiles) t.target = 0;
    ogre.visible = false;
    ringMat.opacity = 0;
    for (const pu of purses) drawTally(pu, []);
  }

  // A token's arc from one spot to another; `onArrive` fires as it lands.
  function fly(kind: Resource | "card", from: Vector3, to: Vector3, delay: number, onArrive: () => void, dur = 0.85) {
    if (fast()) {
      onArrive();
      return Promise.resolve();
    }
    const m = tokenFor(kind);
    m.position.copy(from);
    m.visible = false;
    scene.add(m);
    flyers.add(m);
    const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 3.2);
    return animate((t) => {
      const tt = t - delay;
      if (tt < 0) return false;
      m.visible = true;
      const k = Math.min(1, tt / dur), e = easeInOut(k);
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      m.position.set(a * from.x + b * mid.x + c * to.x, a * from.y + b * mid.y + c * to.y, a * from.z + b * mid.z + c * to.z);
      m.rotation.set(Math.sin(e * Math.PI) * 0.9, e * 9, 0);
      if (k < 1) return false;
      scene.remove(m);
      flyers.delete(m);
      onArrive();
      return true;
    });
  }
  // A puff of fog at the board's edge, where tokens from regions the viewer can't see come from.
  function puff(at: Vector3, delay: number) {
    if (fast()) return;
    const s = new Sprite(puffMat.clone());
    trash.push(s.material);
    s.position.copy(at).setY(0.25);
    s.scale.set(0.01, 0.01, 1);
    s.material.opacity = 0;
    scene.add(s);
    flyers.add(s);
    void animate((t) => {
      const k = clamp((t - delay + 0.2) / 1.3, 0, 1);
      const grow = 0.4 + 0.6 * Math.sin(Math.min(1, k * 1.4) * (Math.PI / 2));
      s.scale.set(2.6 * grow, 1.3 * grow, 1);
      s.position.y = 0.25 + k * 0.5;
      s.material.opacity = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
      if (k < 1) return false;
      scene.remove(s);
      flyers.delete(s);
      return true;
    });
  }

  // After the dice come to rest: clear the map, light the rolled number, and pay everyone out.
  async function land(myRun: number) {
    const stale = () => disposed || myRun !== run;
    await sleep(0.3);
    if (stale()) return;
    await Promise.all(tray.dice.map((d, i) => tray.arrange(d, CORNER[i], { duration: fast() ? 0 : 0.55, lift: 0.9 })));
    if (stale()) return;
    setPhase("landed");
    const tallies = new Map(purses.map((pu) => [pu.pid, new Map<Resource, number>()]));
    if (show.total !== 7) {
      for (const t of tiles) t.target = t.token === show.total ? 1 : 0;
      await sleep(0.55);
      if (stale()) return;
      const flights: Promise<void>[] = [];
      let fogged = 0;
      o.payouts.forEach((pay, i) => {
        const pu = purseOf(pay.player);
        if (!pu) return; // they've left the game since
        const arrive = () => {
          const t = tallies.get(pay.player)!;
          t.set(pay.resource, (t.get(pay.resource) ?? 0) + 1);
          drawTally(
            pu,
            RESOURCES.filter((g) => t.has(g)).map((g) => ({ text: `+${t.get(g)} ${GOOD_INFO[g].icon}`, cls: "g", res: g })),
          );
          bump(pu);
          tray.clack("die", 0.35);
        };
        const to = pu.mesh.position.clone().setY(0.55);
        const tile = pay.region ? tiles.find((t) => t.id === pay.region) : undefined;
        if (tile) {
          flights.push(fly(pay.resource, tile.group.position.clone().setY(0.35), to, i * 0.22, arrive));
        } else {
          // From somewhere in the fog: it rises off the far edge of the board, not from any one region.
          const from = new Vector3(FOG_EDGE_X[fogged++ % FOG_EDGE_X.length], -0.3, -MAP_D / 2 - 0.35);
          puff(from, i * 0.22);
          flights.push(fly(pay.resource, from, to, i * 0.22, arrive, 1.05));
        }
      });
      await Promise.all(flights);
    } else {
      // Ogre raid: the ogre stomps in and takes half from anyone carrying more than nine cards.
      ogre.visible = true;
      ogre.position.set(OGRE_AT.x, 0.2, OGRE_AT.z);
      ogre.scale.setScalar(0.01);
      tray.clack("felt", 1);
      await animate((t) => {
        const k = fast() ? 1 : Math.min(1, t / 0.6);
        ogre.scale.setScalar(Math.max(0.01, 2.6 * easeOutBack(k)));
        ogre.position.y = 0.2 + 1.3 * k;
        ringMat.opacity = 0.7 * k;
        return k >= 1;
      });
      if (stale()) return;
      const flights: Promise<void>[] = [];
      let k = 0;
      for (const pu of purses) {
        if (!show.raided) break; // an older roll: all we know is what its text says
        const count = show.raided[pu.pid] ?? 0;
        if (!count) {
          drawTally(pu, [{ text: "safe", cls: "s" }]);
          continue;
        }
        // Your own losses fly out as what they really were; everyone else's as plain cards.
        const mine = pu.pid === view.me && show.raid ? RESOURCES.flatMap((g) => Array<Resource>(show.raid!.lost[g] ?? 0).fill(g)) : null;
        const tokens: (Resource | "card")[] = mine ?? Array<"card">(Math.min(count, 8)).fill("card");
        let gone = 0;
        tokens.forEach((kind, j) => {
          // With more cards than tokens, each token carries its share, so the tally ends on the real count.
          const share = Math.round((count * (j + 1)) / tokens.length) - Math.round((count * j) / tokens.length);
          const arrive = () => {
            gone += share;
            drawTally(pu, [{ text: `−${gone}`, cls: "l" }]);
            bump(pu);
            tray.clack("die", 0.25);
          };
          flights.push(fly(kind, pu.mesh.position.clone().setY(0.55), OGRE_AT.clone(), k++ * 0.1, arrive, 0.7));
        });
      }
      await Promise.all(flights);
    }
    if (stale()) return;
    await sleep(0.35);
    if (stale()) return;
    setPhase("done");
  }

  // Throw the dice: the seeded throw everyone sees, or the player's own flick (which only they see).
  async function throwDice(flick: Velocity | null, lead = 0.22) {
    const myRun = ++run;
    hovering = false;
    hold = null;
    reset();
    for (const d of tray.dice) tray.setGlow(d, null);
    setPhase("rolling");
    const thrown = flick
      ? tray.throw({ values, seed: show.seq, velocity: flick, spin: 18 })
      : tray.throw({ values, seed: show.seq, from: seeded.from, velocity: seeded.velocity, spin: 18, lead });
    if (fast()) tray.settle();
    let record: ThrowRecord;
    try {
      record = await thrown;
    } catch {
      return;
    }
    if (disposed || myRun !== run || !record) return;
    await land(myRun);
  }

  // ---------------------------------------------------------------- input: tap, flick, or Space/Enter

  const raycaster = new Raycaster();
  const toNdc = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onPlane = (ndc: Vector2, y: number) => {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), new Vector3());
  };
  if (live) {
    let st: { id: number; x: number; y: number; drag: boolean; samples: { t: number; x: number; z: number }[] } | null = null;
    const opts = { signal: input.signal };
    host.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button > 0 || phase !== "waiting") return;
        st = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, samples: [] };
        try {
          host.setPointerCapture(e.pointerId);
        } catch {
          /* not supported */
        }
      },
      opts,
    );
    host.addEventListener(
      "pointermove",
      (e) => {
        if (!st) {
          if (e.pointerType === "mouse" && phase === "waiting") {
            raycaster.setFromCamera(toNdc(e), camera);
            host.style.cursor = tray.pick(raycaster) ? "grab" : "pointer";
          }
          return;
        }
        if (e.pointerId !== st.id) return;
        if (!st.drag && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 9) {
          st.drag = true;
          host.style.cursor = "grabbing";
          hovering = false;
          for (const d of tray.dice) tray.setGlow(d, null);
          hold = { target: tray.dice[0].group.position.clone(), axes: tray.dice.map(() => new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()) };
          setPhase("holding");
        }
        if (!st.drag || !hold) return;
        const p = onPlane(toNdc(e), 2.3);
        if (!p) return;
        // Timed by when the finger moved, not when we got round to it: slow phones still flick true.
        st.samples.push({ t: e.timeStamp, x: p.x, z: p.z });
        if (st.samples.length > 24) st.samples.shift();
        hold.target.set(clamp(p.x, -MAP_W / 2 + 1.5, MAP_W / 2 - 1.5), 2.3, clamp(p.z, -MAP_D / 2 + 0.8, MAP_D / 2 - 0.6));
      },
      opts,
    );
    const up = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      host.style.cursor = "";
      if (!s.drag) {
        if (phase === "waiting") void throwDice(null);
        return;
      }
      if (phase !== "holding") return; // skipped mid-drag: it's already thrown
      // Turn the last tenth of a second of dragging into a throw; a limp flick is just a tap.
      const now = e.timeStamp;
      const recent = s.samples.filter((q) => now - q.t < 120);
      let flick: Velocity | null = null;
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        const dt = Math.max(0.03, (b.t - a.t) / 1000);
        const vx = (b.x - a.x) / dt, vz = (b.z - a.z) / dt;
        const speed = Math.hypot(vx, vz);
        if (speed >= 2.5) {
          const k = clamp(speed * 0.6, 8, 24) / speed;
          flick = { x: vx * k, y: 5.5 + Math.min(2.5, speed * 0.04), z: vz * k };
        }
      }
      void throwDice(flick, 0.3);
    };
    host.addEventListener("pointerup", up, opts);
    host.addEventListener("pointercancel", up, opts);
    host.addEventListener(
      "keydown",
      (e) => {
        if ((e.key === "Enter" || e.key === " ") && phase === "waiting") {
          e.preventDefault();
          void throwDice(null);
        }
      },
      opts,
    );
  }

  // ---------------------------------------------------------------- frame, size, and the loop

  // Name tags sit under their purses; a crowded table staggers them over two rows.
  function layout() {
    const w = host.clientWidth, h = host.clientHeight;
    const rowEnd = [-Infinity, -Infinity];
    let tall = 0;
    const spots = purses.map((pu) => {
      _v3.set(pu.mesh.position.x, 0.6, pu.mesh.position.z + 0.95 * purseScale).project(camera);
      const x = ((_v3.x + 1) / 2) * w, half = pu.tag.offsetWidth / 2;
      const row = x - half < rowEnd[0] + 4 ? 1 : 0;
      rowEnd[row] = x + half;
      tall = Math.max(tall, pu.tag.offsetHeight);
      return { x, y: ((1 - _v3.y) / 2) * h, row };
    });
    const rows = spots.some((s) => s.row) ? 2 : 1;
    const top = Math.min(h - rows * (tall + 4) - 6, ...spots.map((s) => s.y));
    purses.forEach((pu, i) => {
      pu.tag.style.left = `${spots[i].x}px`;
      pu.tag.style.top = `${top}px`;
      pu.tag.style.setProperty("--dy", `${spots[i].row * (tall + 4)}px`);
    });
  }
  function fit() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Room below the purses for their tags (two rows of them at a crowded table).
    const pts = boxPoints(-MAP_W / 2 - 0.4, MAP_W / 2 + 0.4, 0, 0.6, -MAP_D / 2 - 0.4, PURSE_Z + (n > 5 ? 3.6 : 2.1));
    pts.push(new Vector3(0, 2.8, 3.6));
    fitCamera(camera, new Vector3(0, 0, 1.2), pts, 57, 0.97);
    layout();
    // Resizing wipes the canvas, and this runs after the frame's own render: draw again now, or it flashes.
    renderer.render(scene, camera);
  }
  const resize = new ResizeObserver(() => fit());
  resize.observe(host);
  fit();

  const spinAxis = new Vector3(0.3, 1, 0.2).normalize();
  const _q = new Quaternion();
  function update(dt: number) {
    clock += dt;
    if (hovering && !tray.rolling) {
      tray.dice.forEach((d, i) => {
        const bob = still ? 0 : Math.sin(clock * 2.2 + i * 1.3) * 0.12;
        d.group.position.set(seeded.from[i].p[0], seeded.from[i].p[1] + bob, seeded.from[i].p[2]);
        if (!still) d.group.quaternion.premultiply(_q.setFromAxisAngle(spinAxis, dt * (0.7 + i * 0.25)));
      });
    }
    if (hold) {
      const k = 1 - Math.exp(-dt * 16);
      tray.dice.forEach((d, i) => {
        d.group.position.lerp(_v3.copy(hold!.target).add(new Vector3((i - 0.5) * 1.3, 0, 0)), k);
        d.group.quaternion.premultiply(_q.setFromAxisAngle(hold!.axes[i], dt * 5));
      });
    }
    const pulse = still ? 1 : 0.8 + 0.2 * Math.sin(clock * 6);
    for (const t of tiles) {
      t.lit += (t.target - t.lit) * Math.min(1, dt * (fast() ? 30 : 7));
      const l = t.lit;
      const s = 1 + l * 0.35;
      t.disc.scale.set(s, 1 + l * 2, s);
      t.disc.position.y = 0.075 + l * 0.22;
      t.discMat.emissiveIntensity = l * (t.strong ? 0.55 : 0.25) * pulse;
      t.beam.visible = l > 0.02;
      t.beamMat.opacity = l * (t.strong ? 0.6 : 0.3) * pulse;
    }
    for (const pu of purses) {
      pu.bounce = Math.max(0, pu.bounce - dt * 4);
      const s = purseScale * (1 + Math.sin(pu.bounce * Math.PI) * 0.12);
      pu.mesh.scale.set(s, purseScale + (s - purseScale) * 1.6, s);
    }
    if (ogre.visible && !still) ringMat.opacity = 0.45 + 0.25 * Math.sin(clock * 5);
    tray.update(dt);
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      if (a.fn(a.t, dt)) {
        anims.splice(i, 1);
        a.resolve();
      }
    }
  }
  let frame = 0;
  let last = performance.now();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  // Paint the map once the site's fonts are in (the numbers use them), then wait for the throw.
  const serif = siteFont("--font-fraunces", "Georgia, serif");
  numFont = siteFont("--font-bricolage", "system-ui, sans-serif");
  const fontsIn = document.fonts
    ? Promise.race([Promise.all([document.fonts.load(`800 64px ${numFont}`), document.fonts.load(`800 30px ${serif}`)]), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
    : Promise.resolve();
  void fontsIn.then(() => {
    if (disposed) return;
    buildMap(serif);
    if (live && !rushing) {
      if (!still) for (const d of tray.dice) tray.setGlow(d, "#fff1c4");
      setPhase("waiting");
    } else {
      // A replay (or a throw that was skipped while the table was setting up) goes by itself.
      setPhase("rolling");
      void sleep(still ? 0 : 0.7).then(() => {
        if (!disposed) void throwDice(null);
      });
    }
  });

  return {
    replay() {
      if (disposed || phase === "loading") return;
      rushing = false;
      void throwDice(null, 0.6);
    },
    skip() {
      if (disposed || phase === "done") return;
      rushing = true; // still setting up: it throws, at once, as soon as the map is ready
      if (phase === "loading") return;
      if (phase === "waiting" || phase === "holding") void throwDice(null);
      tray.settle();
      flushAnims();
      for (const [t, resolve] of timers) {
        clearTimeout(t);
        resolve();
      }
      timers.clear();
    },
    setSound(on) {
      tray.sound = on;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      input.abort();
      for (const t of timers.keys()) clearTimeout(t);
      timers.clear();
      anims.length = 0;
      host.style.cursor = "";
      canvas.remove();
      tagLayer.remove();
      tray.dispose();
      for (const x of trash) x.dispose();
      key.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
