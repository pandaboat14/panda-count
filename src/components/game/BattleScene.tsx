"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Soldier } from "@/game/battleScript";
import { Figure } from "./figures";

type Props = { soldiers: Soldier[]; step: number; atkColor: string; defColor: string; still: boolean };

// Two armies face off across a patch of grass. Each step the attackers charge, and the fallen topple.
export default function BattleScene(props: Props) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [0, 2.4, 4.2] }} aria-hidden="true">
      <ambientLight intensity={1.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      <group rotation={[0, 0, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[2.6, 48]} />
          <meshStandardMaterial color="#8fb577" />
        </mesh>
        <Army {...props} side="atk" />
        <Army {...props} side="def" />
      </group>
    </Canvas>
  );
}

function Army({ soldiers, step, atkColor, defColor, still, side }: Props & { side: "atk" | "def" }) {
  const group = useRef<Group>(null);
  const troops = useMemo(() => soldiers.filter((s) => s.side === side), [soldiers, side]);
  const dir = side === "atk" ? -1 : 1;
  const startAt = useRef(0);
  const lastStep = useRef(step);
  useFrame(({ clock }) => {
    if (!group.current) return;
    if (lastStep.current !== step) {
      lastStep.current = step;
      startAt.current = clock.elapsedTime;
    }
    // Attackers lunge forward at the start of each round; defenders brace.
    const t = clock.elapsedTime - startAt.current;
    const lunge = still ? 0 : Math.max(0, Math.sin(Math.min(t, 0.6) * (Math.PI / 0.6))) * (side === "atk" ? 0.35 : 0.08);
    group.current.position.x = -dir * lunge;
  });
  const cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(troops.length * 1.6))));
  return (
    <group ref={group}>
      {troops.slice(0, 36).map((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = dir * (0.45 + row * 0.32);
        const z = (col - (cols - 1) / 2) * 0.3;
        return <Trooper key={s.id} soldier={s} x={x} z={z} facing={dir} step={step} color={side === "atk" ? atkColor : defColor} still={still} />;
      })}
    </group>
  );
}

function Trooper({ soldier, x, z, facing, step, color, still }: { soldier: Soldier; x: number; z: number; facing: number; step: number; color: string; still: boolean }) {
  const ref = useRef<Group>(null);
  const dead = soldier.diesAt !== null && soldier.diesAt < step;
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = dead ? facing * (Math.PI / 2) : 0;
    const k = still ? 1 : 1 - Math.exp(-dt * 8);
    ref.current.rotation.z += (target - ref.current.rotation.z) * k;
    ref.current.position.y += ((dead ? -0.03 : 0) - ref.current.position.y) * k;
  });
  return (
    <group position={[x, 0, z]} rotation={[0, facing > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <group ref={ref} scale={2.2}>
        <Figure kind={soldier.type} />
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    </group>
  );
}
