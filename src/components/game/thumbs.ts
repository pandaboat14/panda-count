// Little pictures of each building for the Build steps, drawn once with the same 3D models as the board.
import { ACESFilmicToneMapping, AmbientLight, CylinderGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { BUILDING_TYPES, type BuildingType } from "@/game/rules";
import { blobShadow, buildingBody } from "./models";

const GROUND: Record<BuildingType, string> = { sanctuary: "#5f9a4a", gym: "#9b6fc7", market: "#e2cf8a", fort: "#9a968c" };
const cache = new Map<string, Promise<Record<BuildingType, string>>>();

export function buildingThumbs(owner: string) {
  let p = cache.get(owner);
  if (!p) {
    p = new Promise((resolve, reject) => {
      try {
        resolve(draw(owner));
      } catch (e) {
        reject(e);
      }
    });
    cache.set(owner, p);
  }
  return p;
}

function draw(owner: string) {
  const r = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(192, 192);
  r.toneMapping = ACESFilmicToneMapping;
  const cam = new PerspectiveCamera(30, 1, 0.01, 50);
  const scene = new Scene();
  scene.add(new AmbientLight("#fffaf3", 1.35));
  const sun = new DirectionalLight("#fff3df", 2.1);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const out = {} as Record<BuildingType, string>;
  for (const type of BUILDING_TYPES) {
    const walls = type === "fort";
    const g = new Group();
    const hex = new Mesh(new CylinderGeometry(1, 1, 0.12, 6), new MeshStandardMaterial({ color: GROUND[type] }));
    hex.position.y = -0.06;
    hex.scale.set(walls ? 1 : 0.62, 1, walls ? 1 : 0.62);
    g.add(hex, buildingBody(type, owner));
    if (!walls) g.add(blobShadow(0.3, 0.26));
    scene.add(g);
    const [ty, dist] = walls ? [0.16, 2.8] : [0.24, 1.4];
    cam.position.set(dist * 0.45, ty + dist * 0.62, dist * 0.8);
    cam.lookAt(0, ty, 0);
    r.render(scene, cam);
    out[type] = r.domElement.toDataURL("image/png");
    scene.remove(g);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
