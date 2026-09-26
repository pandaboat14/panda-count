import * as THREE from './lib/node_modules/three/build/three.module.js';
import * as CANNON from './lib/node_modules/cannon-es/dist/cannon-es.js';
import fs from 'fs';
const src = fs.readFileSync(new URL('./shared/dice.js', import.meta.url), 'utf8');
const Dice = new Function('THREE', 'CANNON', src + '\nreturn Dice;')(THREE, CANNON);
const env = { bounds: { minX: -5, maxX: 5, minZ: -3.2, maxZ: 3.2 }, surface: 'felt' };
let ok = 0;
for (let k = 0; k < 40; k++) {
  const starts = [{ p: [-1, 0.5, 0.5], q: [0, 0, 0, 1], size: 1 }, { p: [1, 0.5, 0.2], q: Dice.CUBE_ROTATIONS[k % 24].toArray(), size: 1 }];
  const vals = [1 + (k % 6), 6 - (k % 6)];
  const r = Dice._computeThrow(env, { values: vals, seed: 1000 + k, velocity: { x: 3, y: 8, z: -9 }, spin: 20, maxTime: 6 }, starts, starts.map(() => [0, 0, 0, 1]));
  r.dice.forEach((d, i) => { d.id = i + 1; d.index = i; });
  const packed = JSON.parse(JSON.stringify(Dice.packRecord(r)));
  const again = Dice.resimulate(packed);
  const same = again.frames === r.frames && again.dice.every((d, i) => d.track.every((x, j) => x === r.dice[i].track[j])) && again.dice.every((d, i) => d.meshTo.join() === r.dice[i].meshTo.join());
  // visual top value at the end of the re-simulated record
  const tops = again.dice.map((d) => { const o = (again.frames - 1) * 7; const q = new THREE.Quaternion(d.track[o+3], d.track[o+4], d.track[o+5], d.track[o+6]).multiply(new THREE.Quaternion().fromArray(d.meshTo)); let b=-2,ix=0; Dice.FACE_NORMALS.forEach((n,j)=>{const y=n.clone().applyQuaternion(q).y; if(y>b){b=y;ix=j}}); return Dice.FACE_VALUES[ix]; });
  if (same && tops.join() === vals.join()) ok++; else console.log('diff', k, same, tops, vals);
}
console.log('packed->resimulated identical:', ok, '/ 40', 'packed size', JSON.stringify(Dice.packRecord(Dice._computeThrow(env, { values: [3, 4], seed: 5, maxTime: 6 }, [{ p: [0, 0.5, 0], q: [0, 0, 0, 1], size: 1 }, { p: [2, 0.5, 0], q: [0, 0, 0, 1], size: 1 }], null))).length, 'bytes');
