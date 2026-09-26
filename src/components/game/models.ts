// The 3D pieces on the board: buildings, troops, banners and their badges.
// Each model is built once from simple shapes and baked into one vertex-coloured geometry (one draw call),
// plus a second geometry for the parts painted in the owner's colour. Models are measured in "hex units":
// 1 is the radius of a hex, +x is east, +y is up and +z is south (towards the camera).
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Units } from "@/game/engine";
import { BUILDINGS, type BuildingType, type UnitType } from "@/game/rules";

type V3 = [number, number, number];

const P = {
  ink: "#1c1b17",
  paper: "#fffaf3",
  stone1: "#ddd6c4",
  stone2: "#bab3a3",
  stone3: "#8f897c",
  stoneDark: "#57534a",
  red: "#c4362a",
  redDark: "#8f2319",
  jade: "#2f7a5a",
  jadeDark: "#1f4b35",
  gold: "#e8b64a",
  goldDark: "#b8862a",
  goldBright: "#ffd76a",
  wood: "#a8733f",
  woodDark: "#6e4624",
  deck: "#c9a36b",
  leaf: "#6fae4f",
  leafDark: "#3f7a34",
  steel: "#c9d0d8",
  steelDark: "#8a939e",
  iron: "#5d6b7a",
  window: "#2b3a55",
  rice: "#efe0b0",
  gem: "#9b6fc7",
  gemLight: "#c9a4f0",
  ogre: "#6f8a3a",
  ogreDark: "#55702b",
  ogreLight: "#8fab57",
  eye: "#e0402a",
  skin: "#e3a46c",
  skinDark: "#c9834e",
};

// Where things stand on a hex. The camera looks in from the south, so the number sits at the front tip where
// nothing can hide it, the army stands in the middle, the gondola mast behind it, and each building has a corner.
// The fort doesn't take a corner: it walls in the whole hex.
export const SLOTS: Record<"sanctuary" | "gym" | "market" | "army" | "token" | "mast", [number, number]> = {
  sanctuary: [-0.45, -0.38],
  gym: [0.45, -0.38],
  market: [-0.55, 0.26],
  army: [0, 0.1],
  token: [0, 0.62],
  mast: [0, -0.3],
};

// ---------------------------------------------------------------- the kit

const geoCache = new Map<string, BufferGeometry>();
const cg = (key: string, make: () => BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};

type Pos = V3 | 0;
type Rot = V3 | 0;
type Scale = V3 | number;

const _e = new Euler();
const _q = new Quaternion();
function mat(p: Pos = 0, r: Rot = 0, s: Scale = 1) {
  const pv = p === 0 ? [0, 0, 0] : p;
  const rv = r === 0 ? [0, 0, 0] : r;
  const sv = typeof s === "number" ? [s, s, s] : s;
  return new Matrix4().compose(new Vector3(pv[0], pv[1], pv[2]), _q.setFromEuler(_e.set(rv[0], rv[1], rv[2])), new Vector3(sv[0], sv[1], sv[2]));
}

// "owner" parts take the owner's colour (a darker shade for "ownerDark"); everything else is a fixed colour.
const OWNER_SHADE: Record<string, number> = { owner: 1, ownerDark: 0.62 };

type Model = { base?: BufferGeometry; own?: BufferGeometry; height: number };

class Kit {
  private base: BufferGeometry[] = [];
  private own: BufferGeometry[] = [];
  private stack = [new Matrix4()];

  private top() {
    return this.stack[this.stack.length - 1];
  }
  in(p: Pos, r: Rot, s: Scale, fn: () => void) {
    this.stack.push(this.top().clone().multiply(mat(p, r, s)));
    fn();
    this.stack.pop();
    return this;
  }
  add(g: BufferGeometry, color: string, p?: Pos, r?: Rot, s?: Scale) {
    const geom = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(geom.attributes)) if (k !== "position" && k !== "normal") geom.deleteAttribute(k);
    geom.applyMatrix4(this.top().clone().multiply(mat(p, r, s)));
    const shade = OWNER_SHADE[color];
    const col = shade !== undefined ? new Color(shade, shade, shade) : new Color(color);
    const n = geom.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geom.setAttribute("color", new BufferAttribute(arr, 3));
    (shade !== undefined ? this.own : this.base).push(geom);
    return this;
  }
  box(w: number, h: number, d: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`box${w}|${h}|${d}`, () => new BoxGeometry(w, h, d)), c, p, r, s);
  }
  cyl(rt: number, rb: number, h: number, c: string, p?: Pos, r?: Rot, s?: Scale, seg = 14) {
    return this.add(cg(`cyl${rt}|${rb}|${h}|${seg}`, () => new CylinderGeometry(rt, rb, h, seg)), c, p, r, s);
  }
  cone(rad: number, h: number, c: string, p?: Pos, r?: Rot, s?: Scale, seg = 14) {
    return this.add(cg(`cone${rad}|${h}|${seg}`, () => new ConeGeometry(rad, h, seg)), c, p, r, s);
  }
  ball(rad: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`ball${rad}`, () => new SphereGeometry(rad, 16, 11)), c, p, r, s);
  }
  dome(rad: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`dome${rad}`, () => new SphereGeometry(rad, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2)), c, p, r, s);
  }
  cap(rad: number, len: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`cap${rad}|${len}`, () => new CapsuleGeometry(rad, len, 5, 12)), c, p, r, s);
  }
  torus(rad: number, tube: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`tor${rad}|${tube}`, () => new TorusGeometry(rad, tube, 8, 24)), c, p, r, s);
  }
  gem(rad: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`gem${rad}`, () => new OctahedronGeometry(rad)), c, p, r, s);
  }
  rock(rad: number, c: string, p?: Pos, r?: Rot, s?: Scale) {
    return this.add(cg(`rock${rad}`, () => new DodecahedronGeometry(rad)), c, p, r, s);
  }
  lathe(pts: [number, number][], c: string, p?: Pos) {
    return this.add(cg(`lathe${pts.join(";")}`, () => new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), 24)), c, p);
  }
  build(): Model {
    const out: Model = { height: 0 };
    if (this.base.length) out.base = mergeGeometries(this.base) ?? undefined;
    if (this.own.length) out.own = mergeGeometries(this.own) ?? undefined;
    const box = new Box3();
    for (const g of [out.base, out.own]) {
      if (!g) continue;
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    out.height = box.max.y;
    return out;
  }
}

const BASE_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.04 });
const ownMats = new Map<string, MeshStandardMaterial>();
function ownMat(color: string) {
  let m = ownMats.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color, vertexColors: true, roughness: 0.6, metalness: 0.03 });
    ownMats.set(color, m);
  }
  return m;
}
// See-through previews of a building while you choose where it goes; the one you've picked glows gold.
const GHOST_MATS = {
  ghost: new MeshBasicMaterial({ color: "#fff6d8", transparent: true, opacity: 0.58, depthWrite: false }),
  picked: new MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.82, depthWrite: false }),
};
type Ghost = keyof typeof GHOST_MATS;

function instance(model: Model, owner: string, ghost?: Ghost) {
  const g = new Group();
  if (model.base) g.add(new Mesh(model.base, ghost ? GHOST_MATS[ghost] : BASE_MAT));
  if (model.own) g.add(new Mesh(model.own, ghost ? GHOST_MATS[ghost] : ownMat(owner)));
  return g;
}

const modelCache = new Map<string, Model>();
function cached(key: string, make: (k: Kit) => void) {
  let m = modelCache.get(key);
  if (!m) {
    const k = new Kit();
    make(k);
    m = k.build();
    modelCache.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------- canvas textures

const canvasTex = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// The board's number font, for drawing troop counts. Troika loads it separately for the hex numbers.
const BADGE_FONT = "PD Board Numbers";
let fontLoad: Promise<void> | null = null;
export function loadBadgeFont() {
  fontLoad ??= (async () => {
    try {
      const face = new FontFace(BADGE_FONT, "url(/fonts/bricolage-800.woff)", { weight: "800" });
      document.fonts.add(await face.load());
    } catch {
      /* system fonts will do */
    }
  })();
  return fontLoad;
}

const luminance = (hex: string) => {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const badgeTexCache = new Map<string, CanvasTexture>();
function badgeTex(n: number, color: string) {
  const key = `${n}|${color}|${document.fonts.check(`800 20px "${BADGE_FONT}"`)}`;
  let t = badgeTexCache.get(key);
  if (t) return t;
  const light = luminance(color) > 0.5;
  t = canvasTex(128, 128, (ctx) => {
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf3";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 64, 49, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.font = `800 ${n > 99 ? 44 : n > 9 ? 56 : 66}px "${BADGE_FONT}", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 7;
    ctx.strokeStyle = light ? "rgba(255,250,243,.9)" : "rgba(28,27,23,.55)";
    ctx.strokeText(String(n), 64, 69);
    ctx.fillStyle = light ? "#1c1b17" : "#fffaf3";
    ctx.fillText(String(n), 64, 69);
  });
  badgeTexCache.set(key, t);
  return t;
}

// Map pins show a building's icon, the same one the menus use.
export const PIN_RING: Record<BuildingType, string> = { sanctuary: "#b3261e", gym: "#d69a1e", market: "#2b6fd6", fort: "#5d6b7a" };
const pinTexCache = new Map<BuildingType, CanvasTexture>();
function pinTex(type: BuildingType) {
  let t = pinTexCache.get(type);
  if (t) return t;
  t = canvasTex(128, 160, (ctx) => {
    ctx.fillStyle = "rgba(28,27,23,.25)";
    ctx.beginPath();
    ctx.ellipse(64, 152, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PIN_RING[type];
    ctx.beginPath();
    ctx.moveTo(44, 108);
    ctx.lineTo(64, 148);
    ctx.lineTo(84, 108);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 62, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 62, 47, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf3";
    ctx.fill();
    ctx.font = `60px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(BUILDINGS[type].icon, 64, 66);
  });
  pinTexCache.set(type, t);
  return t;
}

const shadowGeo = new PlaneGeometry(1, 1);
const shadowMats = new Map<number, MeshBasicMaterial>();
// A soft dark blot under a model, so it sits on the ground instead of floating over it.
export function blobShadow(radius: number, opacity: number) {
  let mat = shadowMats.get(opacity);
  if (!mat) {
    const map = canvasTex(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(20,24,18,1)");
      g.addColorStop(0.55, "rgba(20,24,18,.55)");
      g.addColorStop(1, "rgba(20,24,18,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
    mat = new MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, toneMapped: false });
    shadowMats.set(opacity, mat);
  }
  const m = new Mesh(shadowGeo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.scale.setScalar(radius * 2);
  m.renderOrder = 1;
  return m;
}

// Badges and pins never shrink below a readable size on screen, however far out you zoom.
const _wp = new Vector3();
const _ws = new Vector3();
function keepReadable(s: Sprite, minPx: number, maxGrow = 2.6) {
  const bx = s.scale.x;
  const by = s.scale.y;
  s.onBeforeRender = (renderer: WebGLRenderer, _scene, camera: Camera) => {
    const fov = (camera as PerspectiveCamera).fov ?? 40;
    s.getWorldPosition(_wp);
    s.parent?.getWorldScale(_ws);
    const worldH = by * (_ws.y || 1);
    const px = (worldH * renderer.domElement.clientHeight) / (2 * Math.tan(((fov / 2) * Math.PI) / 180) * _wp.distanceTo(camera.position));
    const k = Math.min(maxGrow, Math.max(1, minPx / Math.max(px, 0.001)));
    s.scale.set(bx * k, by * k, 1);
    s.updateMatrixWorld();
  };
}

function sprite(map: CanvasTexture, w: number, h: number) {
  const s = new Sprite(new SpriteMaterial({ map, depthWrite: false, toneMapped: false }));
  s.scale.set(w, h, 1);
  return s;
}

// ---------------------------------------------------------------- buildings: the toy town

function bambooStalk(k: Kit, x: number, z: number, h: number, y = 0) {
  k.cyl(0.011, 0.013, h, P.leaf, [x, y + h / 2, z], 0, 1, 7);
  for (let t = 0.3; t < 1; t += 0.3) k.cyl(0.015, 0.015, 0.008, P.leafDark, [x, y + h * t, z], 0, 1, 7);
  k.cone(0.032, 0.1, P.leaf, [x + 0.035, y + h * 0.86, z], [0, 0, -1.15], [1, 1, 0.35], 5);
  k.cone(0.03, 0.09, P.leafDark, [x - 0.034, y + h * 0.7, z + 0.01], [0, 0, 1.15], [1, 1, 0.35], 5);
  k.cone(0.028, 0.08, P.leaf, [x, y + h * 0.98, z - 0.03], [-0.9, 0, 0], [0.35, 1, 1], 5);
}

function miniPanda(k: Kit) {
  k.ball(0.09, P.paper, [0, 0.085, 0], 0, [1, 0.95, 0.9]);
  k.ball(0.092, P.ink, [0, 0.12, 0], 0, [1.02, 0.38, 0.92]);
  k.cap(0.03, 0.05, P.ink, [-0.07, 0.08, 0.05], [1.2, 0, 0.3]);
  k.cap(0.03, 0.05, P.ink, [0.07, 0.08, 0.05], [1.2, 0, -0.3]);
  k.ball(0.035, P.ink, [-0.05, 0.02, 0.07]);
  k.ball(0.035, P.ink, [0.05, 0.02, 0.07]);
  k.ball(0.075, P.paper, [0, 0.21, 0.01]);
  k.ball(0.027, P.ink, [-0.058, 0.27, -0.005]);
  k.ball(0.027, P.ink, [0.058, 0.27, -0.005]);
  k.ball(0.02, P.ink, [-0.03, 0.215, 0.062], [0, 0, 0.5], [1, 1.3, 0.6]);
  k.ball(0.02, P.ink, [0.03, 0.215, 0.062], [0, 0, -0.5], [1, 1.3, 0.6]);
  k.ball(0.01, P.ink, [0, 0.19, 0.074]);
  k.cyl(0.009, 0.009, 0.17, P.leaf, [0.01, 0.13, 0.09], [0.25, 0, 0.95], 1, 6);
}

function upturnedTips(k: Kit, half: number, y: number, rad: number, h: number, color: string) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cone(rad, h, color, [sx * half, y, sz * half], [sz * 0.85, 0, -sx * 0.85], 1, 5);
}

// A two-storey pagoda with a panda medallion, a bamboo grove and a resident panda.
function sanctuary(k: Kit) {
  k.cyl(0.26, 0.27, 0.05, P.stone1, [0, 0.025, 0], 0, 1, 8);
  k.cyl(0.215, 0.225, 0.03, P.stone2, [0, 0.065, 0], 0, 1, 8);
  k.box(0.12, 0.028, 0.07, P.stone2, [0, 0.014, 0.275]);
  k.box(0.25, 0.15, 0.25, P.red, [0, 0.155, 0]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.cyl(0.02, 0.02, 0.15, P.redDark, [x * 0.125, 0.155, z * 0.125], 0, 1, 8);
  k.box(0.08, 0.1, 0.012, P.ink, [0, 0.13, 0.127]);
  k.box(0.12, 0.018, 0.014, P.gold, [0, 0.19, 0.128]);
  k.box(0.38, 0.022, 0.38, P.jadeDark, [0, 0.241, 0]);
  k.cone(0.29, 0.11, P.jade, [0, 0.307, 0], [0, Math.PI / 4, 0], 1, 4);
  upturnedTips(k, 0.19, 0.262, 0.024, 0.08, P.jade);
  k.box(0.165, 0.09, 0.165, P.red, [0, 0.39, 0]);
  k.box(0.28, 0.018, 0.28, P.jadeDark, [0, 0.443, 0]);
  k.cone(0.215, 0.09, P.jade, [0, 0.497, 0], [0, Math.PI / 4, 0], 1, 4);
  upturnedTips(k, 0.14, 0.456, 0.018, 0.06, P.jade);
  k.cyl(0.007, 0.007, 0.08, P.gold, [0, 0.575, 0], 0, 1, 6);
  k.ball(0.022, P.gold, [0, 0.622, 0]);
  k.cyl(0.05, 0.05, 0.012, P.paper, [0, 0.39, 0.086], [Math.PI / 2, 0, 0], 1, 18);
  k.ball(0.017, P.ink, [-0.036, 0.428, 0.087]);
  k.ball(0.017, P.ink, [0.036, 0.428, 0.087]);
  k.ball(0.013, P.ink, [-0.018, 0.392, 0.093], [0, 0, 0.5], [1, 1.35, 0.5]);
  k.ball(0.013, P.ink, [0.018, 0.392, 0.093], [0, 0, -0.5], [1, 1.35, 0.5]);
  k.ball(0.007, P.ink, [0, 0.375, 0.094]);
  bambooStalk(k, -0.17, 0.16, 0.34, 0.05);
  bambooStalk(k, -0.21, 0.07, 0.42, 0.05);
  bambooStalk(k, -0.1, 0.21, 0.27, 0.05);
  k.in([0.15, 0.08, 0.17], [0, -0.5, 0], 0.62, () => miniPanda(k));
}

// A yellow gym with a giant barbell on the roof and kettlebells by the door.
function gym(k: Kit) {
  k.box(0.52, 0.04, 0.4, P.stone1, [0, 0.02, 0]);
  k.box(0.44, 0.2, 0.3, "#f8d25a", [0, 0.14, -0.03]);
  k.box(0.446, 0.035, 0.306, P.goldDark, [0, 0.057, -0.03]);
  k.box(0.47, 0.03, 0.33, P.stone1, [0, 0.255, -0.03]);
  k.box(0.1, 0.075, 0.012, P.window, [-0.13, 0.16, 0.121]);
  k.box(0.1, 0.075, 0.012, P.window, [0.13, 0.16, 0.121]);
  k.box(0.075, 0.12, 0.012, P.woodDark, [0, 0.1, 0.121]);
  k.box(0.32, 0.034, 0.012, P.red, [0, 0.222, 0.121]);
  k.box(0.03, 0.05, 0.03, P.stoneDark, [-0.11, 0.295, -0.03]);
  k.box(0.03, 0.05, 0.03, P.stoneDark, [0.11, 0.295, -0.03]);
  k.cyl(0.014, 0.014, 0.66, P.steel, [0, 0.33, -0.03], [0, 0, Math.PI / 2], 1, 8);
  for (const s of [-1, 1]) {
    k.cyl(0.11, 0.11, 0.045, P.ink, [s * 0.22, 0.33, -0.03], [0, 0, Math.PI / 2], 1, 20);
    k.cyl(0.082, 0.082, 0.036, P.red, [s * 0.265, 0.33, -0.03], [0, 0, Math.PI / 2], 1, 20);
    k.cyl(0.024, 0.024, 0.02, P.steel, [s * 0.305, 0.33, -0.03], [0, 0, Math.PI / 2], 1, 10);
  }
  for (const x of [0.18, 0.23]) {
    k.ball(0.028, P.ink, [x, 0.068, 0.16]);
    k.torus(0.018, 0.006, P.ink, [x, 0.1, 0.16]);
  }
}

// A market stall with a striped awning, the Kirds' goods on the counter and a big gold coin sign.
function market(k: Kit) {
  k.box(0.5, 0.03, 0.38, P.deck, [0, 0.015, 0]);
  k.box(0.44, 0.2, 0.06, P.woodDark, [0, 0.13, -0.14]);
  k.box(0.44, 0.1, 0.1, P.wood, [0, 0.08, 0.08]);
  k.box(0.46, 0.015, 0.12, P.woodDark, [0, 0.137, 0.08]);
  for (const x of [-0.21, 0.21]) {
    k.cyl(0.012, 0.012, 0.3, P.woodDark, [x, 0.18, 0.15], 0, 1, 6);
    k.cyl(0.012, 0.012, 0.36, P.woodDark, [x, 0.21, -0.16], 0, 1, 6);
  }
  for (let i = 0; i < 7; i++) k.box(0.068, 0.016, 0.38, i % 2 ? P.paper : P.red, [-0.204 + i * 0.068, 0.355, 0], [0.2, 0, 0]);
  for (let i = 0; i < 7; i++) k.ball(0.034, i % 2 ? P.paper : P.red, [-0.204 + i * 0.068, 0.318, 0.185], 0, [1, 0.8, 0.45]);
  k.ball(0.042, P.rice, [-0.16, 0.18, 0.08], 0, [1, 1.1, 1]);
  k.cyl(0.012, 0.02, 0.03, P.deck, [-0.16, 0.232, 0.08], 0, 1, 8);
  k.gem(0.03, P.gem, [-0.075, 0.175, 0.08]);
  k.gem(0.02, P.gemLight, [-0.045, 0.165, 0.11]);
  for (let i = 0; i < 3; i++) k.cyl(0.009, 0.009, 0.1, P.leaf, [0.03, 0.153 + (i === 2 ? 0.014 : 0), 0.07 + (i === 1 ? 0.02 : i === 2 ? 0.01 : 0)], [0, 0, Math.PI / 2], 1, 6);
  k.rock(0.03, P.stone2, [0.12, 0.168, 0.08]);
  k.box(0.06, 0.025, 0.03, P.iron, [0.185, 0.157, 0.09]);
  k.box(0.07, 0.05, 0.04, "#d6a24a", [-0.14, 0.255, -0.14]);
  k.box(0.07, 0.05, 0.04, "#7fa35a", [0, 0.255, -0.14]);
  k.box(0.07, 0.05, 0.04, "#c97b5a", [0.14, 0.255, -0.14]);
  k.cyl(0.01, 0.012, 0.36, P.woodDark, [0.26, 0.18, 0.17], 0, 1, 6);
  k.cyl(0.09, 0.09, 0.02, P.gold, [0.26, 0.42, 0.17], [Math.PI / 2, 0, 0], 1, 24);
  k.cyl(0.066, 0.066, 0.026, P.goldDark, [0.26, 0.42, 0.17], [Math.PI / 2, 0, 0], 1, 24);
  k.box(0.022, 0.07, 0.03, P.goldBright, [0.26, 0.42, 0.17]);
}

const FORT_RADIUS = 1.02;
const FORT_GATE = 0.42;
// Stone walls round the whole hex with towers, a keep flying the owner's flag, and a gate at the front
// so the region's number stays in view.
function fort(k: Kit) {
  const rw = FORT_RADIUS;
  const h = 0.13;
  const t = 0.065;
  const V = [...Array(6)].map((_, i): [number, number] => [rw * Math.sin((i * Math.PI) / 3), rw * Math.cos((i * Math.PI) / 3)]); // S, SE, NE, N, NW, SW
  const toward = ([x1, z1]: [number, number], [x2, z2]: [number, number], d: number): [number, number] => [x1 + ((x2 - x1) * d) / rw, z1 + ((z2 - z1) * d) / rw];
  const gates = [toward(V[0], V[1], FORT_GATE), toward(V[0], V[5], FORT_GATE)];
  for (let i = 0; i < 6; i++) {
    const a = i === 0 ? gates[0] : V[i];
    const b = i === 5 ? gates[1] : V[(i + 1) % 6];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    k.in([(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], [0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0], 1, () => {
      k.box(t, h, len, P.stone2, [0, h / 2, 0]);
      for (let m = -len / 2 + 0.09; m < len / 2 - 0.06; m += 0.105) k.box(t + 0.012, 0.045, 0.05, P.stone3, [0, h + 0.022, m]);
    });
  }
  const towers = [...V.slice(1).map((v, i) => ({ v, keep: i === 2, gate: false })), ...gates.map((v) => ({ v, keep: false, gate: true }))];
  for (const { v: [x, z], keep, gate } of towers) {
    const th = keep ? 0.36 : gate ? 0.25 : 0.22;
    const tr = keep ? 0.1 : 0.078;
    k.cyl(tr, tr + 0.01, th, P.stone1, [x, th / 2, z], 0, 1, 10);
    k.cyl(tr + 0.02, tr + 0.005, 0.035, P.stone2, [x, th + 0.017, z], 0, 1, 10);
    k.in([x, 0, z], 0, 1, () => {
      for (let j = 0; j < 6; j++) k.in(0, [0, (j * Math.PI) / 3 + 0.3, 0], 1, () => k.box(0.035, 0.042, 0.03, P.stone2, [0, th + 0.055, tr + 0.005]));
    });
    k.box(0.018, 0.045, 0.012, P.stoneDark, [x, th * 0.62, z + tr + 0.004]);
    if (!keep) k.box(0.05, 0.1, 0.008, "owner", [x, th * 0.5, z + tr + 0.014]);
  }
  const [kx, kz] = V[3];
  k.cyl(0.006, 0.006, 0.2, P.woodDark, [kx, 0.46, kz], 0, 1, 6);
  k.box(0.13, 0.08, 0.008, "owner", [kx + 0.066, 0.52, kz]);
}

const BUILDERS: Record<BuildingType, (k: Kit) => void> = { sanctuary, gym, market, fort };
const buildingModel = (type: BuildingType) => cached(`b-${type}`, BUILDERS[type]);

// Where a building stands on its hex and where its pin floats above it, in hex units.
// Every building but the fort has its own corner; the fort walls in the whole hex.
export function buildingSpot(type: BuildingType): { slot: [number, number]; pin: V3 } {
  if (type === "fort") return { slot: [0, 0], pin: [0, 0.64, -FORT_RADIUS] };
  return { slot: SLOTS[type], pin: [SLOTS[type][0], buildingModel(type).height + 0.05, SLOTS[type][1]] };
}

// The building itself, standing at the origin. A ghost is the see-through preview shown while you choose where to build.
export function buildingBody(type: BuildingType, owner: string, ghost?: Ghost) {
  return instance(buildingModel(type), owner, ghost);
}

// A map pin with the building's icon, the same one the menus use.
export function buildingPin(type: BuildingType) {
  const s = sprite(pinTex(type), 0.34, 0.425);
  s.center.set(0.5, 0);
  keepReadable(s, 30);
  return s;
}

// ---------------------------------------------------------------- troops

function pandaFig(k: Kit, armed = false) {
  const W = P.paper;
  const B = P.ink;
  k.cap(0.046, 0.05, B, [-0.066, 0.066, 0]);
  k.cap(0.046, 0.05, B, [0.066, 0.066, 0]);
  k.ball(0.14, W, [0, 0.2, 0], 0, [1, 1.05, 0.88]);
  k.ball(0.146, B, [0, 0.268, -0.005], 0, [1.02, 0.42, 0.92]);
  if (!armed) {
    k.cap(0.043, 0.09, B, [-0.14, 0.21, 0.05], [-0.55, 0, -0.35]);
    k.cap(0.043, 0.09, B, [0.14, 0.21, 0.05], [-0.55, 0, 0.35]);
  }
  k.ball(0.135, W, [0, 0.43, 0.01], 0, [1.05, 0.95, 1]);
  k.ball(0.049, B, [-0.1, 0.53, -0.01]);
  k.ball(0.049, B, [0.1, 0.53, -0.01]);
  k.ball(0.036, B, [-0.052, 0.44, 0.115], [0, 0, 0.55], [0.85, 1.25, 0.55]);
  k.ball(0.036, B, [0.052, 0.44, 0.115], [0, 0, -0.55], [0.85, 1.25, 0.55]);
  k.ball(0.013, W, [-0.05, 0.449, 0.135]);
  k.ball(0.013, W, [0.05, 0.449, 0.135]);
  k.ball(0.02, B, [0, 0.405, 0.136], 0, [1.25, 0.8, 0.8]);
  k.torus(0.1, 0.027, "owner", [0, 0.318, 0], [Math.PI / 2, 0, 0]);
  k.box(0.05, 0.1, 0.02, "owner", [0.055, 0.265, 0.1], [0.3, 0, 0.2]);
  if (!armed) {
    k.cyl(0.012, 0.012, 0.3, P.leaf, [0.19, 0.27, 0.1], [0.15, 0, -0.18], 1, 7);
    k.cone(0.03, 0.09, P.leaf, [0.23, 0.4, 0.1], [0, 0, -1.1], [1, 1, 0.35], 5);
    k.cone(0.028, 0.08, P.leafDark, [0.18, 0.37, 0.1], [0, 0, 1.1], [1, 1, 0.35], 5);
  }
}

// A panda in a tin helmet, with a shield in the owner's colour and a bamboo spear.
function armedPandaFig(k: Kit) {
  pandaFig(k, true);
  k.dome(0.147, P.steel, [0, 0.448, 0.004], [-0.12, 0, 0]);
  k.cyl(0.168, 0.168, 0.016, P.steelDark, [0, 0.452, 0.004], [-0.12, 0, 0], 1, 22);
  k.cone(0.02, 0.06, P.steelDark, [0, 0.615, -0.012], 0, 1, 8);
  k.cap(0.043, 0.08, P.ink, [-0.14, 0.23, 0.07], [-1.1, 0, -0.3]);
  k.cap(0.043, 0.08, P.ink, [0.15, 0.24, 0.03], [-0.25, 0, 0.3]);
  k.cyl(0.125, 0.125, 0.026, "owner", [-0.13, 0.24, 0.165], [Math.PI / 2, 0, 0.1], 1, 22);
  k.torus(0.12, 0.013, P.paper, [-0.13, 0.24, 0.18]);
  k.ball(0.032, P.paper, [-0.13, 0.24, 0.185]);
  k.cyl(0.011, 0.011, 0.72, P.wood, [0.21, 0.34, 0.05], 0, 1, 7);
  k.torus(0.016, 0.006, P.woodDark, [0.21, 0.66, 0.05], [Math.PI / 2, 0, 0]);
  k.cone(0.026, 0.09, P.steel, [0.21, 0.745, 0.05], 0, 1, 6);
}

// A hulking green NACAM ogre: tusks, red eyes, a loincloth in the owner's colour and a spiked club.
function ogreFig(k: Kit) {
  const S = P.ogre;
  const D = P.ogreDark;
  k.cap(0.062, 0.05, D, [-0.09, 0.075, 0]);
  k.cap(0.062, 0.05, D, [0.09, 0.075, 0]);
  k.cyl(0.155, 0.165, 0.085, "owner", [0, 0.15, 0], 0, 1, 10);
  k.box(0.085, 0.1, 0.02, "ownerDark", [0, 0.1, 0.15]);
  k.ball(0.2, S, [0, 0.31, -0.02], [0.25, 0, 0], [1.2, 1, 0.9]);
  k.ball(0.14, P.ogreLight, [0, 0.27, 0.08], 0, [1, 1, 0.7]);
  k.ball(0.11, S, [-0.17, 0.41, -0.02]);
  k.ball(0.11, S, [0.17, 0.41, -0.02]);
  k.cap(0.066, 0.16, S, [-0.25, 0.28, 0.03], [0, 0, -0.18]);
  k.cap(0.066, 0.16, S, [0.25, 0.28, 0.03], [0, 0, 0.18]);
  k.ball(0.078, D, [-0.275, 0.13, 0.05]);
  k.ball(0.078, D, [0.275, 0.13, 0.05]);
  k.ball(0.095, S, [0, 0.43, 0.09]);
  k.box(0.15, 0.036, 0.05, D, [0, 0.468, 0.16], [0.25, 0, 0]);
  k.ball(0.02, P.eye, [-0.037, 0.44, 0.172]);
  k.ball(0.02, P.eye, [0.037, 0.44, 0.172]);
  k.box(0.13, 0.06, 0.09, D, [0, 0.385, 0.14]);
  k.cone(0.016, 0.05, P.paper, [-0.045, 0.43, 0.186], 0, 1, 6);
  k.cone(0.016, 0.05, P.paper, [0.045, 0.43, 0.186], 0, 1, 6);
  k.cone(0.026, 0.07, S, [-0.105, 0.46, 0.07], [0, 0, 1.2], 1, 6);
  k.cone(0.026, 0.07, S, [0.105, 0.46, 0.07], [0, 0, -1.2], 1, 6);
  k.ball(0.016, D, [0.07, 0.475, 0.13]);
  k.ball(0.013, D, [-0.13, 0.34, 0.12]);
  k.in([0.3, 0.14, 0.08], [0.35, 0, -0.55], 1, () => {
    k.cyl(0.068, 0.028, 0.36, P.woodDark, [0, 0.17, 0], 0, 1, 9);
    for (let i = 0; i < 7; i++) k.in(0, [0, (i / 7) * Math.PI * 2, 0], 1, () => k.cone(0.014, 0.05, P.steelDark, [0, 0.24 + (i % 2) * 0.07, 0.07], [Math.PI / 2, 0, 0], 1, 5));
  });
}

// A Classically Attractive Male mid double-biceps flex: gold quiff, shades, trunks in the owner's colour.
function camFig(k: Kit) {
  const S = P.skin;
  const H = P.goldBright;
  k.cap(0.05, 0.12, S, [-0.065, 0.12, 0], [0, 0, 0.06]);
  k.cap(0.05, 0.12, S, [0.065, 0.12, 0], [0, 0, -0.06]);
  k.box(0.075, 0.035, 0.11, P.paper, [-0.07, 0.018, 0.02]);
  k.box(0.075, 0.035, 0.11, P.paper, [0.07, 0.018, 0.02]);
  k.cyl(0.1, 0.112, 0.085, "owner", [0, 0.22, 0], 0, [1, 1, 0.75], 12);
  k.cyl(0.17, 0.085, 0.24, S, [0, 0.36, 0], 0, [1, 1, 0.62], 12);
  k.ball(0.066, S, [-0.056, 0.42, 0.056], 0, [1.1, 0.8, 0.6]);
  k.ball(0.066, S, [0.056, 0.42, 0.056], 0, [1.1, 0.8, 0.6]);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.box(0.034, 0.028, 0.02, P.skinDark, [s * 0.022, 0.365 - i * 0.038, 0.062]);
  k.ball(0.072, S, [-0.17, 0.465, 0]);
  k.ball(0.072, S, [0.17, 0.465, 0]);
  for (const s of [-1, 1]) {
    k.cap(0.048, 0.1, S, [s * 0.25, 0.47, 0], [0, 0, Math.PI / 2]);
    k.ball(0.063, S, [s * 0.25, 0.5, 0.012]);
    k.cap(0.04, 0.1, S, [s * 0.33, 0.56, 0]);
    k.ball(0.046, S, [s * 0.33, 0.64, 0]);
  }
  k.cyl(0.045, 0.05, 0.05, S, [0, 0.5, 0], 0, 1, 10);
  k.ball(0.076, S, [0, 0.572, 0.005], 0, [0.92, 1.05, 0.95]);
  k.box(0.1, 0.05, 0.08, S, [0, 0.532, 0.02]);
  k.ball(0.081, H, [0, 0.617, -0.012], 0, [1, 0.55, 1]);
  k.ball(0.044, H, [0, 0.642, 0.045], [0.4, 0, 0]);
  k.box(0.122, 0.025, 0.02, P.ink, [0, 0.585, 0.07]);
  k.box(0.04, 0.008, 0.01, P.paper, [0, 0.535, 0.069]);
  k.gem(0.055, H, [0.17, 0.72, 0.06], 0, [0.28, 1, 0.28]);
  k.gem(0.055, H, [0.17, 0.72, 0.06], [0, 0, Math.PI / 2], [0.28, 1, 0.28]);
}

const FIGURES: Record<UnitType, (k: Kit) => void> = { panda: (k) => pandaFig(k), armedPanda: armedPandaFig, nacam: ogreFig, cam: camFig };

function flatBase(k: Kit) {
  k.cyl(0.17, 0.18, 0.035, "owner", [0, 0.0175, 0], 0, 1, 28);
}

// One figure on its base, for the battle scene.
export function figureObject(kind: UnitType, owner: string) {
  return instance(
    cached(`fig-${kind}`, (k) => FIGURES[kind](k)),
    owner,
  );
}

const TYPE_ORDER: UnitType[] = ["cam", "nacam", "armedPanda", "panda"];
const dominant = (u: Units) => TYPE_ORDER.reduce((best, t) => (u[t] > u[best] ? t : best), "panda" as UnitType);

// Which figures stand for an army: the most numerous type leads, every type present gets at least one,
// and any spare places are shared out by head count.
function armyFigures(units: Units, max: number): UnitType[] {
  const present = TYPE_ORDER.filter((t) => units[t] > 0);
  if (!present.length) return [];
  const lead = dominant(units);
  const order = [lead, ...present.filter((t) => t !== lead)];
  if (max <= order.length) return order.slice(0, max);
  const total = present.reduce((n, t) => n + units[t], 0);
  const out = [...order];
  const n = Math.min(max, total);
  while (out.length < n) {
    const need = order.map((t) => (units[t] / total) * n - out.filter((x) => x === t).length);
    out.push(order[need.indexOf(Math.max(...need))]);
  }
  return out;
}

export type ArmyLook = "squad" | "mascot";

// Squad (zoomed in): up to six figures in two staggered rows, the leaders in front.
// Mascot (zoomed out): one big figure for the main unit with up to two small sidekicks.
const SQUAD_SPOTS: [number, number][] = [[0, 0.1], [-0.19, 0.06], [0.19, 0.06], [-0.1, -0.13], [0.1, -0.13], [0.27, -0.14]];
const MASCOT_SPOTS: [number, number, number][] = [[0, 0.02, 1], [0.21, -0.1, 0.58], [-0.21, -0.08, 0.58]];

function armyModel(look: ArmyLook, figs: UnitType[]) {
  return cached(`army-${look}-${figs.join(",")}`, (k) => {
    figs.forEach((t, i) => {
      const [x, z, s] = look === "squad" ? [...SQUAD_SPOTS[i], 0.56] : MASCOT_SPOTS[i];
      const turn = look === "squad" ? (i % 2 ? -1 : 1) * 0.12 : 0;
      k.in([x, 0, z], 0, look === "squad" ? 0.5 : s, () => flatBase(k));
      k.in([x, 0.035 * s, z], [0, turn, 0], s, () => FIGURES[t](k));
    });
  });
}

function bannerModel() {
  return cached("banner", (k) => {
    k.cyl(0.012, 0.014, 0.8, P.woodDark, [0, 0.4, 0], 0, 1, 6);
    k.ball(0.022, P.gold, [0, 0.81, 0]);
    k.box(0.2, 0.13, 0.012, "owner", [0.1, 0.71, 0]);
    k.box(0.2, 0.02, 0.014, "ownerDark", [0.1, 0.64, 0]);
    k.cone(0.045, 0.06, "owner", [0.2, 0.66, 0], [0, 0, -Math.PI / 2], [1, 1, 0.12], 3);
  });
}

// An army at the middle of its hex: the figures, a banner in the owner's colour and a badge with the head count.
export function armyObject(units: Units, owner: string, look: ArmyLook, count: number) {
  const g = new Group();
  const figs = armyFigures(units, look === "squad" ? 6 : 3);
  g.add(instance(armyModel(look, figs), owner));
  const shadow = blobShadow(look === "squad" ? 0.42 : 0.36, look === "squad" ? 0.24 : 0.28);
  shadow.position.z = look === "squad" ? -0.02 : 0;
  g.add(shadow);
  const banner = instance(bannerModel(), owner);
  banner.position.set(look === "squad" ? 0.02 : 0.26, 0, look === "squad" ? -0.26 : 0.05);
  g.add(banner);
  const badge = sprite(badgeTex(count, owner), 0.34, 0.34);
  badge.position.set(banner.position.x + 0.1, 0.94, banner.position.z);
  keepReadable(badge, 24);
  g.add(badge);
  g.position.set(SLOTS.army[0], 0, SLOTS.army[1]);
  return g;
}

// The owner's flag, for a region they hold with nobody in it.
export function flagObject(owner: string) {
  const g = instance(bannerModel(), owner);
  g.position.set(SLOTS.army[0] + 0.1, 0, SLOTS.army[1]);
  g.scale.setScalar(0.8);
  return g;
}

// Sprites each get their own material; free them when their army or pin leaves the board.
export function disposeSprites(obj: Group | Sprite) {
  obj.traverse((o) => {
    if ((o as Sprite).isSprite) ((o as Sprite).material as Material).dispose();
  });
}
