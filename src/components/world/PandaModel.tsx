"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";

const WHITE = "#fdf8ef";
const BLACK = "#1c1b17";

type Props = {
  seed: number;
  name: string;
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  still: boolean;
  onSelect: () => void;
};

// A sitting giant panda built from spheres; `seed` varies the pose so no two look the same.
export function PandaModel({ seed, name, position, rotationY = 0, scale = 1, still, onSelect }: Props) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const tilt = [0.12, -0.1, 0.18, -0.16, 0.06, -0.04][seed % 6];
  const phase = seed * 1.7;

  useFrame(({ clock }, dt) => {
    if (!root.current || !head.current) return;
    const t = clock.elapsedTime + phase;
    const lift = hovered ? 0.18 : 0;
    root.current.position.y += ((still ? 0 : Math.max(0, Math.sin(t * 2.2)) * 0.03) + lift - root.current.position.y) * Math.min(1, dt * 10);
    head.current.rotation.z = tilt + (still ? 0 : Math.sin(t * 0.9) * 0.08) + (hovered ? Math.sin(t * 14) * 0.12 : 0);
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <group
        ref={root}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ""; }}
      >
        {/* body + black shoulder band */}
        <mesh position={[0, 0.45, 0]} scale={[1, 1.08, 0.95]} castShadow>
          <sphereGeometry args={[0.42, 32, 24]} />
          <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.7, 0]} scale={[1.02, 0.42, 0.98]} castShadow>
          <sphereGeometry args={[0.42, 32, 16]} />
          <meshStandardMaterial color={BLACK} roughness={0.9} />
        </mesh>
        {/* arms hugging forward */}
        {[-1, 1].map((s) => (
          <mesh key={`arm${s}`} position={[0.3 * s, 0.5, 0.2]} rotation={[0.9, 0, -0.5 * s]} castShadow>
            <capsuleGeometry args={[0.11, 0.3, 6, 12]} />
            <meshStandardMaterial color={BLACK} roughness={0.9} />
          </mesh>
        ))}
        {/* legs sticking out front */}
        {[-1, 1].map((s) => (
          <mesh key={`leg${s}`} position={[0.22 * s, 0.14, 0.32]} rotation={[1.4, 0, 0.2 * s]} castShadow>
            <capsuleGeometry args={[0.13, 0.16, 6, 12]} />
            <meshStandardMaterial color={BLACK} roughness={0.9} />
          </mesh>
        ))}
        {/* head */}
        <group ref={head} position={[0, 1.05, 0.04]}>
          <mesh castShadow>
            <sphereGeometry args={[0.33, 32, 24]} />
            <meshStandardMaterial color={WHITE} roughness={0.85} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={`face${s}`}>
              <mesh position={[0.23 * s, 0.24, -0.02]} castShadow>
                <sphereGeometry args={[0.11, 16, 12]} />
                <meshStandardMaterial color={BLACK} roughness={0.9} />
              </mesh>
              <mesh position={[0.12 * s, 0.03, 0.27]} rotation={[0, 0, 0.5 * s]} scale={[0.75, 1.15, 0.5]}>
                <sphereGeometry args={[0.09, 16, 12]} />
                <meshStandardMaterial color={BLACK} roughness={0.9} />
              </mesh>
              <mesh position={[0.115 * s, 0.05, 0.315]}>
                <sphereGeometry args={[0.025, 10, 8]} />
                <meshStandardMaterial color={WHITE} roughness={0.3} />
              </mesh>
              <mesh position={[0.17 * s, -0.08, 0.27]} scale={[1, 0.6, 0.4]}>
                <sphereGeometry args={[0.05, 12, 8]} />
                <meshStandardMaterial color="#e9b8a8" roughness={1} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.09, 0.24]} scale={[1, 0.78, 0.9]}>
            <sphereGeometry args={[0.13, 20, 16]} />
            <meshStandardMaterial color={WHITE} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.05, 0.36]} scale={[1.2, 0.8, 0.8]}>
            <sphereGeometry args={[0.045, 12, 10]} />
            <meshStandardMaterial color={BLACK} roughness={0.5} />
          </mesh>
        </group>
        {hovered && (
          <Html position={[0, 1.7, 0]} center>
            <div className="name-tag">{name}</div>
          </Html>
        )}
      </group>
    </group>
  );
}
