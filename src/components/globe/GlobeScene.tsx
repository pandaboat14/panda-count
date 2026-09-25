"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { BackSide, Quaternion, Vector3, type Group, type PerspectiveCamera } from "three";
import type { WildRange, WorldPlace } from "@/lib/types";
import { latLngToVector3, RADIUS } from "./geo";
import { makeEarthTexture, makeHeatTexture } from "./textures";

export type Selection = { type: "place"; id: number } | { type: "wild"; id: number };

type Props = {
  places: WorldPlace[];
  wild: WildRange[];
  still: boolean;
  // Spin to face this spot (e.g. a place picked from the list).
  focus: { lat: number; lng: number } | null;
  // Screen space (px) taken by overlays above and below; the globe is centred in what's left.
  frame: { top: number; bottom: number };
  onSelect: (s: Selection) => void;
  onReady: () => void;
};

const UP = new Vector3(0, 1, 0);
// Open looking at central China, where most pandas live.
const START = latLngToVector3(28, 104, RADIUS * 2.7);

export const COLORS = { china: "#a24a30", us: "#1f4b35", abroad: "#b3955c", incoming: "#e9b8a8" };

export function placeColor(p: WorldPlace) {
  if (p.us) return COLORS.us;
  if (p.count === 0) return COLORS.incoming;
  return p.country === "China" ? COLORS.china : COLORS.abroad;
}

export default function GlobeScene({ onReady, focus, frame, ...props }: Props) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 40, position: START.toArray() }} onCreated={onReady} aria-hidden="true">
      <ambientLight intensity={1.9} />
      <directionalLight position={[8, 6, 10]} intensity={0.9} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minDistance={RADIUS * 1.35}
        maxDistance={RADIUS * 9}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
      />
      <CameraRig focus={focus} frame={frame} still={props.still} />
      <Earth {...props} />
    </Canvas>
  );
}

// Keep the whole globe in frame on any screen shape, and glide to a focused place.
function CameraRig({ focus, frame, still }: { focus: Props["focus"]; frame: Props["frame"]; still: boolean }) {
  const { camera, size, controls } = useThree();
  const target = useRef<Vector3 | null>(null);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const avail = Math.max(120, size.height - frame.top - frame.bottom);
    const halfV = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * (avail / size.height));
    const halfH = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * (size.width / size.height) * 0.94);
    cam.position.setLength((RADIUS * 1.08) / Math.sin(Math.min(halfV, halfH)));
    // Shift the picture so the globe's centre lands in the middle of the free space.
    cam.setViewOffset(size.width, size.height, 0, -(frame.top - frame.bottom) / 2, size.width, size.height);
    cam.updateProjectionMatrix();
    (controls as { update?: () => void } | null)?.update?.();
  }, [camera, controls, size.width, size.height, frame.top, frame.bottom]);

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
    const cur = camera.position.clone().normalize();
    cur.lerp(target.current, 1 - Math.exp(-dt * 4)).normalize();
    camera.position.copy(cur.multiplyScalar(len));
    (controls as { update?: () => void } | null)?.update?.();
    if (cur.angleTo(target.current) < 0.002) target.current = null;
  });
  return null;
}

function Earth({ places, wild, still, onSelect }: Omit<Props, "onReady" | "focus" | "frame">) {
  const group = useRef<Group>(null);
  const earth = useMemo(() => makeEarthTexture(), []);
  const heat = useMemo(() => makeHeatTexture(wild), [wild]);
  useEffect(() => () => { earth.dispose(); heat.dispose(); }, [earth, heat]);

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[RADIUS, 96, 64]} />
        <meshStandardMaterial map={earth} roughness={0.9} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[RADIUS * 1.003, 96, 64]} />
        <meshBasicMaterial map={heat} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {/* soft cream halo so the globe sits in the page instead of floating in space */}
      <mesh scale={1.08}>
        <sphereGeometry args={[RADIUS, 48, 32]} />
        <meshBasicMaterial color="#fffaf3" side={BackSide} transparent opacity={0.35} />
      </mesh>

      {wild.map((r) => (
        <WildMarker key={r.id} range={r} onSelect={() => onSelect({ type: "wild", id: r.id })} />
      ))}
      {places.map((p) => (
        <Column key={p.id} place={p} still={still} onSelect={() => onSelect({ type: "place", id: p.id })} />
      ))}
    </group>
  );
}

function useSurfaceFrame(lat: number, lng: number) {
  return useMemo(() => {
    const pos = latLngToVector3(lat, lng);
    const q = new Quaternion().setFromUnitVectors(UP, pos.clone().normalize());
    return { pos, q };
  }, [lat, lng]);
}

function Label({ children, y }: { children: React.ReactNode; y: number }) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[20, 0]}>
      <div className="name-tag">{children}</div>
    </Html>
  );
}

function hoverHandlers(set: (v: boolean) => void) {
  return {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      set(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      set(false);
      document.body.style.cursor = "";
    },
  };
}

// A glowing column per place; height grows with the log of the count so Chengdu doesn't dwarf everything.
function Column({ place, still, onSelect }: { place: WorldPlace; still: boolean; onSelect: () => void }) {
  const { pos, q } = useSurfaceFrame(place.lat, place.lng);
  const [hovered, setHovered] = useState(false);
  const cap = useRef<Group>(null);
  const n = place.count || place.incoming;
  const h = 0.12 + 0.2 * Math.log2(1 + n);
  const color = placeColor(place);
  const phase = (place.lat + place.lng) * 0.1;

  useFrame(({ clock }) => {
    if (!cap.current) return;
    const pulse = still ? 1 : 1 + Math.sin(clock.elapsedTime * 2 + phase) * 0.12;
    cap.current.scale.setScalar((hovered ? 1.5 : 1) * pulse);
  });

  return (
    <group
      position={pos}
      quaternion={q}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      {...hoverHandlers(setHovered)}
    >
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.028, 0.04, h, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.6 : 0.25}
          transparent={place.count === 0}
          opacity={place.count === 0 ? 0.55 : 1}
        />
      </mesh>
      <group ref={cap} position={[0, h, 0]}>
        <mesh>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
        {hovered && (
          <mesh>
            <sphereGeometry args={[0.16, 16, 12]} />
            <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        )}
      </group>
      {/* generous invisible hit area so small columns are easy to tap */}
      <mesh position={[0, h / 2, 0]} visible={false}>
        <cylinderGeometry args={[0.2, 0.2, h + 0.3, 8]} />
        <meshBasicMaterial />
      </mesh>
      {hovered && (
        <Label y={h + 0.35}>
          {place.name} · {place.count ? place.count : `${place.incoming} coming`}
        </Label>
      )}
    </group>
  );
}

// Small ring at the heart of each wild range, so the heat glow can be tapped too.
function WildMarker({ range, onSelect }: { range: WildRange; onSelect: () => void }) {
  const { pos, q } = useSurfaceFrame(range.lat, range.lng);
  const [hovered, setHovered] = useState(false);
  return (
    <group position={pos} quaternion={q} onClick={(e) => { e.stopPropagation(); onSelect(); }} {...hoverHandlers(setHovered)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.05, hovered ? 0.1 : 0.075, 24]} />
        <meshBasicMaterial color="#fffaf3" transparent opacity={0.9} />
      </mesh>
      <mesh visible={false}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshBasicMaterial />
      </mesh>
      {hovered && <Label y={0.3}>{range.name} · ~{range.estimate} wild</Label>}
    </group>
  );
}
