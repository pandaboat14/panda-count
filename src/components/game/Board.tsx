"use client";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, Text } from "@react-three/drei";
import {
  CatmullRomCurve3,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
  type DirectionalLight,
  type Group,
  type Mesh,
  type Object3D,
} from "three";
import { latLngToVector3, RADIUS } from "@/components/globe/geo";
import { makeEarthTexture } from "@/components/globe/textures";
import { unitTotal, type GameView, type RegionView, type Units } from "@/game/engine";
import { lineEnds, REGION_BY_ID, type Resource } from "@/game/regions";
import { BUILDINGS, HEROES, HERO_IDS, type BuildingType } from "@/game/rules";
import {
  SLOTS,
  armyObject,
  blobShadow,
  buildingBody,
  buildingPin,
  buildingSpot,
  disposeSprites,
  flagObject,
  loadBadgeFont,
  type ArmyLook,
} from "./models";

const FONT = "/fonts/bricolage-800.woff";
const UP = new Vector3(0, 1, 0);
const TILE = 0.2;
// Everything standing on a hex lives in "hex units", lifted onto the hex's top face.
const DECO_Y = 0.045;
const MAST_TOP = 0.157;
// The camera leans in as you zoom, up to this angle; squads show up close, mascots from further out.
const TILT_MAX = (50 * Math.PI) / 180;
const SQUADS_BELOW = 3;
const MASCOTS_ABOVE = 3.4;

export const RESOURCE_COLORS: Record<Resource, string> = {
  bamboo: "#5f9a4a",
  stone: "#9a968c",
  iron: "#5d6b7a",
  rice: "#e2cf8a",
  gems: "#9b6fc7",
};
export const NATIVE_COLORS = { pandas: "#f7f4ec", nacams: "#6f8a3a", cams: "#e8b64a", wild: "#c9d6bf" } as const;

export type Highlight = { regions: string[]; tone: "battle" | "build" | "move" | "info" | "hero" };
// Choosing where to build: the building, the regions it can go in, and the one picked so far.
export type Placing = { type: BuildingType; sites: string[]; site: string | null };
// A building that just went up, so the board can raise it out of the ground.
export type Built = { region: string; building: BuildingType; seq: number };

type Props = {
  view: GameView;
  selected: string | null;
  targets: string[]; // regions you can click to complete the current action
  highlight: Highlight | null;
  focus: { lat: number; lng: number; seq: number } | null;
  still: boolean;
  placing: Placing | null;
  built: Built | null;
  movable: Map<string, string[]>; // regions whose troops you can drag, and where they can go
  onSelect: (id: string) => void;
  onDrop: (from: string, to: string) => void;
  onReady: () => void;
};

// What the camera rig shares with the board: which army look the zoom calls for, and a way to hold the globe
// still while you drag troops.
type Rig = { lod: { readonly current: ArmyLook }; holdGlobe: (hold: boolean) => void };
const RigContext = createContext<Rig | null>(null);

// Memoised: switching panel tabs re-renders the game screen, but the globe only redraws when its own props change.
export default memo(function Board({ onReady, focus, still, ...props }: Props) {
  const start = useMemo(() => {
    const cap = props.view.players.find((p) => p.id === props.view.me)?.capital;
    const def = cap ? REGION_BY_ID.get(cap) : undefined;
    return latLngToVector3(def?.lat ?? 30, def?.lng ?? 100, RADIUS + 4);
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 40, near: 0.01, far: 200, position: start.toArray() }} onCreated={onReady} aria-label="Game board">
      <ambientLight intensity={1.35} />
      <CameraRig start={start} focus={focus} still={still}>
        <World {...props} still={still} />
      </CameraRig>
    </Canvas>
  );
});

// ---------------------------------------------------------------- camera

const _s = new Vector3();
const _north = new Vector3();
const _f = new Vector3();
const _dir = new Vector3();

// The globe controls drive an invisible camera that always looks at the globe's centre. The real camera sits over
// the same spot but swings south and looks at it at an angle, more so the closer you zoom, so buildings and troops
// are seen from the side. Zoomed right out it looks straight down, as before.
function CameraRig({ start, focus, still, children }: { start: Vector3; focus: Props["focus"]; still: boolean; children: ReactNode }) {
  const camera = useThree((s) => s.camera);
  const virtual = useMemo(() => {
    const c = new PerspectiveCamera(40, 1, 0.05, 200);
    c.position.copy(start);
    return c;
  }, [start]);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const lod = useRef<ArmyLook>("mascot");
  const target = useRef<Vector3 | null>(null);
  const tilt = useRef(0);
  const sun = useRef<DirectionalLight>(null);
  const rig = useMemo<Rig>(
    () => ({
      lod,
      holdGlobe: (hold) => {
        if (controls.current) controls.current.enabled = !hold;
      },
    }),
    [],
  );

  useEffect(() => {
    if (!focus) return;
    const dir = latLngToVector3(focus.lat, focus.lng, 1).normalize();
    if (still) virtual.position.copy(dir.multiplyScalar(virtual.position.length()));
    else target.current = dir;
  }, [focus, still, virtual]);

  useFrame((_, dt) => {
    if (target.current) {
      const len = virtual.position.length();
      const cur = virtual.position.clone().normalize().lerp(target.current, 1 - Math.exp(-dt * 3.5)).normalize();
      virtual.position.copy(cur.multiplyScalar(len));
      if (cur.angleTo(target.current) < 0.003) target.current = null;
    }
    const h = virtual.position.length() - RADIUS;
    const want = TILT_MAX * Math.pow(Math.min(1, Math.max(0, (15 - h) / 14)), 0.75);
    tilt.current += (want - tilt.current) * (still ? 1 : 1 - Math.exp(-dt * 6));
    _s.copy(virtual.position).normalize();
    _north.copy(UP).addScaledVector(_s, -_s.y);
    if (_north.lengthSq() < 1e-6) _north.set(0, 0, -1);
    _north.normalize();
    _f.copy(_s).multiplyScalar(RADIUS);
    _dir.copy(_s).multiplyScalar(Math.cos(tilt.current)).addScaledVector(_north, -Math.sin(tilt.current));
    camera.position.copy(_f).addScaledVector(_dir, h);
    camera.up.copy(_north);
    camera.lookAt(_f);
    camera.updateMatrixWorld();
    // The sun sits over your left shoulder wherever you look.
    if (sun.current) {
      sun.current.position.set(-2.5, 3, 1.5).applyMatrix4(camera.matrixWorld);
      sun.current.target.position.set(0, 0, -6).applyMatrix4(camera.matrixWorld);
      sun.current.target.updateMatrixWorld();
    }
    lod.current = h < SQUADS_BELOW ? "squad" : h > MASCOTS_ABOVE ? "mascot" : lod.current;
  });

  return (
    <RigContext.Provider value={rig}>
      <OrbitControls
        ref={controls}
        camera={virtual}
        enablePan={false}
        enableDamping
        minDistance={RADIUS * 1.2}
        maxDistance={RADIUS * 4}
        rotateSpeed={0.45}
        zoomSpeed={0.8}
      />
      <directionalLight ref={sun} intensity={2.1} color="#fff3df" />
      {children}
    </RigContext.Provider>
  );
}

// ---------------------------------------------------------------- the world

const HIDDEN = new MeshBasicMaterial({ visible: false });

function World({ view, selected, targets, highlight, still, placing, built, movable, onSelect, onDrop }: Omit<Props, "onReady" | "focus">) {
  const earth = useMemo(() => makeEarthTexture(), []);
  useEffect(() => () => earth.dispose(), [earth]);
  const colorOf = useMemo(() => new Map(view.players.map((p) => [p.id, p.color])), [view.players]);
  const heroesAt = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of HERO_IDS) {
      const r = view.heroes[h].region;
      if (r) m.set(r, [...(m.get(r) ?? []), h]);
    }
    return m;
  }, [view.heroes]);
  const stations = useMemo(() => new Set(view.lines.flatMap((l) => lineEnds(l.id))), [view.lines]);
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadBadgeFont().then(() => live && setFontReady(true));
    return () => {
      live = false;
    };
  }, []);

  const hits = useRef(new Map<string, Object3D>());
  const setHit = useCallback((id: string, m: Object3D | null) => {
    if (m) hits.current.set(id, m);
    else hits.current.delete(id);
  }, []);
  const { state: dragging, start: startDrag, tip, earthRef } = useTroopDrag(movable, onDrop, hits);
  const targetSet = useMemo(() => new Set(dragging ? dragging.targets : placing ? placing.sites : targets), [dragging, placing, targets]);

  return (
    <group>
      <mesh onClick={(e) => e.stopPropagation()} ref={earthRef}>
        <sphereGeometry args={[RADIUS, 96, 64]} />
        <meshStandardMaterial map={earth} roughness={0.95} toneMapped={false} />
      </mesh>
      {view.lines.map((l) => (
        <Gondola key={l.id} id={l.id} color={colorOf.get(l.owner) ?? "#888"} still={still} />
      ))}
      {view.regions.map((r) => {
        const owner = r.owner ? colorOf.get(r.owner) ?? "#888" : null;
        return (
          <Tile
            key={r.id}
            region={r}
            ownerColor={owner}
            selected={selected === r.id}
            target={targetSet.has(r.id)}
            dragOver={dragging?.over === r.id ? (r.owner === view.me ? "move" : "attack") : null}
            lifted={dragging?.from === r.id}
            station={stations.has(r.id)}
            heroes={heroesAt.get(r.id) ?? []}
            ghost={placing && placing.sites.includes(r.id) ? { type: placing.type, picked: placing.site === r.id } : null}
            rise={built?.region === r.id ? built : null}
            draggable={movable.has(r.id)}
            fontReady={fontReady}
            still={still}
            onSelect={onSelect}
            onArmyDown={startDrag}
            setHit={setHit}
          />
        );
      })}
      {highlight?.regions.map((id) => <Pulse key={`${id}-${highlight.tone}`} id={id} tone={highlight.tone} still={still} />)}
      {dragging && <DragArc from={dragging.from} over={dragging.over} tip={tip} still={still} />}
    </group>
  );
}

// Stands a tile on the globe with its top (-z) facing north. The camera keeps north up, so every
// number token reads the right way up (a bare setFromUnitVectors leaves each tile twisted by its longitude).
function useSurface(id: string, lift = 0) {
  return useMemo(() => surfaceOf(id, lift), [id, lift]);
}
function surfaceOf(id: string, lift = 0) {
  const def = REGION_BY_ID.get(id)!;
  const pos = latLngToVector3(def.lat, def.lng, RADIUS + lift);
  const normal = pos.clone().normalize();
  const east = new Vector3().crossVectors(UP, normal).normalize();
  const south = new Vector3().crossVectors(east, normal);
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(east, normal, south));
  return { pos, q };
}
// A point on a hex, in world space: `y` above the hex's base, at (x, z) in hex units.
function hexPoint(id: string, y: number, [x, z]: [number, number]) {
  const { pos, q } = surfaceOf(id);
  return new Vector3(x * TILE, y, z * TILE).applyQuaternion(q).add(pos);
}

type TileProps = {
  region: RegionView;
  ownerColor: string | null;
  selected: boolean;
  target: boolean;
  dragOver: "move" | "attack" | null;
  lifted: boolean;
  station: boolean;
  heroes: string[];
  ghost: { type: BuildingType; picked: boolean } | null;
  rise: Built | null;
  draggable: boolean;
  fontReady: boolean;
  still: boolean;
  onSelect: (id: string) => void;
  onArmyDown: (from: string, e: ThreeEvent<PointerEvent>) => void;
  setHit: (id: string, m: Object3D | null) => void;
};

function Tile({ region, ownerColor, selected, target, dragOver, lifted, station, heroes, ghost, rise, draggable, fontReady, still, onSelect, onArmyDown, setHit }: TileProps) {
  const { pos, q } = useSurface(region.id);
  const def = REGION_BY_ID.get(region.id)!;
  const fog = region.fog;
  const color = fog ? "#8c939b" : RESOURCE_COLORS[def.resource];
  const rim = fog ? "#6e757d" : ownerColor ?? (region.native ? NATIVE_COLORS[region.native] : "#d9d2bf");
  const glow = dragOver === "attack" ? "#ff8a7a" : dragOver === "move" ? "#9cc8ff" : ghost?.picked ? "#ffd76a" : selected || target ? rim : null;
  const units = region.units;
  const total = units ? unitTotal(units) : 0;
  const hot = region.token === 6 || region.token === 8;
  const armyColor = ownerColor ?? NATIVE_COLORS[region.native ?? "wild"];

  return (
    <group
      position={pos}
      quaternion={q}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(region.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = draggable ? "grab" : "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
      scale={selected ? 1.25 : 1}
    >
      {/* owner rim */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[TILE * 1.14, TILE * 1.14, 0.024, 6]} />
        <meshStandardMaterial
          color={rim}
          emissive={glow ?? "#000"}
          emissiveIntensity={glow ? (dragOver || ghost?.picked ? 0.8 : selected ? 0.5 : 0.35) : 0}
          transparent={fog}
          opacity={fog ? 0.7 : 1}
        />
      </mesh>
      {/* resource hex, also what the drag feels for */}
      <mesh position={[0, 0.03, 0]} ref={(m) => setHit(region.id, m)}>
        <cylinderGeometry args={[TILE, TILE, 0.03, 6]} />
        <meshStandardMaterial color={color} transparent={fog} opacity={fog ? 0.75 : 1} />
      </mesh>
      {/* number token, at the front tip where nothing stands in front of it */}
      <group position={[0, 0.05, SLOTS.token[1] * TILE]}>
        <mesh>
          <cylinderGeometry args={[TILE * 0.3, TILE * 0.3, 0.012, 24]} />
          <meshStandardMaterial color="#fbf3df" />
        </mesh>
        <Text font={FONT} fontSize={0.072} color={hot ? "#b3261e" : "#1c1b17"} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} anchorX="center" anchorY="middle">
          {String(region.token)}
        </Text>
      </group>
      {station && <Mast />}
      {fog && (
        <mesh position={[0, 0.09, 0]}>
          <sphereGeometry args={[TILE * 0.7, 12, 8]} />
          <meshStandardMaterial color="#e7e9ec" transparent opacity={0.55} />
        </mesh>
      )}
      <group position={[0, DECO_Y, 0]} scale={TILE}>
        {!fog && region.buildings?.map((b) => <Building key={b} type={b} owner={ownerColor ?? rim} rise={rise?.building === b ? rise.seq : null} still={still} />)}
        {!fog && units && total > 0 && (
          <Army units={units} owner={armyColor} count={total} fontReady={fontReady} lifted={lifted} still={still} />
        )}
        {!fog && ownerColor && total === 0 && <Flag owner={ownerColor} />}
        {draggable && total > 0 && (
          <mesh
            position={[SLOTS.army[0], 0.5, SLOTS.army[1]]}
            material={HIDDEN}
            onPointerDown={(e) => onArmyDown(region.id, e)}
          >
            <cylinderGeometry args={[0.45, 0.45, 1.1, 12]} />
          </mesh>
        )}
        {ghost && <Ghost type={ghost.type} picked={ghost.picked} still={still} />}
        {rise && !fog && <BuildFx key={rise.seq} type={rise.building} still={still} />}
      </group>
      {target && <TargetRing still={still} />}
      {heroes.length > 0 && (
        <Html position={[0, 0.34, 0]} center zIndexRange={[30, 0]}>
          <div className="board-heroes">{heroes.map((h) => HEROES[h as keyof typeof HEROES].icon).join("")}</div>
        </Html>
      )}
    </group>
  );
}

// The gondola station: cables leave from the top of a mast behind the army, clear of everything on the hex.
function Mast() {
  return (
    <group position={[0, 0, SLOTS.mast[1] * TILE]}>
      <mesh position={[0, (DECO_Y + MAST_TOP) / 2, 0]}>
        <cylinderGeometry args={[0.0055, 0.007, MAST_TOP - DECO_Y, 8]} />
        <meshStandardMaterial color="#8a8171" roughness={0.5} />
      </mesh>
      <mesh position={[0, MAST_TOP, 0]}>
        <sphereGeometry args={[0.013, 10, 8]} />
        <meshStandardMaterial color="#8a8171" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- buildings

function Building({ type, owner, rise, still }: { type: BuildingType; owner: string; rise: number | null; still: boolean }) {
  const body = useMemo(() => buildingBody(type, owner), [type, owner]);
  const pin = useMemo(() => buildingPin(type), [type]);
  useEffect(() => () => disposeSprites(pin), [pin]);
  const shadow = useMemo(() => (type === "fort" ? null : blobShadow(0.3, 0.26)), [type]);
  const { slot, pin: pinAt } = buildingSpot(type);
  const holder = useRef<Group>(null);
  const riseAt = useRef<number | null>(null);
  useEffect(() => {
    if (rise !== null && !still) riseAt.current = performance.now() + 300;
  }, [rise, still]);
  // Rising out of the ground: squashed flat, then up past full height and back.
  useFrame(() => {
    const g = holder.current;
    if (!g || riseAt.current === null) return;
    const k = (performance.now() - riseAt.current) / 800;
    if (k >= 1) {
      g.scale.set(1, 1, 1);
      riseAt.current = null;
      return;
    }
    const t = Math.max(0, k);
    const up = 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
    const wide = 0.75 + 0.25 * (1 - Math.pow(1 - t, 3));
    g.scale.set(wide, Math.max(0.001, up), wide);
  });
  return (
    <>
      <group position={[slot[0], 0, slot[1]]}>
        <group ref={holder}>
          <primitive object={body} />
        </group>
        {shadow && <primitive object={shadow} />}
      </group>
      <primitive object={pin} position={pinAt} />
    </>
  );
}

// The see-through building bobbing over each region it could go in while you choose.
function Ghost({ type, picked, still }: { type: BuildingType; picked: boolean; still: boolean }) {
  const body = useMemo(() => buildingBody(type, "#fff", picked ? "picked" : "ghost"), [type, picked]);
  const { slot } = buildingSpot(type);
  const ref = useRef<Group>(null);
  const [phase] = useState(() => Math.random() * 6);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = still ? 0.1 : 0.1 + Math.sin(clock.elapsedTime * 3 + phase) * 0.05;
  });
  return (
    <group position={[slot[0], 0, slot[1]]}>
      <group ref={ref}>
        <primitive object={body} />
      </group>
    </group>
  );
}

const PUFF_GEO_ARGS: [number, number, number] = [0.07, 8, 6];
// Dust, sparkles, a golden ring and a caption when a building goes up.
function BuildFx({ type, still }: { type: BuildingType; still: boolean }) {
  const { slot } = buildingSpot(type);
  const big = type === "fort";
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2800);
    return () => clearTimeout(t);
  }, []);
  const t0 = useRef<number | null>(null);
  const puffs = useRef<Group>(null);
  const sparks = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const dirs = useMemo(() => [...Array(big ? 18 : 11)].map((_, i, a) => (i / a.length) * Math.PI * 2), [big]);
  const [flights] = useState(() => [...Array(12)].map(() => [(Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8]));
  useFrame(({ clock }) => {
    t0.current ??= clock.elapsedTime + 0.35;
    const t = clock.elapsedTime - t0.current;
    if (t < 0) return;
    const reach = big ? 1.1 : 0.42;
    const k = Math.min(1, t / 0.9);
    const e = 1 - Math.pow(1 - k, 3);
    puffs.current?.children.forEach((m, i) => {
      m.position.set(Math.cos(dirs[i]) * reach * e, 0.05 + e * 0.08, Math.sin(dirs[i]) * reach * e);
      m.scale.setScalar(0.6 + e * 1.1);
      ((m as Mesh).material as MeshBasicMaterial).opacity = 0.85 * (1 - k);
    });
    const ks = Math.min(1, Math.max(0, (t - 0.2) / 1.2));
    sparks.current?.children.forEach((m, i) => {
      const [vx, vy, vz] = flights[i];
      m.position.set(vx * ks, vy * ks - 0.6 * ks * ks + 0.2, vz * ks);
      m.rotation.y = ks * 8;
      ((m as Mesh).material as MeshBasicMaterial).opacity = 1 - ks * ks;
    });
    if (ring.current) {
      const kr = Math.min(1, t / 1.4);
      ring.current.scale.setScalar(1 + (1 - Math.pow(1 - kr, 3)) * 1.6);
      (ring.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - kr);
    }
  });
  if (done) return null;
  return (
    <>
      {!still && (
        <group position={[slot[0], 0.02, slot[1]]}>
          <group ref={puffs}>
            {dirs.map((_, i) => (
              <mesh key={i} scale={0}>
                <sphereGeometry args={PUFF_GEO_ARGS} />
                <meshBasicMaterial color="#fbf1dc" transparent depthWrite={false} />
              </mesh>
            ))}
          </group>
          <group ref={sparks}>
            {flights.map((_, i) => (
              <mesh key={i} position={[0, -1, 0]}>
                <octahedronGeometry args={[0.04]} />
                <meshBasicMaterial color="#ffd76a" transparent depthWrite={false} toneMapped={false} />
              </mesh>
            ))}
          </group>
        </group>
      )}
      {!still && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry args={[1.05, 1.3, 40]} />
          <meshBasicMaterial color="#e8b64a" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Html position={[slot[0], 1.1, slot[1]]} center zIndexRange={[40, 0]}>
        <div className={`built-label${still ? " still" : ""}`}>
          {BUILDINGS[type].icon} {BUILDINGS[type].label} built!
        </div>
      </Html>
    </>
  );
}

// ---------------------------------------------------------------- troops

// Zoomed in you see the squad itself; zoomed out, one big mascot. Both carry a banner with the head count.
function Army({ units, owner, count, fontReady, lifted, still }: { units: Units; owner: string; count: number; fontReady: boolean; lifted: boolean; still: boolean }) {
  const rig = useContext(RigContext)!;
  const { panda, armedPanda, nacam, cam } = units;
  const squad = useMemo(
    () => armyObject({ panda, armedPanda, nacam, cam }, owner, "squad", count),
    // Rebuilt once the badge font arrives, so the counts are drawn in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panda, armedPanda, nacam, cam, owner, count, fontReady],
  );
  const mascot = useMemo(
    () => armyObject({ panda, armedPanda, nacam, cam }, owner, "mascot", count),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panda, armedPanda, nacam, cam, owner, count, fontReady],
  );
  useEffect(() => () => disposeSprites(squad), [squad]);
  useEffect(() => () => disposeSprites(mascot), [mascot]);
  const near = useRef<Group>(null);
  const far = useRef<Group>(null);
  const holder = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const close = rig.lod.current === "squad";
    if (near.current) near.current.visible = close;
    if (far.current) far.current.visible = !close;
    // Picked up while you drag it.
    if (holder.current) {
      const want = lifted ? 0.25 + (still ? 0 : Math.sin(clock.elapsedTime * 6) * 0.03) : 0;
      holder.current.position.y += (want - holder.current.position.y) * (still ? 1 : 1 - Math.exp(-dt * 14));
    }
  });
  return (
    <group ref={holder}>
      <group ref={near}>
        <primitive object={squad} />
      </group>
      <group ref={far}>
        <primitive object={mascot} />
      </group>
    </group>
  );
}

function Flag({ owner }: { owner: string }) {
  const flag = useMemo(() => flagObject(owner), [owner]);
  return <primitive object={flag} />;
}

// ---------------------------------------------------------------- dragging troops

type DragState = { from: string; targets: string[]; over: string | null };

// Grab an army on your turn and drop it on a region it can reach by gondola. The globe stops spinning while you
// hold it, the regions it can reach glow, and a dotted arc follows your finger.
function useTroopDrag(movable: Map<string, string[]>, onDrop: (from: string, to: string) => void, hits: { readonly current: Map<string, Object3D> }) {
  const rig = useContext(RigContext)!;
  const { gl, camera, raycaster } = useThree();
  const [state, setState] = useState<DragState | null>(null);
  const pointer = useRef(new Vector2());
  const tip = useRef(new Vector3());
  const earthRef = useRef<Mesh>(null);
  const live = useRef<DragState | null>(null);

  const toNdc = useCallback(
    (x: number, y: number) => {
      const r = gl.domElement.getBoundingClientRect();
      pointer.current.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    },
    [gl],
  );

  const start = useCallback(
    (from: string, e: ThreeEvent<PointerEvent>) => {
      const targets = movable.get(from);
      if (!targets?.length) return;
      e.stopPropagation();
      rig.holdGlobe(true);
      toNdc(e.nativeEvent.clientX, e.nativeEvent.clientY);
      const s = { from, targets, over: null };
      live.current = s;
      setState(s);
      document.body.style.cursor = "grabbing";
    },
    [movable, rig, toNdc],
  );

  useEffect(() => {
    if (!state) return;
    const finish = (drop: boolean) => {
      const s = live.current;
      live.current = null;
      setState(null);
      rig.holdGlobe(false);
      document.body.style.cursor = "";
      if (drop && s?.over) onDrop(s.from, s.over);
    };
    const move = (ev: PointerEvent) => toNdc(ev.clientX, ev.clientY);
    const up = (ev: PointerEvent) => {
      toNdc(ev.clientX, ev.clientY);
      finish(true);
    };
    const cancel = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // Bound once per drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.from]);

  // Unmounting mid-drag (say, the turn ends) must hand the globe back.
  useEffect(() => () => rig.holdGlobe(false), [rig]);

  // Which region the pointer is over, and where the arc should end.
  useFrame(() => {
    const s = live.current;
    if (!s) return;
    raycaster.setFromCamera(pointer.current, camera);
    let over: string | null = null;
    for (const id of s.targets) {
      const m = hits.current.get(id);
      if (m && raycaster.intersectObject(m, false).length) over = id;
    }
    if (over) tip.current.copy(hexPoint(over, 0.08, [0, 0]));
    else if (earthRef.current) {
      const g = raycaster.intersectObject(earthRef.current, false)[0];
      if (g) tip.current.copy(g.point).multiplyScalar(1.012);
    }
    if (over !== s.over) {
      const next = { ...s, over };
      live.current = next;
      setState(next);
    }
  });

  return { state, start, tip, earthRef };
}

const DOTS = 22;
function DragArc({ from, over, tip, still }: { from: string; over: string | null; tip: { readonly current: Vector3 }; still: boolean }) {
  const group = useRef<Group>(null);
  const a = useMemo(() => hexPoint(from, 0.12, SLOTS.army), [from]);
  const [mid] = useState(() => new Vector3());
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const b = tip.current;
    const lift = 0.08 + a.distanceTo(b) * 0.3;
    mid.copy(a).add(b).multiplyScalar(0.5).normalize().multiplyScalar(RADIUS + lift + 0.05);
    g.children.forEach((m, i) => {
      const k = i / (DOTS - 1);
      const u = 1 - k;
      m.position.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(mid, 2 * u * k).addScaledVector(b, k * k);
      m.scale.setScalar(over ? 1.3 : 1 + (still ? 0 : Math.sin(clock.elapsedTime * 8 - i * 0.6) * 0.15));
    });
  });
  return (
    <group ref={group}>
      {[...Array(DOTS)].map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.014, 8, 6]} />
          <meshBasicMaterial color="#fffaf3" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- rings, pulses, gondolas

function TargetRing({ still }: { still: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(still ? 1 : 1 + Math.sin(clock.elapsedTime * 5) * 0.08);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, Math.PI / 6]} position={[0, 0.05, 0]}>
      <ringGeometry args={[TILE * 1.25, TILE * 1.42, 6]} />
      <meshBasicMaterial color="#fffaf3" transparent opacity={0.9} />
    </mesh>
  );
}

const TONES = { battle: "#d6363a", build: "#e8b64a", move: "#2b6fd6", info: "#fffaf3", hero: "#b566ff" };

function Pulse({ id, tone, still }: { id: string; tone: Highlight["tone"]; still: boolean }) {
  const { pos, q } = useSurface(id);
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const k = still ? 0.5 : (clock.elapsedTime * 1.2) % 1;
    ring.current.scale.setScalar(1 + k * 1.6);
    (ring.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - k);
  });
  return (
    <group position={pos} quaternion={q}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[TILE * 1.1, TILE * 1.35, 32]} />
        <meshBasicMaterial color={TONES[tone]} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

// An urban gondola: a cable arcing from one region's mast to the other's, with a cabin gliding along it.
function Gondola({ id, color, still }: { id: string; color: string; still: boolean }) {
  const curve = useMemo(() => {
    const [a, b] = lineEnds(id);
    const va = hexPoint(a, MAST_TOP, SLOTS.mast);
    const vb = hexPoint(b, MAST_TOP, SLOTS.mast);
    const lift = 0.05 + va.distanceTo(vb) * 0.1;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = va.length() + (vb.length() - va.length()) * t;
      pts.push(va.clone().lerp(vb, t).normalize().multiplyScalar(r + Math.sin(Math.PI * t) * lift));
    }
    return new CatmullRomCurve3(pts);
  }, [id]);
  const cabin = useRef<Group>(null);
  const phase = useMemo(() => (id.length * 0.137) % 1, [id]);
  useFrame(({ clock }) => {
    if (!cabin.current) return;
    const t = still ? 0.5 : (Math.sin(clock.elapsedTime * 0.5 + phase * 6.28) + 1) / 2;
    const p = curve.getPointAt(t);
    cabin.current.position.copy(p);
    cabin.current.quaternion.setFromUnitVectors(UP, p.clone().normalize());
  });
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 32, 0.006, 6, false]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <group ref={cabin}>
        <mesh position={[0, -0.03, 0]}>
          <boxGeometry args={[0.05, 0.04, 0.035]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
        </mesh>
      </group>
    </group>
  );
}
