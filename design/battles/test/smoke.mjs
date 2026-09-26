import * as THREE from '../lib/node_modules/three/build/three.module.js';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../shared/models.js', import.meta.url), 'utf8');
const Models = new Function('THREE', src + '\nreturn Models;')(THREE);
let errors = 0, figs = 0;
const t0 = Date.now();
for (const style of Models.STYLES) {
  for (const kind of Models.KINDS) {
    const weapons = [null, ...Models.weaponsFor(kind, 'weapon')];
    const armours = [null, ...Models.weaponsFor(kind, 'armour')];
    for (const w of weapons) for (const a of armours) {
      try {
        const f = Models.buildFigure(kind, { style, gear: [w, a].filter(Boolean), teamColor: '#2b6fd6' });
        figs++;
        for (const anim of Models.ANIMS) {
          const r = f.play(anim);
          if (!(r.duration >= 0) || !(r.impact >= 0)) throw new Error('bad result ' + anim + JSON.stringify(r));
          for (let i = 0; i < 40; i++) f.update(1 / 30);
          f.root.updateMatrixWorld(true);
          f.root.traverse((o) => { if (o.isMesh) { const e = o.matrixWorld.elements; for (const v of e) if (!Number.isFinite(v)) throw new Error('NaN matrix in ' + anim + ' ' + o.parent.name); } });
        }
        f.play('idle'); f.update(0.5);
        f.flash('#ff0000', 0.3); f.update(0.1);
        f.setTeamColor('#e0a526');
        for (const n of ['hand', 'head', 'chest', 'weaponTip']) if (!f.getAnchor(n)) throw new Error('no anchor ' + n);
        if (w === null && a === null) {
          console.log(style.padEnd(8), kind.padEnd(11), 'h=' + f.height, 'halfW=' + f.halfW.toFixed(2), 'fp=' + f.footprint.toFixed(2), 'atk=' + f.attackKind, 'throw=' + f.throwKind,
            'meshes=' + f.baseMeshes.length + '+' + f.gearMeshes.length);
        }
        f.dispose();
      } catch (e) { errors++; console.log('ERR', style, kind, w, a, e.stack.split('\n').slice(0, 3).join(' | ')); }
    }
  }
}
// squads + props + projectiles
try {
  const sq = Models.buildSquad('armedPanda', 9, { style: 'toon', gear: ['ironGlaive', 'ironHelm'] });
  sq.play('attack'); for (let i = 0; i < 30; i++) sq.update(1 / 30);
  sq.setCount(4); for (let i = 0; i < 120; i++) sq.update(1 / 30);
  console.log('squad living after setCount(4):', sq.living.length, 'count', sq.count);
  sq.setCount(9); for (let i = 0; i < 30; i++) sq.update(1 / 30);
  console.log('squad living after setCount(9):', sq.living.length);
  sq.setGear(['sling', 'towerShield']); sq.play('throw'); for (let i = 0; i < 60; i++) sq.update(1 / 30);
  sq.dispose();
  for (const p of ['catapult', 'banner', 'fort']) for (const style of Models.STYLES) { const g = Models.buildProp(p, { style, teamColor: '#14a38b' }); g.userData.update(0.1); if (g.userData.fire) g.userData.fire(); g.userData.update(0.3); g.userData.setTeamColor('#d6368f'); }
  for (const k of ['arrow', 'gemArrow', 'stone', 'rock', 'card', 'bolt', 'dumbbell', 'spear']) Models.buildProjectile(k, { style: 'lowpoly' });
} catch (e) { errors++; console.log('ERR squad/props', e.stack.split('\n').slice(0, 4).join(' | ')); }
console.log(`figures built: ${figs}, errors: ${errors}, ${(Date.now() - t0)} ms`);
{
  const f = Models.buildFigure('armedPanda', { gear: ['ironGlaive', 'ironHelm'] });
  f.setWeapon('sling'); const a = f.gear.ids.join(',');
  f.setWeapon('towerShield'); const b = f.gear.ids.join(',');
  f.setWeapon(null); const c = f.gear.ids.join(',');
  const g = Models.buildFigure('panda', { weapon: 'bambooBow' });
  console.log('setWeapon slots:', a, '|', b, '|', c, '| opts.weapon ->', g.gear.ids.join(','), g.throwKind);
}
