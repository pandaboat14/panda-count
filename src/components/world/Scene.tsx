"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Text } from "@react-three/drei";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Panda } from "@/lib/types";
import { PandaModel } from "./PandaModel";

const FONT = "/fonts/bricolage-800.woff";
const SPACING = 4.6;

type ZooGroup = { name: string; location: string; url: string | null; residents: Panda[]; incoming: Panda[] };

type Props = {
  pandas: Panda[];
  count: number;
  still: boolean;
  onSelect: (id: number) => void;
};

type SceneProps = Props & { onReady: () => void };

export default function Scene({ onReady, ...props }: SceneProps) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, position: [0, 7, 18] }} onCreated={onReady} aria-hidden="true">
      <hemisphereLight args={["#fffaf3", "#7fa66a", 1.1]} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <World {...props} />
    </Canvas>
  );
}

type Layout = {
  islands: [number, number, number][];
  headline: [number, number, number];
  target: [number, number, number];
  // Direction from target to camera, and the half-width/half-depth that must stay in view.
  view: [number, number, number];
  halfWidth: number;
  halfHeight: number;
};

// Wide screens get a row of islands; tall phones get a zigzag column receding into the distance.
function layout(n: number, portrait: boolean): Layout {
  if (!portrait) {
    const islands = Array.from({ length: n }, (_, i): [number, number, number] => {
      const x = (i - (n - 1) / 2) * SPACING;
      return [x, 0, -0.07 * x * x];
    });
    return {
      islands,
      headline: [0, 3.9, -5],
      target: [0, 2.7, 0],
      view: [0, 0.38, 1],
      halfWidth: ((n - 1) * SPACING) / 2 + 3,
      halfHeight: 5.5,
    };
  }
  const islands = Array.from({ length: n }, (_, i): [number, number, number] => [
    n === 1 ? 0 : i % 2 ? 1.3 : -1.3,
    0,
    2 - i * 4.2,
  ]);
  const back = 2 - (n - 1) * 4.2;
  return {
    islands,
    headline: [0, 3.6, back - 3.5],
    target: [0, 1.8, (2 + back) / 2 - 0.5],
    view: [0, 0.9, 1],
    halfWidth: 4,
    halfHeight: 4 + n * 1.8,
  };
}

function World({ pandas, count, still, onSelect }: Props) {
  const zoos = useMemo(() => {
    const byName = new Map<string, ZooGroup>();
    for (const p of pandas) {
      if (!byName.has(p.zoo)) byName.set(p.zoo, { name: p.zoo, location: p.location, url: p.zooUrl, residents: [], incoming: [] });
      byName.get(p.zoo)![p.status === "resident" ? "residents" : "incoming"].push(p);
    }
    return [...byName.values()];
  }, [pandas]);

  const size = useThree((s) => s.size);
  const portrait = size.width / size.height < 0.8;
  const plan = useMemo(() => layout(zoos.length, portrait), [zoos.length, portrait]);

  // drei <Html> can drop the first portal's content when it mounts in the Canvas's first commit.
  const [labels, setLabels] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLabels(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      <CameraRig plan={plan} />
      <OrbitControls
        makeDefault
        target={plan.target}
        enablePan={false}
        enableDamping
        minDistance={8}
        maxDistance={60}
        minPolarAngle={0.5}
        maxPolarAngle={1.42}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
      />
      <Suspense fallback={null}>
        <Headline count={count} still={still} position={plan.headline} width={plan.halfWidth * 2 - 1} />
      </Suspense>
      <Water />
      {zoos.map((zoo, i) => (
        <ZooIsland
          key={zoo.name}
          zoo={zoo}
          position={plan.islands[i]}
          pandas={pandas}
          still={still}
          labels={labels}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// Back the camera off until the whole layout fits, and pull the fog along with it.
function CameraRig({ plan }: { plan: Layout }) {
  const { camera, size, controls } = useThree();
  const dist = useMemo(() => {
    const vfov = (38 * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / size.height));
    return Math.max(14, plan.halfWidth / Math.tan(hfov / 2), plan.halfHeight / Math.tan(vfov / 2));
  }, [size.width, size.height, plan]);

  useEffect(() => {
    const [dx, dy, dz] = plan.view;
    const len = Math.hypot(dx, dy, dz);
    const [tx, ty, tz] = plan.target;
    camera.position.set(tx + (dx / len) * dist, ty + (dy / len) * dist, tz + (dz / len) * dist);
    camera.lookAt(tx, ty, tz);
    (controls as OrbitControlsImpl | null)?.update();
  }, [camera, controls, plan, dist]);

  return <fog attach="fog" args={["#fdf2e0", dist + 2, dist + 30]} />;
}

type HeadlineProps = { count: number; still: boolean; position: [number, number, number]; width: number };

function Headline({ count, still, position, width }: HeadlineProps) {
  const [shown, setShown] = useState(still ? count : 0);
  const start = useRef<number | null>(null);
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (group.current && !still) group.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.8) * 0.12;
    if (still) {
      if (shown !== count) setShown(count);
      return;
    }
    start.current ??= clock.elapsedTime;
    const k = Math.min(1, (clock.elapsedTime - start.current) / 1.4);
    const n = Math.round(count * (1 - Math.pow(1 - k, 3)));
    if (n !== shown) setShown(n);
  });

  // Stacked copies fake an extruded, chunky numeral like the old CSS text-shadow.
  const depth = 10;
  return (
    <group ref={group} position={position}>
      <Text
        font={FONT}
        fontSize={0.8}
        letterSpacing={0.04}
        maxWidth={width}
        textAlign="center"
        position={[0, 2.2, 0]}
        color="#1f4b35"
        anchorY="bottom"
      >
        GIANT PANDAS IN AMERICA
      </Text>
      {Array.from({ length: depth }, (_, k) => (
        <Text
          key={k}
          font={FONT}
          fontSize={4.6}
          position={[0.018 * (k + 1), -0.018 * (k + 1), -0.03 * (k + 1)]}
          color={k === depth - 1 ? "#b3955c" : "#dcc79c"}
          anchorY="middle"
        >
          {String(shown)}
        </Text>
      ))}
      <Text font={FONT} fontSize={4.6} color="#1c1b17" anchorY="middle">
        {String(shown)}
      </Text>
    </group>
  );
}

function Water() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <circleGeometry args={[60, 64]} />
      <meshStandardMaterial color="#6fa592" roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

function Ripple({ radius, delay, still }: { radius: number; delay: number; still: boolean }) {
  const mesh = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const k = still ? 0.3 : ((clock.elapsedTime + delay) % 4) / 4;
    mesh.current.scale.setScalar(1 + k * 0.5);
    (mesh.current.material as MeshStandardMaterial).opacity = 0.5 * (1 - k);
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[radius, radius + 0.06, 64]} />
      <meshStandardMaterial color="#fffaf3" transparent opacity={0.5} />
    </mesh>
  );
}

function Bamboo({ position, height, lean }: { position: [number, number, number]; height: number; lean: number }) {
  const segments = Math.round(height / 0.55);
  return (
    <group position={position} rotation={[0, 0, lean]}>
      {Array.from({ length: segments }, (_, k) => (
        <group key={k} position={[0, 0.275 + k * 0.55, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.07, 0.08, 0.52, 10]} />
            <meshStandardMaterial color={k % 2 ? "#5b8a4a" : "#628f4f"} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.04, 10]} />
            <meshStandardMaterial color="#3f6b35" />
          </mesh>
        </group>
      ))}
      {[0.6, 2.1, 4].map((r, k) => (
        <mesh key={k} position={[0.18 * Math.cos(r), height - 0.2 - k * 0.35, 0.18 * Math.sin(r)]} rotation={[0.3, r, 1.1]} scale={[1, 0.15, 0.35]} castShadow>
          <sphereGeometry args={[0.3, 10, 6]} />
          <meshStandardMaterial color="#7fa66a" />
        </mesh>
      ))}
    </group>
  );
}

function Canoe({ children, position, still }: { children: React.ReactNode; position: [number, number, number]; still: boolean }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current || still) return;
    const t = clock.elapsedTime;
    group.current.position.y = position[1] + Math.sin(t * 1.6) * 0.05;
    group.current.rotation.z = Math.sin(t * 1.1) * 0.05;
    group.current.position.x = position[0] + Math.sin(t * 0.3) * 0.3;
  });
  return (
    <group ref={group} position={position}>
      <mesh scale={[1.9, 0.45, 0.6]} castShadow>
        <sphereGeometry args={[1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#2f6b47" roughness={0.6} side={2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.9, 0.6, 1]} position={[0, 0.001, 0]}>
        <circleGeometry args={[0.97, 32]} />
        <meshStandardMaterial color="#b3955c" roughness={0.8} />
      </mesh>
      <group position={[1.1, 0.5, 0.55]} rotation={[0.5, 0, -0.9]}>
        <mesh>
          <cylinderGeometry args={[0.03, 0.03, 1.6, 8]} />
          <meshStandardMaterial color="#8a6a3a" />
        </mesh>
        <mesh position={[0, -0.85, 0]} scale={[0.18, 0.4, 0.03]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#8a6a3a" />
        </mesh>
      </group>
      {children}
    </group>
  );
}

type IslandProps = {
  zoo: ZooGroup;
  position: [number, number, number];
  pandas: Panda[];
  still: boolean;
  labels: boolean;
  onSelect: (id: number) => void;
};

function ZooIsland({ zoo, position, pandas, still, labels, onSelect }: IslandProps) {
  const radius = 1.35 + 0.25 * Math.max(zoo.residents.length, 1);
  const soon = zoo.residents.length === 0;
  const stalks = useMemo(
    () =>
      [-2.2, -1.5, -0.9, 0.4, 1.3, 2.1].map((a, k) => ({
        position: [Math.sin(a) * radius * 0.82, 0.3, -Math.cos(a) * radius * 0.82] as [number, number, number],
        height: 2.4 + ((k * 7) % 5) * 0.35,
        lean: (k % 2 ? 1 : -1) * 0.06,
      })),
    [radius],
  );

  return (
    <group position={position} rotation={[0, -position[0] * 0.05, 0]}>
      <mesh position={[0, -0.25, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[radius * 0.96, radius * 1.08, 0.6, 48]} />
        <meshStandardMaterial color="#b3955c" roughness={1} />
      </mesh>
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.06, 48]} />
        <meshStandardMaterial color="#8fb577" roughness={1} />
      </mesh>
      {[0, 1.3, 2.6].map((d) => (
        <Ripple key={d} radius={radius * 1.1} delay={d} still={still} />
      ))}
      {stalks.map((s, k) => (
        <Bamboo key={k} {...s} />
      ))}

      {zoo.residents.map((p, k) => {
        const n = zoo.residents.length;
        const x = (k - (n - 1) / 2) * 0.95;
        return (
          <PandaModel
            key={p.id}
            seed={pandas.indexOf(p)}
            name={p.name}
            position={[x, 0.1, 0.25 - Math.abs(x) * 0.15]}
            rotationY={-x * 0.25}
            still={still}
            onSelect={() => onSelect(p.id)}
          />
        );
      })}

      {zoo.incoming.length > 0 && (
        <Canoe position={[soon ? 0 : 0.6, 0.1, radius + 1.1]} still={still}>
          {zoo.incoming.map((p, k) => (
            <PandaModel
              key={p.id}
              seed={pandas.indexOf(p)}
              name={`${p.name} (arriving soon)`}
              position={[(k - (zoo.incoming.length - 1) / 2) * 0.95, -0.25, 0]}
              scale={0.72}
              still={still}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </Canoe>
      )}

      {labels && <Html position={[0, 3.6, -0.4]} center zIndexRange={[20, 0]}>
        <div className={`zoo-label${soon ? " soon" : ""}`}>
          {zoo.url ? (
            <a href={zoo.url} target="_blank" rel="noopener noreferrer">{zoo.name} ↗</a>
          ) : (
            zoo.name
          )}
          <span className="city">
            {zoo.location} · {soon ? `${zoo.incoming.length} arriving soon` : `${zoo.residents.length} panda${zoo.residents.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </Html>}
    </group>
  );
}
