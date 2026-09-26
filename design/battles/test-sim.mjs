import * as THREE from './lib/node_modules/three/build/three.module.js';
import * as CANNON from './lib/node_modules/cannon-es/dist/cannon-es.js';
import fs from 'fs';
const src = fs.readFileSync(new URL('./shared/dice.js', import.meta.url), 'utf8');
const Dice = new Function('THREE', 'CANNON', src + '\nreturn Dice;')(THREE, CANNON);
const surface = process.argv[2] || 'felt';
const mode = process.argv[3] || 'rest';
const env = { bounds: { minX: -5, maxX: 5, minZ: -3.2, maxZ: 3.2 }, floorY: 0, wallHeight: 8, gravity: -40, dieSize: 1, surface };
let n = 0, attemptsSum = 0, fails = 0, durs = [], ms = 0, maxAttempt = 0, swaps = 0, impacts = 0, reasons = {};
const rnd = Dice.mulberry32(42);
for (let k = 0; k < 200; k++) {
  const starts = [
    { p: [-0.9, 0.5, 0], q: Dice.CUBE_ROTATIONS[k % 24].toArray(), size: 1 },
    { p: [0.9, 0.5, 0], q: Dice.CUBE_ROTATIONS[(k * 7) % 24].toArray(), size: 1 },
  ];
  const values = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
  const input = { values, seed: k * 977 + 13, origin: mode === 'origin' ? { x: -3, y: 3, z: -1 } : null, velocity: mode === 'flick' ? { x: 14, y: 5, z: -4 } : null, spin: null, height: null, maxTime: 6 };
  const t0 = performance.now();
  const r = Dice._computeThrow(env, input, starts, starts.map(() => [0, 0, 0, 1]));
  ms += performance.now() - t0;
  n++;
  attemptsSum += r.attempt;
  maxAttempt = Math.max(maxAttempt, r.attempt);
  if (!r.ok) { fails++; reasons[r.reason] = (reasons[r.reason] || 0) + 1; }
  durs.push(r.duration);
  swaps += r.dice.filter((d) => d.swapFrame >= 0).length;
  impacts += r.impacts.length;
  // verify final visual top value
  r.dice.forEach((d, i) => {
    const o = (r.frames - 1) * 7;
    const gq = new THREE.Quaternion(d.track[o + 3], d.track[o + 4], d.track[o + 5], d.track[o + 6]);
    const vq = gq.clone().multiply(new THREE.Quaternion().fromArray(d.meshTo));
    let best = -2, idx = 0;
    Dice.FACE_NORMALS.forEach((nrm, j) => { const y = nrm.clone().applyQuaternion(vq).y; if (y > best) { best = y; idx = j; } });
    if (Dice.FACE_VALUES[idx] !== values[i]) console.log('MISMATCH', k, i, Dice.FACE_VALUES[idx], values[i]);
    // bounds check
    for (let f = 0; f < r.frames; f++) {
      const x = d.track[f * 7], y = d.track[f * 7 + 1], z = d.track[f * 7 + 2];
      if (x < env.bounds.minX - 0.05 || x > env.bounds.maxX + 0.05 || z < env.bounds.minZ - 0.05 || z > env.bounds.maxZ + 0.05 || y < 0.3) { console.log('OUT', k, i, f, x, y, z); break; }
    }
  });
}
durs.sort((a, b) => a - b);
console.log(JSON.stringify({ surface, mode, n, avgRetries: attemptsSum / n, maxAttempt, fails, reasons, medDur: durs[n >> 1].toFixed(2), p90: durs[Math.floor(n * 0.9)].toFixed(2), max: durs[n - 1].toFixed(2), msPerThrow: (ms / n).toFixed(1), swapsPerThrow: swaps / n, impactsPerThrow: impacts / n }));
