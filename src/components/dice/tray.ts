// Real rigid-body dice that land on numbers the game server already rolled.
//
// How a throw works:
//   1. The values are decided before the throw (the server's roll).
//   2. The whole throw is pre-simulated at once in a cannon-es world with a fixed 1/120 s step, seeded
//      (mulberry32) so the same inputs always give the same throw. Positions, rotations and impacts are
//      recorded frame by frame; the physics world only lives for the length of the simulation.
//   3. When everything has settled we read which face of each body points up. A cocked die (no face within
//      10° of up), a stacked die or a timeout retries with a perturbed seed.
//   4. The mesh inside each die's group is turned by one of the 24 rotations of the cube so the face carrying
//      values[i] is the one that ends up on top. The silhouette is identical, so the motion stays honest
//      physics. A die thrown from where it rests swaps its labelling once, mid-air, on the frame it spins
//      fastest; a die thrown from an origin (a cup, a hand) has it from the first frame.
//   5. update(dt) plays the recording back in real time and fires synthesized clacks at the impacts.
import * as CANNON from "cannon-es";
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Raycaster,
  type Scene,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Box faces in three.js material order (+x, -x, +y, -y, +z, -z) carry these values; opposites add to 7.
export const FACE_VALUES = [3, 4, 2, 5, 1, 6];
const FACE_NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
].map(([x, y, z]) => new Vector3(x, y, z));
const COS_FLAT = Math.cos((10 * Math.PI) / 180);
const SIM_DT = 1 / 120;
const MAX_ATTEMPTS = 18;

type V3 = [number, number, number];
type Q4 = [number, number, number, number];
type Rng = () => number;

// ---------------------------------------------------------------- seeded randomness

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(seed: number, n: number) {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
// A uniformly random rotation, as [x, y, z, w].
export function randomQuat(rng: Rng): Q4 {
  const u1 = rng(), u2 = rng(), u3 = rng();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return [s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3)];
}
function randomUnit(rng: Rng): V3 {
  const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}

// ---------------------------------------------------------------- the 24 rotations of a cube

const CUBE_ROTATIONS: Quaternion[] = (() => {
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const out: Quaternion[] = [];
  const m = new Matrix4();
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const cols = [0, 1, 2].map((i) => new Vector3().setComponent(p[i], (s >> i) & 1 ? -1 : 1));
      m.makeBasis(cols[0], cols[1], cols[2]);
      if (m.determinant() < 0) continue;
      out.push(new Quaternion().setFromRotationMatrix(m));
    }
  }
  return out;
})();

// Which face (index into FACE_NORMALS) points most nearly up for rotation q, and how nearly.
const _v = new Vector3();
function upFace(q: Quaternion) {
  let best = -2, index = 0;
  for (let j = 0; j < 6; j++) {
    const y = _v.copy(FACE_NORMALS[j]).applyQuaternion(q).y;
    if (y > best) {
      best = y;
      index = j;
    }
  }
  return { index, cos: best };
}
// The value a die shows right now, read from what is actually drawn (group rotation × mesh rotation).
const _q = new Quaternion();
export function topValue(die: Die) {
  _q.copy(die.group.quaternion).multiply(die.mesh.quaternion);
  return FACE_VALUES[upFace(_q).index];
}

// ---------------------------------------------------------------- faces and materials

// A die is "chance" (the Phantom Menace chance cube: blue is odd, red is even), "ivory", or a player's colour.
export type DieStyle = "chance" | "ivory" | { face: string; pip?: string; edge?: string };
type StyleSpec = { key: string; kind: "chance" | "ivory" | "custom"; face: string; pip: string; edge: string };

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.27, 0.23], [0.73, 0.23], [0.27, 0.5], [0.73, 0.5], [0.27, 0.77], [0.73, 0.77]],
};
function hexToRgb(hex: string): V3 {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Lighten (amt > 0) or darken (amt < 0) a colour.
function shade(hex: string, amt: number) {
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const f = (c: number) => Math.round(c + (t - c) * p).toString(16).padStart(2, "0");
  return "#" + hexToRgb(hex).map(f).join("");
}
function resolveStyle(style: DieStyle): StyleSpec {
  if (typeof style === "object") {
    const face = style.face;
    const pip = style.pip ?? "#fffaf3";
    const edge = style.edge ?? shade(face, -0.28);
    return { key: `c:${face}:${pip}:${edge}`, kind: "custom", face, pip, edge };
  }
  return style === "ivory"
    ? { key: "ivory", kind: "ivory", face: "#f4ecdb", pip: "#1c1b17", edge: "#d9ccb0" }
    : { key: "chance", kind: "chance", face: "", pip: "", edge: "" };
}
function drawPip(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  // An engraved pip: a light catch lower-right, then a bowl that's darker toward the upper-left rim.
  g.beginPath();
  g.arc(x + r * 0.07, y + r * 0.1, r * 1.06, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,.35)";
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, shade(color, -0.45));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.fill();
}
function faceCanvas(value: number, spec: StyleSpec) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  if (spec.kind === "chance") {
    const odd = value % 2 === 1;
    const grad = g.createRadialGradient(S * 0.35, S * 0.3, 10, S / 2, S / 2, S * 0.78);
    grad.addColorStop(0, odd ? "#5aa0ff" : "#ff6a5a");
    grad.addColorStop(1, odd ? "#123f9e" : "#8e1410");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(255, 226, 150, .6)";
    g.lineWidth = 7;
    g.strokeRect(31, 31, S - 62, S - 62);
    g.strokeStyle = "rgba(80, 40, 0, .35)";
    g.lineWidth = 2;
    g.strokeRect(36, 36, S - 72, S - 72);
    for (const [x, y] of PIPS[value]) {
      g.save();
      g.shadowColor = "rgba(0,0,0,.5)";
      g.shadowBlur = 8;
      g.beginPath();
      g.arc(x * S, y * S, S * 0.074, 0, Math.PI * 2);
      const pg = g.createRadialGradient(x * S - 6, y * S - 6, 2, x * S, y * S, S * 0.074);
      pg.addColorStop(0, "#fff1bf");
      pg.addColorStop(0.6, "#ffd36b");
      pg.addColorStop(1, "#c8921f");
      g.fillStyle = pg;
      g.fill();
      g.restore();
    }
  } else {
    const grad = g.createRadialGradient(S * 0.38, S * 0.32, 12, S / 2, S / 2, S * 0.8);
    grad.addColorStop(0, shade(spec.face, 0.1));
    grad.addColorStop(0.7, spec.face);
    grad.addColorStop(1, spec.edge);
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    // A soft band where the texture wraps the rounded edge.
    g.globalAlpha = 0.5;
    g.strokeStyle = spec.edge;
    g.lineWidth = 22;
    g.strokeRect(0, 0, S, S);
    g.globalAlpha = 1;
    for (const [x, y] of PIPS[value]) {
      const bigOne = value === 1 && spec.kind === "ivory";
      drawPip(g, x * S, y * S, S * (bigOne ? 0.12 : 0.078), bigOne ? "#b3261e" : spec.pip);
    }
  }
  return c;
}

// ---------------------------------------------------------------- sound (WebAudio, synthesized)

// What each kind of knock sounds like: filtered noise for the hit, plus a short tone for the body.
export type Clack = "felt" | "wood" | "stone" | "grass" | "die";
type Timbre = { type: BiquadFilterType; f: number; q: number; decay: number; tone: number; toneDecay: number; toneGain: number; gain: number; wave?: OscillatorType };
const TIMBRES: Record<Clack, Timbre> = {
  felt: { type: "lowpass", f: 620, q: 0.8, decay: 0.075, tone: 150, toneDecay: 0.06, toneGain: 0.55, gain: 0.55 },
  wood: { type: "bandpass", f: 1150, q: 1.4, decay: 0.05, tone: 470, toneDecay: 0.075, toneGain: 0.4, gain: 0.8, wave: "triangle" },
  stone: { type: "bandpass", f: 2900, q: 1.7, decay: 0.035, tone: 1700, toneDecay: 0.045, toneGain: 0.22, gain: 0.85 },
  grass: { type: "lowpass", f: 420, q: 0.7, decay: 0.05, tone: 110, toneDecay: 0.04, toneGain: 0.3, gain: 0.4 },
  die: { type: "bandpass", f: 3600, q: 2.6, decay: 0.024, tone: 2500, toneDecay: 0.03, toneGain: 0.22, gain: 0.6 },
};

// One little synth per tray, made on the first clack and closed with the tray.
function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let recent: number[] = [];
  let closed = false;
  const ready = () => {
    // Browsers only let a page make sound once someone has tapped or typed on it.
    if (closed || typeof window === "undefined" || navigator.userActivation?.hasBeenActive === false) return null;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  return {
    play(kind: Clack, strength: number) {
      try {
        const c = ready();
        if (!c || !master || !noise) return;
        const T = TIMBRES[kind];
        const now = c.currentTime;
        recent = recent.filter((t) => now - t < 0.06);
        if (recent.length > 6) return;
        recent.push(now);
        const s = Math.max(0.04, Math.min(1, strength));
        const vol = T.gain * Math.pow(s, 1.15);
        const pitch = 1 + (Math.random() - 0.5) * 0.16;
        const decay = T.decay * (0.75 + s * 0.5);
        const src = c.createBufferSource();
        src.buffer = noise;
        const f = c.createBiquadFilter();
        f.type = T.type;
        f.frequency.value = T.f * pitch;
        f.Q.value = T.q;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(vol, now + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start(now, Math.random() * 0.3, decay + 0.03);
        const o = c.createOscillator();
        o.type = T.wave ?? "sine";
        o.frequency.setValueAtTime(T.tone * pitch, now);
        o.frequency.exponentialRampToValueAtTime(T.tone * pitch * 0.8, now + T.toneDecay);
        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.0001, now);
        g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * T.toneGain), now + 0.002);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + T.toneDecay);
        o.connect(g2);
        g2.connect(master);
        o.start(now);
        o.stop(now + T.toneDecay + 0.03);
      } catch {
        /* sound is a nicety; never let it break a throw */
      }
    },
    close() {
      closed = true;
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

// ---------------------------------------------------------------- physics

export type Surface = "felt" | "wood" | "stone" | "grass";
const SURFACES: Record<Surface, { restitution: number; friction: number; linearDamping: number; angularDamping: number; wallRestitution: number; sound: Clack; wallSound: Clack }> = {
  felt: { restitution: 0.34, friction: 0.38, linearDamping: 0.05, angularDamping: 0.08, wallRestitution: 0.5, sound: "felt", wallSound: "wood" },
  wood: { restitution: 0.42, friction: 0.34, linearDamping: 0.08, angularDamping: 0.14, wallRestitution: 0.5, sound: "wood", wallSound: "wood" },
  stone: { restitution: 0.46, friction: 0.3, linearDamping: 0.08, angularDamping: 0.13, wallRestitution: 0.45, sound: "stone", wallSound: "stone" },
  grass: { restitution: 0.14, friction: 0.85, linearDamping: 0.2, angularDamping: 0.3, wallRestitution: 0.4, sound: "grass", wallSound: "wood" },
};

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type TrayEnv = { bounds: Bounds; floorY: number; wallHeight: number; gravity: number; dieSize: number; surface: Surface };
type EnvOptions = { bounds: Bounds; floorY?: number; wallHeight?: number; gravity?: number; dieSize?: number; surface?: Surface };
export function makeEnv(o: EnvOptions): TrayEnv {
  return { bounds: { ...o.bounds }, floorY: o.floorY ?? 0, wallHeight: o.wallHeight ?? 8, gravity: o.gravity ?? -40, dieSize: o.dieSize ?? 1, surface: o.surface ?? "felt" };
}

type Point = { x: number; y?: number; z: number };
export type Velocity = { x: number; y: number; z: number };
export type ThrowInput = {
  values: number[];
  seed: number;
  origin?: Point | Point[] | null; // throw from here (a cup, a hand) instead of from where the dice lie
  velocity?: Velocity | null;
  spin?: number | null;
  height?: number | null;
  maxTime?: number;
};
export type Pose = { p: V3; q: Q4 };
type Start = Pose & { size: number };
type Init = Start & { v: V3; w: V3 };
export type Impact = { t: number; die: number; speed: number; kind: "die" | "floor" | "wall" };
export type RecordedDie = { track: Float32Array; up: number; meshFrom: Q4; meshTo: Q4; swapFrame: number; size: number; id?: number; index?: number };
export type ThrowRecord = {
  values: number[];
  seed: number;
  attempt: number;
  ok: boolean;
  reason: string | null;
  dt: number;
  frames: number;
  duration: number;
  impacts: Impact[];
  dice: RecordedDie[];
};

function clampVelocity(v: Velocity): Velocity {
  const hs = Math.hypot(v.x, v.z);
  const k = hs > 30 ? 30 / hs : 1;
  return { x: v.x * k, y: Math.max(-12, Math.min(16, v.y)), z: v.z * k };
}

// Starting position, rotation, velocity and spin of every thrown die for one attempt.
function buildInits(env: TrayEnv, input: ThrowInput, starts: Start[], rng: Rng): Init[] {
  const { bounds, floorY } = env;
  const n = starts.length;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const vel = input.velocity ? clampVelocity(input.velocity) : null;
  const inits: Init[] = [];
  let shared: { x: number; z: number } | null = null; // one throw direction for dice leaving a shared origin
  if (input.origin && !Array.isArray(input.origin)) {
    const o = input.origin;
    let [dx, dz] = vel ? [vel.x, vel.z] : [cx - o.x, cz - o.z];
    let len = Math.hypot(dx, dz);
    if (len < 0.3) {
      const a = rng() * Math.PI * 2;
      [dx, dz, len] = [Math.cos(a), Math.sin(a), 1];
    }
    shared = { x: dx / len, z: dz / len };
  }
  for (let i = 0; i < n; i++) {
    const s = starts[i];
    const size = s.size, h = size / 2;
    let p: V3, q: Q4;
    if (input.origin) {
      const o = Array.isArray(input.origin) ? input.origin[Math.min(i, input.origin.length - 1)] : input.origin;
      const spread = shared ? (i - (n - 1) / 2) * size * 1.35 : 0;
      const px = shared ? -shared.z : 0, pz = shared ? shared.x : 0;
      const y = o.y ?? floorY + (input.height ?? 3 * size);
      p = [o.x + px * spread + (rng() - 0.5) * 0.15 * size, y + (rng() - 0.5) * 0.3 * size, o.z + pz * spread + (rng() - 0.5) * 0.15 * size];
      q = randomQuat(rng);
    } else {
      p = [...s.p];
      q = [...s.q];
    }
    let v: V3;
    if (vel) {
      const jitterA = (rng() - 0.5) * 0.3, jitterS = 0.9 + rng() * 0.2;
      const c = Math.cos(jitterA), sn = Math.sin(jitterA);
      v = [(vel.x * c - vel.z * sn) * jitterS, vel.y * (0.9 + rng() * 0.2), (vel.x * sn + vel.z * c) * jitterS];
    } else {
      let dx: number, dz: number;
      if (shared) [dx, dz] = [shared.x, shared.z];
      else {
        dx = cx - p[0];
        dz = cz - p[2];
        const len = Math.hypot(dx, dz);
        if (len < 0.6 * size) {
          const a = rng() * Math.PI * 2;
          [dx, dz] = [Math.cos(a), Math.sin(a)];
        } else [dx, dz] = [dx / len, dz / len];
        const turn = (rng() - 0.5) * 1.3;
        [dx, dz] = [dx * Math.cos(turn) - dz * Math.sin(turn), dx * Math.sin(turn) + dz * Math.cos(turn)];
      }
      const scale = Math.sqrt(size);
      if (input.origin) {
        const sp = (4 + rng() * 3) * scale;
        v = [dx * sp, (rng() - 0.5) * 2, dz * sp];
      } else {
        const sp = (5 + rng() * 4) * scale;
        v = [dx * sp, (8.5 + rng() * 3) * scale, dz * sp];
      }
    }
    if (!input.origin && p[1] < floorY + h * 1.5) v[1] = Math.max(v[1], 4.5); // lift off the floor instead of scraping it
    const axis = randomUnit(rng);
    const spin = (input.spin ?? 16) * (0.75 + rng() * 0.5);
    inits.push({ size, p, q, v, w: [axis[0] * spin, axis[1] * spin, axis[2] * spin] });
  }
  // Keep them inside the walls and apart from each other.
  for (let i = 0; i < n; i++) {
    const it = inits[i], h = it.size / 2 + 0.02;
    for (let j = 0; j < i; j++) {
      const o = inits[j];
      let dx = it.p[0] - o.p[0], dz = it.p[2] - o.p[2];
      const d = Math.hypot(dx, it.p[1] - o.p[1], dz), need = (it.size + o.size) * 0.62;
      if (d < need) {
        let len = Math.hypot(dx, dz);
        if (len < 1e-3) [dx, dz, len] = [1, 0, 1];
        it.p[0] = o.p[0] + (dx / len) * need;
        it.p[2] = o.p[2] + (dz / len) * need;
      }
    }
    it.p[0] = Math.min(bounds.maxX - h, Math.max(bounds.minX + h, it.p[0]));
    it.p[2] = Math.min(bounds.maxZ - h, Math.max(bounds.minZ + h, it.p[2]));
    it.p[1] = Math.min(floorY + env.wallHeight - h, Math.max(floorY + h + 0.001, it.p[1]));
  }
  return inits;
}

function simulate(env: TrayEnv, inits: Init[], maxTime: number, statics: Start[]) {
  const S = SURFACES[env.surface];
  const dt = SIM_DT, fy = env.floorY, { minX, maxX, minZ, maxZ } = env.bounds;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, env.gravity, 0) });
  (world.solver as CANNON.GSSolver).iterations = 20;
  const dieMat = new CANNON.Material("die"), floorMat = new CANNON.Material("floor"), wallMat = new CANNON.Material("wall");
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: S.friction, restitution: S.restitution }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, wallMat, { friction: 0.14, restitution: S.wallRestitution }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.24, restitution: 0.4 }));
  // Walls, floor and lid are infinite half-spaces: nothing can tunnel through a plane.
  const plane = (mat: CANNON.Material, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const b = new CANNON.Body({ mass: 0, material: mat, type: CANNON.Body.STATIC });
    b.addShape(new CANNON.Plane());
    b.position.set(x, y, z);
    b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(nx, ny, nz));
    world.addBody(b);
    return b;
  };
  const floor = plane(floorMat, 0, fy, 0, 0, 1, 0);
  plane(wallMat, minX, 0, 0, 1, 0, 0);
  plane(wallMat, maxX, 0, 0, -1, 0, 0);
  plane(wallMat, 0, 0, minZ, 0, 0, 1);
  plane(wallMat, 0, 0, maxZ, 0, 0, -1);
  plane(wallMat, 0, fy + env.wallHeight, 0, 0, -1, 0);
  const dieBodies = new Set<CANNON.Body>();
  for (const s of statics) {
    const h = s.size / 2;
    const b = new CANNON.Body({ mass: 0, material: dieMat, type: CANNON.Body.STATIC });
    b.addShape(new CANNON.Box(new CANNON.Vec3(h, h, h)));
    b.position.set(s.p[0], s.p[1], s.p[2]);
    b.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    world.addBody(b);
    dieBodies.add(b);
  }
  const bodies = inits.map((it) => {
    const h = it.size / 2;
    const b = new CANNON.Body({ mass: 1, material: dieMat, linearDamping: S.linearDamping, angularDamping: S.angularDamping, allowSleep: false });
    b.addShape(new CANNON.Box(new CANNON.Vec3(h, h, h)));
    b.position.set(it.p[0], it.p[1], it.p[2]);
    b.quaternion.set(it.q[0], it.q[1], it.q[2], it.q[3]);
    b.quaternion.normalize();
    b.velocity.set(it.v[0], it.v[1], it.v[2]);
    b.angularVelocity.set(it.w[0], it.w[1], it.w[2]);
    world.addBody(b);
    dieBodies.add(b);
    return b;
  });
  const index = new Map(bodies.map((b, i) => [b, i]));
  const N = bodies.length;
  const maxSteps = Math.ceil(maxTime / dt);
  const tracks = bodies.map(() => new Float32Array((maxSteps + 1) * 7));
  const omega = bodies.map(() => new Float32Array(maxSteps + 1));
  const rec = (step: number) => {
    for (let i = 0; i < N; i++) {
      const b = bodies[i], o = step * 7, tr = tracks[i];
      tr[o] = b.position.x;
      tr[o + 1] = b.position.y;
      tr[o + 2] = b.position.z;
      tr[o + 3] = b.quaternion.x;
      tr[o + 4] = b.quaternion.y;
      tr[o + 5] = b.quaternion.z;
      tr[o + 6] = b.quaternion.w;
      omega[i][step] = b.angularVelocity.length();
    }
  };
  rec(0);
  const prevV = bodies.map(() => new CANNON.Vec3()), prevW = bodies.map(() => new CANNON.Vec3());
  const lastHit = new Float64Array(N).fill(-1);
  const impacts: Impact[] = [];
  let step = 0, calm = 0, settled = false;
  while (step < maxSteps) {
    for (let i = 0; i < N; i++) {
      const b = bodies[i], h = inits[i].size / 2;
      prevV[i].copy(b.velocity);
      prevW[i].copy(b.angularVelocity);
      // Once a die lies flat and has almost stopped, let it come to rest quickly instead of creeping.
      const slow = b.velocity.length() < 1 && b.angularVelocity.length() < 2.5 && b.position.y < fy + h * 1.06;
      b.linearDamping = slow ? 0.5 : S.linearDamping;
      b.angularDamping = slow ? 0.6 : S.angularDamping;
    }
    world.step(dt);
    step++;
    const t = step * dt;
    rec(step);
    for (let i = 0; i < N; i++) {
      const b = bodies[i], h = inits[i].size / 2;
      const dvx = b.velocity.x - prevV[i].x, dvy = b.velocity.y - prevV[i].y - env.gravity * dt, dvz = b.velocity.z - prevV[i].z;
      const dw = Math.hypot(b.angularVelocity.x - prevW[i].x, b.angularVelocity.y - prevW[i].y, b.angularVelocity.z - prevW[i].z);
      const hit = Math.hypot(dvx, dvy, dvz) + 0.35 * dw * h;
      if (hit < 1.6 || t - lastHit[i] < 0.05) continue;
      let kind: Impact["kind"] | null = null, other = -1;
      for (const c of world.contacts) {
        const o = c.bi === b ? c.bj : c.bj === b ? c.bi : null;
        if (!o) continue;
        if (dieBodies.has(o)) {
          kind = "die";
          other = index.get(o) ?? -1;
          break;
        }
        kind = o === floor ? (kind ?? "floor") : "wall";
      }
      if (!kind) continue;
      lastHit[i] = t;
      if (kind === "die" && other >= 0 && lastHit[other] === t) continue; // one clack per pair
      impacts.push({ t, die: i, speed: +hit.toFixed(3), kind });
    }
    const allCalm = bodies.every((b) => b.velocity.length() <= 0.1 && b.angularVelocity.length() <= 0.2);
    calm = allCalm ? calm + 1 : 0;
    if (calm >= 16 && t > 0.3) {
      settled = true;
      break;
    }
  }
  const frames = step + 1;
  const ups: number[] = [];
  let flat = true, grounded = true;
  const q = new Quaternion();
  for (let i = 0; i < N; i++) {
    const b = bodies[i], h = inits[i].size / 2;
    const u = upFace(q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
    ups.push(u.index);
    if (u.cos < COS_FLAT) flat = false;
    if (b.position.y > fy + h * 1.25) grounded = false;
  }
  const reason = !settled ? "timeout" : !flat ? "cocked" : !grounded ? "stacked" : null;
  return {
    ok: !reason,
    reason,
    frames,
    tracks: tracks.map((tr) => tr.slice(0, frames * 7)),
    omega: omega.map((om) => om.slice(0, frames)),
    ups,
    impacts,
    duration: step * dt,
  };
}
type Simulation = ReturnType<typeof simulate>;

// The frame to relabel a die thrown from rest: high in the air and spinning hard (spin × height).
function swapFrameFor(sim: Simulation, i: number, env: TrayEnv, size: number) {
  const tr = sim.tracks[i], om = sim.omega[i];
  const from = Math.min(sim.frames - 1, Math.round(0.1 / SIM_DT)), to = Math.max(from + 1, Math.floor(sim.frames * 0.6));
  let best = from, score = -1, fastest = from;
  for (let f = from; f < to && f < sim.frames; f++) {
    const s = om[f] * Math.max(0, tr[f * 7 + 1] - env.floorY - size * 0.6);
    if (s > score) {
      score = s;
      best = f;
    }
    if (om[f] > om[fastest]) fastest = f;
  }
  return score > 0 ? best : fastest;
}

// Pure (no DOM): simulate a throw and choose each die's labelling. Same inputs, same record.
export function computeThrow(env: TrayEnv, input: ThrowInput, starts: Start[], meshFrom: (Q4 | null)[] | null, statics: Start[] = []): ThrowRecord {
  let sim: Simulation | null = null;
  let attempt = 0;
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    const rng = mulberry32(hashSeed(input.seed, a));
    sim = simulate(env, buildInits(env, input, starts, rng), input.maxTime ?? 6, statics);
    attempt = a;
    if (sim.ok) break;
  }
  const done = sim!;
  const pickRng = mulberry32(hashSeed(input.seed, 7777 + attempt));
  const tmp = new Vector3(), qa = new Quaternion();
  const dice = starts.map((s, i): RecordedDie => {
    const k = done.ups[i];
    const m = FACE_VALUES.indexOf(input.values[i]);
    const cands = CUBE_ROTATIONS.filter((R) => tmp.copy(FACE_NORMALS[m]).applyQuaternion(R).dot(FACE_NORMALS[k]) > 0.99);
    let R = cands[0], from: Q4, swapFrame: number;
    const was = meshFrom?.[i];
    if (input.origin || !was) {
      R = cands[Math.floor(pickRng() * cands.length) % cands.length];
      from = R.toArray() as Q4;
      swapFrame = -1;
    } else {
      // Keep the labelling the die already has if it happens to work; otherwise the nearest one.
      qa.fromArray(was);
      let best = -1;
      for (const c of cands) {
        const d = Math.abs(c.dot(qa));
        if (d > best) {
          best = d;
          R = c;
        }
      }
      from = [...was];
      swapFrame = best > 0.9999 ? -1 : swapFrameFor(done, i, env, s.size);
    }
    return { track: done.tracks[i], up: k, meshFrom: from, meshTo: R.toArray() as Q4, swapFrame, size: s.size };
  });
  return {
    values: input.values.slice(),
    seed: input.seed,
    attempt,
    ok: done.ok,
    reason: done.reason,
    dt: SIM_DT,
    frames: done.frames,
    duration: done.duration,
    impacts: done.impacts,
    dice,
  };
}

// The value on top of each die once a recorded throw comes to rest, as it's drawn.
export function restingValues(record: ThrowRecord) {
  const q = new Quaternion(), m = new Quaternion();
  return record.dice.map((d) => {
    const o = (record.frames - 1) * 7;
    q.set(d.track[o + 3], d.track[o + 4], d.track[o + 5], d.track[o + 6]).multiply(m.fromArray(d.meshTo));
    return FACE_VALUES[upFace(q).index];
  });
}

// ---------------------------------------------------------------- the tray

export type Die = { group: Group; mesh: Mesh; style: DieStyle; size: number; index: number; id: number; value: number; halo: Mesh | null; glowColor: string | null };

export type ThrowOptions = {
  values: number[]; // one per thrown die, 1–6: the server's roll
  dice?: Die[]; // which dice to throw (default: all); the rest sit still and get in the way
  seed?: number;
  origin?: Point | Point[] | null;
  velocity?: Velocity | null;
  spin?: number | null;
  height?: number | null;
  maxTime?: number;
  // Start the physics from these poses, gliding there first for `lead` seconds. The dice are squared away
  // before (their labelling folded into their rotation), so the throw depends on nothing but its inputs:
  // everyone who throws it with the same seed sees the same tumble.
  from?: Pose[];
  lead?: number;
};

type Play = {
  record: ThrowRecord;
  list: Die[];
  t: number;
  next: number;
  lead: number;
  glide: { p: Vector3; q: Quaternion }[] | null;
  resolve: (r: ThrowRecord) => void;
};
type Tween = { die: Die; from: Vector3; to: Vector3; qFrom: Quaternion; qTo: Quaternion; lift: number; t: number; dur: number; resolve: (d: Die) => void };

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function createTray(opts: EnvOptions & { scene: Scene; sound?: boolean }) {
  const env = makeEnv(opts);
  const S = SURFACES[env.surface];
  const root = new Group();
  root.name = "dice-tray";
  opts.scene.add(root);
  const dice: Die[] = [];
  const tweens: Tween[] = [];
  const materials = new Map<string, MeshPhysicalMaterial[]>();
  const geometries = new Map<string, BufferGeometry>();
  const sound = createSound();
  const pickGeo = new BoxGeometry(1, 1, 1);
  const pickMat = new MeshBasicMaterial({ visible: false });
  const q0 = new Quaternion(), q1 = new Quaternion(), p0 = new Vector3();
  let nextId = 1, play: Play | null = null, clock = 0;

  const materialsFor = (style: DieStyle) => {
    const spec = resolveStyle(style);
    let mats = materials.get(spec.key);
    if (!mats) {
      mats = FACE_VALUES.map((v) => {
        const tex = new CanvasTexture(faceCanvas(v, spec));
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 8;
        const finish =
          spec.kind === "chance"
            ? { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }
            : spec.kind === "ivory"
              ? { roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.35 }
              : { roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.18 };
        return new MeshPhysicalMaterial({ map: tex, metalness: 0, ...finish });
      });
      materials.set(spec.key, mats);
    }
    return mats;
  };
  const geometry = (key: string, make: () => BufferGeometry) => {
    let g = geometries.get(key);
    if (!g) geometries.set(key, (g = make()));
    return g;
  };
  const reindex = () => dice.forEach((d, i) => (d.index = i));
  const slotFor = (i: number, size: number) => {
    const cx = (env.bounds.minX + env.bounds.maxX) / 2, cz = (env.bounds.minZ + env.bounds.maxZ) / 2;
    const xs = [-0.9, 0.9, -2.7, 2.7];
    return { x: cx + xs[i % 4] * size, z: cz + Math.floor(i / 4) * 1.8 * size };
  };
  // Fold the labelling into the die's rotation (it looks exactly the same) so its mesh sits unturned.
  const fold = (d: Die) => {
    d.group.quaternion.multiply(d.mesh.quaternion);
    d.mesh.quaternion.identity();
  };

  const tray = {
    root,
    dice,
    env,
    sound: opts.sound !== false,
    timeScale: 1,
    onImpact: null as ((impact: Impact, die: Die) => void) | null,
    get rolling() {
      return play !== null;
    },

    addDie({ style = "chance", size, position }: { style?: DieStyle; size?: number; position?: Point } = {}) {
      const s = size ?? env.dieSize;
      const mesh = new Mesh(
        geometry(`d${s}`, () => new RoundedBoxGeometry(s, s, s, 4, s * 0.12)),
        materialsFor(style),
      );
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = "die";
      const group = new Group();
      group.add(mesh);
      const proxy = new Mesh(pickGeo, pickMat);
      proxy.scale.setScalar(s * 1.5);
      proxy.name = "die-pick";
      group.add(proxy);
      root.add(group);
      const i = dice.length;
      const slot = slotFor(i, s);
      group.position.set(position?.x ?? slot.x, position?.y ?? env.floorY + s / 2, position?.z ?? slot.z);
      const rng = mulberry32(hashSeed(nextId * 7919, i));
      const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (rng() - 0.5) * 0.8);
      group.quaternion.copy(yaw).multiply(CUBE_ROTATIONS[Math.floor(rng() * 24) % 24]);
      const die: Die = { group, mesh, style, size: s, index: i, id: nextId++, value: 1, halo: null, glowColor: null };
      group.userData.die = die;
      die.value = topValue(die);
      dice.push(die);
      return die;
    },

    removeDie(die: Die) {
      const i = dice.indexOf(die);
      if (i < 0) return;
      if (play?.list.includes(die)) finish();
      root.remove(die.group);
      if (die.halo) (die.halo.material as MeshBasicMaterial).dispose();
      dice.splice(i, 1);
      reindex();
    },

    clear() {
      if (play) finish();
      for (const d of dice.slice()) tray.removeDie(d);
    },

    setStyle(die: Die, style: DieStyle) {
      die.style = style;
      die.mesh.material = materialsFor(style);
    },

    throw(o: ThrowOptions): Promise<ThrowRecord> {
      const list = (o.dice ?? dice).slice();
      if (!list.length) return Promise.reject(new Error("throw() has no dice to throw"));
      if (o.values.length !== list.length || o.values.some((v) => !(v >= 1 && v <= 6 && Number.isInteger(v)))) {
        return Promise.reject(new Error("throw() needs one value from 1 to 6 for each thrown die"));
      }
      if (o.from && o.from.length !== list.length) return Promise.reject(new Error("throw() needs one starting pose per die"));
      if (play) finish();
      settleTweens();
      if (o.from) list.forEach(fold);
      const input: ThrowInput = {
        values: o.values.slice(),
        seed: (o.seed ?? Math.floor(Math.random() * 4294967296)) >>> 0,
        origin: o.origin ?? null,
        velocity: o.velocity ?? null,
        spin: o.spin ?? null,
        height: o.height ?? null,
        maxTime: o.maxTime ?? 6,
      };
      const starts: Start[] = list.map((d, i) => ({
        p: o.from ? [...o.from[i].p] : (d.group.position.toArray() as V3),
        q: o.from ? [...o.from[i].q] : (d.group.quaternion.toArray() as Q4),
        size: d.size,
      }));
      const meshFrom = list.map((d) => d.mesh.quaternion.toArray() as Q4);
      const statics = dice.filter((d) => !list.includes(d)).map((d) => ({ p: d.group.position.toArray() as V3, q: d.group.quaternion.toArray() as Q4, size: d.size }));
      const record = computeThrow(env, input, starts, meshFrom, statics);
      record.dice.forEach((e, i) => {
        e.id = list[i].id;
        e.index = list[i].index;
      });
      return start(record, list, o.from ? (o.lead ?? 0) : 0);
    },

    // Play a record from throw() again, on the same dice.
    replay(record: ThrowRecord): Promise<ThrowRecord> {
      const list = record.dice.map((e, i) => dice.find((d) => d.id === e.id) ?? dice[e.index ?? i]);
      if (list.some((d) => !d)) return Promise.reject(new Error("replay() needs the same dice in the tray"));
      if (play) finish();
      settleTweens();
      return start(record, list, 0);
    },

    // Jump to the end: the dice land at once and every pending promise resolves.
    settle() {
      if (play) finish();
      settleTweens();
    },

    update(dt: number) {
      dt = Math.max(0, Math.min(dt || 0, 0.1));
      clock += dt;
      if (play) advance(dt * tray.timeScale);
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        if (k >= 1) {
          tweens.splice(i, 1);
          tw.die.group.position.copy(tw.to);
          tw.die.group.quaternion.copy(tw.qTo);
          tw.resolve(tw.die);
          continue;
        }
        const e = ease(k);
        const g = tw.die.group;
        g.position.lerpVectors(tw.from, tw.to, e);
        g.position.y += Math.sin(Math.PI * e) * tw.lift;
        g.quaternion.slerpQuaternions(tw.qFrom, tw.qTo, e);
      }
      for (const d of dice) {
        if (d.halo?.visible) (d.halo.material as MeshBasicMaterial).opacity = 0.42 + 0.22 * Math.sin(clock * 4.2 + d.index);
      }
    },

    // Glide a die somewhere, keeping the same face up (squared to the table, plus an optional yaw).
    arrange(die: Die, pos: Point, { duration = 0.5, lift = 0.8, square = true, yaw = 0 } = {}): Promise<Die> {
      if (play?.list.includes(die)) finish();
      settleTweens(die);
      const g = die.group;
      const from = g.position.clone();
      const to = new Vector3(pos.x, pos.y ?? env.floorY + die.size / 2, pos.z);
      const qFrom = g.quaternion.clone();
      const k = upFace(qFrom).index;
      const upNow = FACE_NORMALS[k].clone().applyQuaternion(qFrom);
      const qTo = new Quaternion().setFromUnitVectors(upNow, new Vector3(0, 1, 0)).multiply(qFrom);
      if (square) {
        const side = FACE_NORMALS[k === 0 || k === 1 ? 2 : 0].clone().applyQuaternion(qTo);
        const ang = Math.atan2(side.x, side.z);
        const snapped = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
        qTo.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), snapped - ang + yaw));
      } else if (yaw) {
        qTo.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
      }
      return new Promise((resolve) => {
        if (duration <= 0) {
          g.position.copy(to);
          g.quaternion.copy(qTo);
          resolve(die);
          return;
        }
        tweens.push({ die, from, to, qFrom, qTo, lift, t: 0, dur: duration, resolve });
      });
    },

    setGlow(die: Die, color: string | null) {
      if (!color) {
        if (die.halo) die.halo.visible = false;
        die.glowColor = null;
        return;
      }
      if (!die.halo) {
        const s = die.size * 1.2;
        const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: BackSide, blending: AdditiveBlending, depthWrite: false });
        die.halo = new Mesh(
          geometry(`h${die.size}`, () => new RoundedBoxGeometry(s, s, s, 3, die.size * 0.24)),
          mat,
        );
        die.halo.renderOrder = 2;
        die.halo.name = "die-glow";
        die.group.add(die.halo);
      }
      (die.halo.material as MeshBasicMaterial).color.set(color);
      die.halo.visible = true;
      die.glowColor = color;
    },

    pick(raycaster: Raycaster): Die | null {
      for (const h of raycaster.intersectObjects(dice.map((d) => d.group), true)) {
        let o: typeof h.object | null = h.object;
        while (o && !o.userData?.die) o = o.parent;
        if (o) return o.userData.die as Die;
      }
      return null;
    },

    values() {
      return dice.map(topValue);
    },

    clack(kind: Clack, strength: number) {
      if (tray.sound) sound.play(kind, strength);
    },

    dispose() {
      if (play) finish();
      settleTweens();
      for (const d of dice) if (d.halo) (d.halo.material as MeshBasicMaterial).dispose();
      dice.length = 0;
      opts.scene.remove(root);
      for (const mats of materials.values()) {
        for (const m of mats) {
          m.map?.dispose();
          m.dispose();
        }
      }
      materials.clear();
      for (const g of geometries.values()) g.dispose();
      geometries.clear();
      pickGeo.dispose();
      pickMat.dispose();
      sound.close();
    },
  };

  // Finish pending glides at once (all of them, or one die's) so nobody waits on a dropped promise.
  function settleTweens(only?: Die) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (only && tw.die !== only) continue;
      tweens.splice(i, 1);
      tw.die.group.position.copy(tw.to);
      tw.die.group.quaternion.copy(tw.qTo);
      tw.resolve(tw.die);
    }
  }
  function applyFrame(die: Die, e: RecordedDie, i0: number, i1: number, a: number) {
    const tr = e.track, o0 = i0 * 7, o1 = i1 * 7, g = die.group;
    g.position.set(tr[o0] + (tr[o1] - tr[o0]) * a, tr[o0 + 1] + (tr[o1 + 1] - tr[o0 + 1]) * a, tr[o0 + 2] + (tr[o1 + 2] - tr[o0 + 2]) * a);
    q0.set(tr[o0 + 3], tr[o0 + 4], tr[o0 + 5], tr[o0 + 6]);
    q1.set(tr[o1 + 3], tr[o1 + 4], tr[o1 + 5], tr[o1 + 6]);
    g.quaternion.slerpQuaternions(q0, q1, a);
    die.mesh.quaternion.fromArray(e.swapFrame >= 0 && i0 < e.swapFrame ? e.meshFrom : e.meshTo);
  }
  function start(record: ThrowRecord, list: Die[], lead: number) {
    return new Promise<ThrowRecord>((resolve) => {
      const glide = lead > 0 ? list.map((d) => ({ p: d.group.position.clone(), q: d.group.quaternion.clone() })) : null;
      play = { record, list, t: glide ? -lead : 0, next: 0, lead, glide, resolve };
      if (!glide) list.forEach((d, i) => applyFrame(d, record.dice[i], 0, 0, 0));
    });
  }
  function advance(dt: number) {
    const p = play!, r = p.record;
    p.t += dt;
    if (p.t < 0 && p.glide) {
      // Into the starting pose, with a little hop.
      const e = ease(1 + p.t / p.lead);
      p.list.forEach((d, i) => {
        const tr = r.dice[i].track;
        d.group.position.lerpVectors(p.glide![i].p, p0.set(tr[0], tr[1], tr[2]), e);
        d.group.position.y += Math.sin(Math.PI * e) * 0.35;
        d.group.quaternion.slerpQuaternions(p.glide![i].q, q0.set(tr[3], tr[4], tr[5], tr[6]), e);
      });
      return;
    }
    const last = r.frames - 1;
    const f = Math.min(Math.max(0, p.t) / r.dt, last);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, last);
    p.list.forEach((d, i) => applyFrame(d, r.dice[i], i0, i1, f - i0));
    while (p.next < r.impacts.length && r.impacts[p.next].t <= p.t) {
      const im = r.impacts[p.next++];
      if (p.t - im.t > 0.15) continue; // skip stale sounds after a stalled frame
      tray.clack(im.kind === "die" ? "die" : im.kind === "wall" ? S.wallSound : S.sound, Math.min(1, im.speed / 14));
      try {
        tray.onImpact?.(im, p.list[im.die]);
      } catch {
        /* page callback errors must not stop the throw */
      }
    }
    if (p.t >= r.duration) finish();
  }
  function finish() {
    const p = play;
    if (!p) return;
    const r = p.record, last = r.frames - 1;
    p.list.forEach((d, i) => {
      applyFrame(d, r.dice[i], last, last, 0);
      d.mesh.quaternion.fromArray(r.dice[i].meshTo);
      d.value = r.values[i];
    });
    play = null;
    p.resolve(r);
  }

  return tray;
}
export type Tray = ReturnType<typeof createTray>;
