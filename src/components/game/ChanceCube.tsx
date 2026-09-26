"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { CanvasTexture, Quaternion, SRGBColorSpace, Vector3, type Group, type Mesh } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// The chance cube from The Phantom Menace, as a six-sided die: "Blue, it's odd. Red, it's even."
// Box faces, in three.js material order (+x, -x, +y, -y, +z, -z), carry these values (opposites add to 7).
const FACE_VALUES = [3, 4, 2, 5, 1, 6];
const FACE_NORMALS = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

function faceTexture(value: number) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const odd = value % 2 === 1;
  const grad = g.createRadialGradient(size * 0.35, size * 0.3, 10, size / 2, size / 2, size * 0.75);
  grad.addColorStop(0, odd ? "#5aa0ff" : "#ff6a5a");
  grad.addColorStop(1, odd ? "#123f9e" : "#8e1410");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // A thin engraved border, like the prop's inlaid edges.
  g.strokeStyle = "rgba(255, 226, 150, .55)";
  g.lineWidth = 8;
  g.strokeRect(14, 14, size - 28, size - 28);
  for (const [x, y] of PIPS[value]) {
    g.beginPath();
    g.arc(x * size, y * size, size * 0.075, 0, Math.PI * 2);
    g.fillStyle = "#ffd36b";
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = 8;
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// The rotation that turns the face showing `value` toward the camera (+z), with a little twist.
function restingRotation(value: number, twist: number) {
  const i = FACE_VALUES.indexOf(value);
  const q = new Quaternion().setFromUnitVectors(FACE_NORMALS[i], new Vector3(0, 0, 1));
  return new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), twist).multiply(q);
}

const ROLL_S = 1.7;

function Cube({ value, x, delay, still, onLanded }: { value: number; x: number; delay: number; still: boolean; onLanded?: () => void }) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const textures = useMemo(() => FACE_VALUES.map(faceTexture), []);
  // A rounded box that keeps one material group per face (so each face gets its own pips).
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, 0.12), []);
  useEffect(
    () => () => {
      textures.forEach((t) => t.dispose());
      geometry.dispose();
    },
    [textures, geometry],
  );
  // The tumble is worked out from the roll itself: varied from roll to roll, identical on a replay.
  const seed = value * 7 + (x > 0 ? 3 : 0);
  const target = useMemo(() => restingRotation(value, ((seed % 5) - 2) * 0.12), [value, seed]);
  const spinAxis = useMemo(() => new Vector3(Math.sin(seed * 1.7), Math.cos(seed * 2.3), Math.sin(seed * 0.9) + 0.4).normalize(), [seed]);
  const start = useRef<number | null>(null);
  const landed = useRef(false);

  useFrame(({ clock }) => {
    if (!group.current || !mesh.current) return;
    if (start.current === null) start.current = clock.elapsedTime + delay;
    const t = still ? ROLL_S : Math.max(0, clock.elapsedTime - start.current);
    const k = Math.min(1, t / ROLL_S);
    // Falls in, bounces twice, settles.
    const bounce = Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) ** 2;
    group.current.position.set(x, 0.1 + bounce * 1.6, 0);
    // Tumbles fast, slowing down, then eases onto the rolled face.
    const tumble = new Quaternion().setFromAxisAngle(spinAxis, (1 - k) ** 2 * 14);
    mesh.current.quaternion.copy(target).multiply(tumble);
    if (k >= 1 && !landed.current) {
      landed.current = true;
      mesh.current.quaternion.copy(target);
      onLanded?.();
    }
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} geometry={geometry}>
        {textures.map((map, i) => (
          <meshPhysicalMaterial key={i} attach={`material-${i}`} map={map} roughness={0.18} clearcoat={1} clearcoatRoughness={0.1} />
        ))}
      </mesh>
    </group>
  );
}

export default function ChanceCubes({ roll, still, onLanded }: { roll: [number, number]; still: boolean; onLanded: () => void }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [0, 0.6, 6] }} aria-hidden="true">
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <pointLight position={[-3, 2, 3]} intensity={12} color="#ffe6a8" />
      <Cube value={roll[0]} x={-0.8} delay={0} still={still} />
      <Cube value={roll[1]} x={0.8} delay={0.12} still={still} onLanded={onLanded} />
    </Canvas>
  );
}
