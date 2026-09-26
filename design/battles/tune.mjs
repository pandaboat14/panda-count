import * as THREE from './lib/node_modules/three/build/three.module.js';
import * as CANNON from './lib/node_modules/cannon-es/dist/cannon-es.js';
import fs from 'fs';
const src = fs.readFileSync(new URL('./shared/dice.js', import.meta.url), 'utf8');
const Dice = new Function('THREE', 'CANNON', src + '\nreturn Dice;')(THREE, CANNON);
const [surface = 'felt', sp = '7.5', spr = '3', vy = '6.2', spin = '17', size = '1'] = process.argv.slice(2);
const set = JSON.parse(process.argv[8] || '{}');
Object.assign(Dice.SURFACES[surface], set);
const env = { bounds: { minX: -5, maxX: 5, minZ: -3.2, maxZ: 3.2 }, floorY: 0, wallHeight: 7, gravity: +(process.env.G || -40), dieSize: +size, surface };
const rnd = Dice.mulberry32(7);
let durs = [], att = 0, walls = 0, dd = 0;
for (let k = 0; k < 150; k++) {
  const s = +size;
  const starts = [{ p: [-0.95, s / 2, 0.7], q: Dice.CUBE_ROTATIONS[k % 24].toArray(), size: s }, { p: [1, s / 2, 0.35], q: Dice.CUBE_ROTATIONS[(k * 5) % 24].toArray(), size: s }];
  const a = -Math.PI / 2 + (rnd() - 0.5) * 2.0, v = +sp + rnd() * +spr;
  const velocity = { x: Math.cos(a) * v, y: +vy + rnd() * 1.2, z: Math.sin(a) * v * 0.75 };
  const r = Dice._computeThrow(env, { values: [1 + (k % 6), 1 + ((k * 7) % 6)], seed: k * 31 + 1, velocity, spin: +spin, maxTime: 6 }, starts, starts.map(() => [0, 0, 0, 1]));
  durs.push(r.duration); att += r.attempt;
  walls += r.impacts.filter((i) => i.kind === 'wall').length; dd += r.impacts.filter((i) => i.kind === 'die').length;
}
durs.sort((a, b) => a - b);
console.log(surface, sp, spr, vy, JSON.stringify(set), 'med', durs[75].toFixed(2), 'p10', durs[15].toFixed(2), 'p90', durs[135].toFixed(2), 'max', durs[149].toFixed(2), 'retries', att, 'walls/throw', (walls / 150).toFixed(1), 'diedie', (dd / 150).toFixed(1));
