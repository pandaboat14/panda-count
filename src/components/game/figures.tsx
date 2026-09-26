"use client";

import type { UnitType } from "@/game/rules";

// Tiny unit figures: a panda, an ugly ogre, or a golden CAM.
export function Figure({ kind }: { kind: UnitType }) {
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

