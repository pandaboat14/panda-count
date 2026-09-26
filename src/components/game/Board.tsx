"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Text } from "@react-three/drei";
import { CatmullRomCurve3, Quaternion, Vector3, type Group, type Mesh, type MeshBasicMaterial, type PerspectiveCamera } from "three";
import { latLngToVector3, RADIUS } from "@/components/globe/geo";
import { makeEarthTexture } from "@/components/globe/textures";
import type { GameView, RegionView } from "@/game/engine";
import { lineEnds, REGION_BY_ID, type Resource } from "@/game/regions";
import { HEROES, HERO_IDS, type UnitType } from "@/game/rules";

const FONT = "/fonts/bricolage-800.woff";
const UP = new Vector3(0, 1, 0);
const TILE = 0.2;

export const RESOURCE_COLORS: Record<Resource, string> = {
  bamboo: "#5f9a4a",
  stone: "#9a968c",
  iron: "#5d6b7a",
  rice: "#e2cf8a",
  gems: "#9b6fc7",
};
export const NATIVE_COLORS = { pandas: "#f7f4ec", nacams: "#6f8a3a", cams: "#e8b64a", wild: "#c9d6bf" } as const;

export type Highlight = { regions: string[]; tone: "battle" | "build" | "move" | "info" | "hero" };

type Props = {
  view: GameView;
  selected: string | null;
  targets: string[]; // regions you can click to complete the current action
  highlight: Highlight | null;
  focus: { lat: number; lng: number; seq: number } | null;
  still: boolean;
  onSelect: (id: string) => void;
  onReady: () => void;
};

export default function Board({ onReady, focus, still, ...props }: Props) {
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
}

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

function World({ view, selected, targets, highlight, still, onSelect }: Omit<Props, "onReady" | "focus">) {
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
  const targetSet = useMemo(() => new Set(targets), [targets]);

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
          selected={selected === r.id}
          target={targetSet.has(r.id)}
          heroes={heroesAt.get(r.id) ?? []}
          onSelect={onSelect}
        />
      ))}
      {highlight?.regions.map((id) => <Pulse key={`${id}-${highlight.tone}`} id={id} tone={highlight.tone} still={still} />)}
    </group>
  );
}

function useSurface(id: string, lift = 0) {
  return useMemo(() => {
    const def = REGION_BY_ID.get(id)!;
    const pos = latLngToVector3(def.lat, def.lng, RADIUS + lift);
    const q = new Quaternion().setFromUnitVectors(UP, pos.clone().normalize());
    return { pos, q };
  }, [id, lift]);
}

function Tile({
  region,
  ownerColor,
  selected,
  target,
  heroes,
  onSelect,
}: {
  region: RegionView;
  ownerColor: string | null;
  selected: boolean;
  target: boolean;
  heroes: string[];
  onSelect: (id: string) => void;
}) {
  const { pos, q } = useSurface(region.id);
  const def = REGION_BY_ID.get(region.id)!;
  const fog = region.fog;
  const color = fog ? "#8c939b" : RESOURCE_COLORS[def.resource];
  const rim = fog ? "#6e757d" : ownerColor ?? (region.native ? NATIVE_COLORS[region.native] : "#d9d2bf");
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
      {/* owner rim */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[TILE * 1.14, TILE * 1.14, 0.024, 6]} />
        <meshStandardMaterial color={rim} emissive={selected || target ? rim : "#000"} emissiveIntensity={selected ? 0.5 : target ? 0.35 : 0} transparent={fog} opacity={fog ? 0.7 : 1} />
      </mesh>
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
      {ownerColor && !fog && <Flag color={ownerColor} />}
      {target && <TargetRing />}
      {heroes.length > 0 && (
        <Html position={[0, 0.42, 0]} center zIndexRange={[30, 0]}>
          <div className="board-heroes">{heroes.map((h) => HEROES[h as keyof typeof HEROES].icon).join("")}</div>
        </Html>
      )}
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

// Tiny unit figures: a panda, an ugly ogre, or a golden CAM.
function Figure({ kind }: { kind: UnitType }) {
  if (kind === "nacam") {
    return (
      <group scale={0.7}>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.1, 0.12, 0.08]} />
          <meshStandardMaterial color="#6f8a3a" roughness={1} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[0.08, 0.07, 0.07]} />
          <meshStandardMaterial color="#7f9a46" roughness={1} />
        </mesh>
        <mesh position={[0.02, 0.2, 0.03]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[0.012, 0.035, 6]} />
          <meshStandardMaterial color="#fffaf3" />
        </mesh>
      </group>
    );
  }
  if (kind === "cam") {
    return (
      <group scale={0.7}>
        <mesh position={[0, 0.08, 0]}>
          <capsuleGeometry args={[0.035, 0.08, 6, 10]} />
          <meshStandardMaterial color="#e8b64a" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.13, 0.03, 0.04]} />
          <meshStandardMaterial color="#e8b64a" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <sphereGeometry args={[0.03, 12, 10]} />
          <meshStandardMaterial color="#f0c870" metalness={0.4} roughness={0.35} />
        </mesh>
      </group>
    );
  }
  return (
    <group scale={0.7}>
      <mesh position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.05, 14, 10]} />
        <meshStandardMaterial color="#fdf8ef" />
      </mesh>
      <mesh position={[0, 0.07, 0]} scale={[1.05, 0.45, 1.02]}>
        <sphereGeometry args={[0.05, 14, 8]} />
        <meshStandardMaterial color="#1c1b17" />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <sphereGeometry args={[0.038, 14, 10]} />
        <meshStandardMaterial color="#fdf8ef" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.028 * s, 0.163, 0]}>
          <sphereGeometry args={[0.013, 8, 6]} />
          <meshStandardMaterial color="#1c1b17" />
        </mesh>
      ))}
      {kind === "armedPanda" && (
        <mesh position={[0.05, 0.1, 0]} rotation={[0, 0, -0.2]}>
          <cylinderGeometry args={[0.005, 0.005, 0.16, 6]} />
          <meshStandardMaterial color="#8a6a3a" />
        </mesh>
      )}
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

function Flag({ color }: { color: string }) {
  return (
    <group position={[-TILE * 0.2, 0.05, TILE * 0.6]}>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.18, 6]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[0.035, 0.155, 0]}>
        <boxGeometry args={[0.07, 0.045, 0.005]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function TargetRing() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.08);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
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
