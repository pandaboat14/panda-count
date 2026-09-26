"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Text } from "@react-three/drei";
import {
  CanvasTexture,
  CatmullRomCurve3,
  Matrix4,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PerspectiveCamera,
  type Sprite,
} from "three";
import { latLngToVector3, RADIUS } from "@/components/globe/geo";
import { makeEarthTexture } from "@/components/globe/textures";
import type { GameView, RegionView } from "@/game/engine";
import { lineEnds, REGION_BY_ID } from "@/game/regions";
import { HEROES, HERO_IDS, type UnitType } from "@/game/rules";
import { EMPTY_RIM, FOG_COLORS, NATIVE_COLORS, RESOURCE_COLORS } from "./colors";
import { drawFlag, FLAG_POLE_X, FLAG_SIZE, initialOf } from "./Flag";
import { Figure } from "./figures";

const FONT = "/fonts/bricolage-800.woff";
const UP = new Vector3(0, 1, 0);
const TILE = 0.2;
// Owner rims, in tile radii: yours is much thicker, and edged in white.
const RIM = 1.16;
const RIM_MINE = 1.36;

export type Highlight = { regions: string[]; tone: "battle" | "build" | "move" | "info" | "hero" };

// What tapping a ringed region does next: send troops from it, reinforce it, invade it, build a gondola to it, or strike it.
export type MarkKind = "source" | "move" | "attack" | "build" | "thunder";
// A name tag on the map. "named" is a conqueror's new name, shown to everyone.
export type BoardLabel = { id: string; text: string; tone?: MarkKind | "named" };

type Props = {
  view: GameView;
  selected: string | null;
  marks: Record<string, MarkKind>;
  labels: BoardLabel[];
  highlight: Highlight | null;
  focus: { lat: number; lng: number; seq: number } | null;
  still: boolean;
  onSelect: (id: string) => void;
  onReady: () => void;
};

// Memoised: switching panel tabs re-renders the game screen, but the globe only redraws when its own props change.
export default memo(function Board({ onReady, focus, still, ...props }: Props) {
  const start = useMemo(() => {
    const cap = props.view.players.find((p) => p.id === props.view.me)?.capital;
    const def = cap ? REGION_BY_ID.get(cap) : undefined;
    return latLngToVector3(def?.lat ?? 30, def?.lng ?? 100, RADIUS * 2.6);
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 40, position: start.toArray() }} onCreated={onReady} aria-label="Game board">
      <ambientLight intensity={1.6} />
      <directionalLight position={[8, 10, 6]} intensity={1.1} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={RADIUS * 1.25} maxDistance={RADIUS * 4} rotateSpeed={0.45} zoomSpeed={0.8} />
      <Fly focus={focus} still={still} />
      <World {...props} still={still} />
    </Canvas>
  );
});

function Fly({ focus, still }: { focus: Props["focus"]; still: boolean }) {
  const { camera, controls } = useThree();
  const target = useRef<Vector3 | null>(null);
  useEffect(() => {
    if (!focus) return;
    const dir = latLngToVector3(focus.lat, focus.lng, 1).normalize();
    if (still) {
      camera.position.copy(dir.multiplyScalar(camera.position.length()));
      (controls as { update?: () => void } | null)?.update?.();
    } else target.current = dir;
  }, [focus, still, camera, controls]);
  useFrame((_, dt) => {
    if (!target.current) return;
    const len = camera.position.length();
    const cur = camera.position.clone().normalize().lerp(target.current, 1 - Math.exp(-dt * 3.5)).normalize();
    camera.position.copy(cur.multiplyScalar(len));
    (camera as PerspectiveCamera).updateProjectionMatrix();
    (controls as { update?: () => void } | null)?.update?.();
    if (cur.angleTo(target.current) < 0.003) target.current = null;
  });
  return null;
}

function World({ view, selected, marks, labels, highlight, still, onSelect }: Omit<Props, "onReady" | "focus">) {
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
  // One flag per Kird, redrawn only when someone joins, leaves or changes colour.
  const flagSpec = JSON.stringify(view.players.map((p) => [p.id, p.color, p.id === view.me, initialOf(p.name)]));
  const flags = useMemo(() => {
    const out = new Map<string, CanvasTexture>();
    for (const [id, color, mine, initial] of JSON.parse(flagSpec) as [string, string, boolean, string][]) {
      const t = new CanvasTexture(drawFlag(color, mine, initial));
      t.colorSpace = SRGBColorSpace;
      out.set(id, t);
    }
    return out;
  }, [flagSpec]);
  useEffect(() => () => flags.forEach((t) => t.dispose()), [flags]);

  return (
    <group>
      <mesh onClick={(e) => e.stopPropagation()}>
        <sphereGeometry args={[RADIUS, 96, 64]} />
        <meshStandardMaterial map={earth} roughness={0.95} toneMapped={false} />
      </mesh>
      {view.lines.map((l) => (
        <Gondola key={l.id} id={l.id} color={colorOf.get(l.owner) ?? "#888"} still={still} />
      ))}
      {view.regions.map((r) => (
        <Tile
          key={r.id}
          region={r}
          ownerColor={r.owner ? colorOf.get(r.owner) ?? "#888" : null}
          mine={Boolean(r.owner) && r.owner === view.me}
          flag={r.owner ? flags.get(r.owner) : undefined}
          selected={selected === r.id}
          mark={marks[r.id]}
          heroes={heroesAt.get(r.id) ?? []}
          still={still}
          onSelect={onSelect}
        />
      ))}
      {highlight?.regions.map((id) => <Pulse key={`${id}-${highlight.tone}`} id={id} tone={highlight.tone} still={still} />)}
      {labels.map((l) => (
        <Label key={`${l.id}:${l.text}`} {...l} />
      ))}
    </group>
  );
}

// Stands a tile on the globe with its top (-z) facing north. The camera keeps north up, so every
// number token reads the right way up (a bare setFromUnitVectors leaves each tile twisted by its longitude).
function useSurface(id: string, lift = 0) {
  return useMemo(() => {
    const def = REGION_BY_ID.get(id)!;
    const pos = latLngToVector3(def.lat, def.lng, RADIUS + lift);
    const normal = pos.clone().normalize();
    const east = new Vector3().crossVectors(UP, normal).normalize();
    const south = new Vector3().crossVectors(east, normal);
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(east, normal, south));
    return { pos, q };
  }, [id, lift]);
}

// Flags and labels ignore depth so the globe's curve never clips them, which means they'd show through
// from the far side: this hides them whenever their spot faces away from the camera.
const toCamera = new Vector3();
function useFacing(at: Vector3, show: (visible: boolean) => void) {
  const normal = useMemo(() => at.clone().normalize(), [at]);
  useFrame(({ camera }) => show(toCamera.copy(camera.position).sub(at).normalize().dot(normal) > 0.03));
}

function useFacingElement(at: Vector3) {
  const el = useRef<HTMLDivElement>(null);
  const shown = useRef(true);
  useFacing(at, (visible) => {
    if (!el.current || shown.current === visible) return;
    shown.current = visible;
    el.current.style.visibility = visible ? "" : "hidden";
  });
  return el;
}

function Tile({
  region,
  ownerColor,
  mine,
  flag,
  selected,
  mark,
  heroes,
  still,
  onSelect,
}: {
  region: RegionView;
  ownerColor: string | null;
  mine: boolean;
  flag: CanvasTexture | undefined;
  selected: boolean;
  mark: MarkKind | undefined;
  heroes: string[];
  still: boolean;
  onSelect: (id: string) => void;
}) {
  const { pos, q } = useSurface(region.id);
  const def = REGION_BY_ID.get(region.id)!;
  const fog = region.fog;
  const color = fog ? FOG_COLORS.tile : RESOURCE_COLORS[def.resource];
  const rim = fog ? FOG_COLORS.rim : ownerColor ?? (region.native ? NATIVE_COLORS[region.native] : EMPTY_RIM);
  const rimSize = TILE * (mine ? RIM_MINE : RIM);
  const total = region.units ? region.units.panda + region.units.armedPanda + region.units.nacam + region.units.cam : 0;
  const hot = region.token === 6 || region.token === 8;

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
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
      scale={selected ? 1.25 : 1}
    >
      {/* owner rim: yours is thick, glowing and edged in white */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[rimSize, rimSize, 0.024, 6]} />
        <meshStandardMaterial
          color={rim}
          emissive={mine || selected ? rim : "#000"}
          emissiveIntensity={selected ? 0.55 : mine ? 0.4 : 0}
          transparent={fog}
          opacity={fog ? 0.7 : 1}
        />
      </mesh>
      {mine && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[rimSize, rimSize + TILE * 0.1, 6, 1, Math.PI / 6]} />
          <meshBasicMaterial color="#fffaf3" toneMapped={false} />
        </mesh>
      )}
      {/* resource hex */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[TILE, TILE, 0.03, 6]} />
        <meshStandardMaterial color={color} transparent={fog} opacity={fog ? 0.75 : 1} />
      </mesh>
      {/* number token */}
      <group position={[0, 0.05, 0]}>
        <mesh>
          <cylinderGeometry args={[TILE * 0.36, TILE * 0.36, 0.012, 20]} />
          <meshStandardMaterial color="#fbf3df" />
        </mesh>
        <Text font={FONT} fontSize={0.085} color={hot ? "#b3261e" : "#1c1b17"} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} anchorX="center" anchorY="middle">
          {String(region.token)}
        </Text>
      </group>
      {fog && (
        <mesh position={[0, 0.09, 0]}>
          <sphereGeometry args={[TILE * 0.7, 12, 8]} />
          <meshStandardMaterial color="#e7e9ec" transparent opacity={0.55} />
        </mesh>
      )}
      {!fog && total > 0 && <Army region={region} color={ownerColor ?? NATIVE_COLORS[region.native ?? "wild"]} total={total} />}
      {!fog && region.buildings && region.buildings.length > 0 && <Buildings list={region.buildings} />}
      {flag && !fog && <FlagPin texture={flag} mine={mine} at={pos} />}
      {mark && <TargetRing kind={mark} still={still} />}
      {heroes.length > 0 && <HeroIcons heroes={heroes} at={pos} />}
    </group>
  );
}

function dominant(r: RegionView): UnitType {
  const u = r.units!;
  return (["cam", "nacam", "armedPanda", "panda"] as UnitType[]).reduce((best, t) => (u[t] > u[best] ? t : best), "panda" as UnitType);
}

function Army({ region, color, total }: { region: RegionView; color: string; total: number }) {
  const kind = dominant(region);
  return (
    <group position={[TILE * 0.55, 0.06, TILE * 0.2]}>
      <Figure kind={kind} />
      <group position={[0.085, 0.16, 0]}>
        <mesh>
          <sphereGeometry args={[0.055, 14, 10]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <Text font={FONT} fontSize={0.06} color="#fffaf3" position={[0, 0, 0.056]} anchorX="center" anchorY="middle" outlineWidth={0.004} outlineColor="#1c1b17">
          {String(total)}
        </Text>
      </group>
    </group>
  );
}

const BUILDING_LOOK: Record<string, { color: string; shape: "cone" | "box" | "tower" }> = {
  sanctuary: { color: "#b3261e", shape: "cone" },
  gym: { color: "#e8b64a", shape: "box" },
  market: { color: "#2b6fd6", shape: "cone" },
  fort: { color: "#5d6b7a", shape: "tower" },
};

function Buildings({ list }: { list: string[] }) {
  return (
    <group position={[-TILE * 0.55, 0.05, -TILE * 0.1]}>
      {list.map((b, i) => {
        const look = BUILDING_LOOK[b];
        return (
          <mesh key={b} position={[(i % 2) * 0.07, look.shape === "tower" ? 0.05 : 0.03, Math.floor(i / 2) * 0.07]}>
            {look.shape === "cone" ? <coneGeometry args={[0.035, 0.07, 4]} /> : look.shape === "box" ? <boxGeometry args={[0.05, 0.05, 0.05]} /> : <cylinderGeometry args={[0.022, 0.028, 0.1, 8]} />}
            <meshStandardMaterial color={look.color} />
          </mesh>
        );
      })}
    </group>
  );
}

// The owner's flag, planted on the tile's north-west corner. It always faces the camera, so it reads
// just as well looking straight down at a region as it does side-on near the horizon. Yours are bigger.
function FlagPin({ texture, mine, at }: { texture: CanvasTexture; mine: boolean; at: Vector3 }) {
  const ref = useRef<Sprite>(null);
  useFacing(at, (visible) => {
    if (ref.current) ref.current.visible = visible;
  });
  const size = mine ? 0.34 : 0.22;
  return (
    <sprite ref={ref} position={[-TILE * 0.5, 0.03, -TILE * 0.55]} center={[FLAG_POLE_X / FLAG_SIZE, 0]} scale={[size, size, 1]} renderOrder={mine ? 12 : 11}>
      <spriteMaterial map={texture} transparent alphaTest={0.2} depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function HeroIcons({ heroes, at }: { heroes: string[]; at: Vector3 }) {
  const el = useFacingElement(at);
  return (
    <Html position={[0, 0.42, 0]} center zIndexRange={[30, 0]}>
      <div ref={el} className="board-heroes">{heroes.map((h) => HEROES[h as keyof typeof HEROES].icon).join("")}</div>
    </Html>
  );
}

// A name tag just south of the hex, clear of the number and the flag.
function Label({ id, text, tone }: BoardLabel) {
  const { pos, q } = useSurface(id);
  const at = useMemo(() => pos.clone().add(new Vector3(0, 0.02, TILE * 1.95).applyQuaternion(q)), [pos, q]);
  const el = useFacingElement(at);
  return (
    <Html position={at} center zIndexRange={[20, 0]} pointerEvents="none">
      <div ref={el} className={`board-label${tone ? ` ${tone}` : ""}`}>
        {text}
      </div>
    </Html>
  );
}

const MARK_LOOK: Record<MarkKind, { color: string; width: number; opacity: number; pulse: boolean }> = {
  source: { color: "#ffc53d", width: 0.22, opacity: 0.95, pulse: true }, // yours, with troops ready to go
  move: { color: "#3b8cff", width: 0.22, opacity: 0.95, pulse: true }, // yours: reinforce it
  attack: { color: "#ff4d4f", width: 0.22, opacity: 0.95, pulse: true }, // anyone else's: invade it
  build: { color: "#fffaf3", width: 0.08, opacity: 0.85, pulse: false }, // needs a gondola line first
  thunder: { color: "#b566ff", width: 0.22, opacity: 0.95, pulse: true },
};

// The hex's outline at radius r, lined up with the tile's corners.
const hexOutline = (r: number) =>
  Array.from({ length: 7 }, (_, i): [number, number, number] => [r * Math.sin((i * Math.PI) / 3), 0, r * Math.cos((i * Math.PI) / 3)]);
const BUILD_OUTLINE = hexOutline(TILE * 1.62);

function TargetRing({ kind, still }: { kind: MarkKind; still: boolean }) {
  const ref = useRef<Mesh>(null);
  const look = MARK_LOOK[kind];
  useFrame(({ clock }) => {
    if (ref.current && look.pulse && !still) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.06);
  });
  // Somewhere a gondola line would reach: a quiet dashed outline, like a road not yet built.
  if (kind === "build") {
    return <Line points={BUILD_OUTLINE} position={[0, 0.055, 0]} color={look.color} lineWidth={2.5} dashed dashSize={0.045} gapSize={0.03} transparent opacity={look.opacity} />;
  }
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]}>
      <ringGeometry args={[TILE * 1.58, TILE * (1.58 + look.width), 6, 1, Math.PI / 6]} />
      <meshBasicMaterial color={look.color} transparent opacity={look.opacity} depthWrite={false} toneMapped={false} />
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

// An urban gondola: a cable arcing between two regions, with a cabin gliding along it.
function Gondola({ id, color, still }: { id: string; color: string; still: boolean }) {
  const curve = useMemo(() => {
    const [a, b] = lineEnds(id).map((r) => REGION_BY_ID.get(r)!);
    const va = latLngToVector3(a.lat, a.lng, RADIUS + 0.06);
    const vb = latLngToVector3(b.lat, b.lng, RADIUS + 0.06);
    const pts: Vector3[] = [];
    const lift = 0.12 + va.distanceTo(vb) * 0.12;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const p = va.clone().lerp(vb, t).normalize().multiplyScalar(RADIUS + 0.06 + Math.sin(Math.PI * t) * lift);
      pts.push(p);
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
        <tubeGeometry args={[curve, 32, 0.008, 6, false]} />
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
