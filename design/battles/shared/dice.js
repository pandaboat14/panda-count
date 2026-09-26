/* Panda Diplomacy dice: real rigid-body throws that land on numbers the game server already rolled.
 *
 * Plain script, no import/export. Expects in scope: THREE (three@0.186.1), CANNON (cannon-es@0.20.0),
 * and, if the page imported it, RoundedBoxGeometry (three/addons/geometries/RoundedBoxGeometry.js).
 *
 * How a throw works:
 *   1. The values are decided before the throw (the server's roll).
 *   2. The whole throw is pre-simulated at once in a CANNON.World with a fixed 1/120 s step,
 *      seeded (mulberry32) so the same inputs always give the same throw. Positions, rotations and
 *      impacts are recorded frame by frame.
 *   3. When everything has settled we read which local face of each body points up. A cocked die
 *      (no face within 10 degrees of up), a stacked die or a timeout retries with a perturbed seed.
 *   4. The visual mesh inside each die's group is turned by one of the 24 rotations of the cube so the
 *      face carrying values[i] sits on the face that ends up on top. The silhouette is identical, so
 *      the motion stays the honest physics. A die thrown from where it rests swaps its labelling once,
 *      mid-air, on the frame it spins fastest; a die thrown from an origin gets it from the first frame.
 *   5. update(dt) plays the recording back in real time and fires synthesized clacks at the impacts.
 */
const Dice = (() => {
  const FACE_VALUES = [3, 4, 2, 5, 1, 6]; // three.js box material order: +x, -x, +y, -y, +z, -z (opposites add to 7)
  const FACE_NORMALS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ].map((a) => new THREE.Vector3(a[0], a[1], a[2]));
  const COS_FLAT = Math.cos((10 * Math.PI) / 180);
  const SIM_DT = 1 / 120;
  const MAX_ATTEMPTS = 18;

  // ------------------------------------------------------------------ seeded randomness
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(seed, n) {
    let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function randomQuat(rng) {
    const u1 = rng(), u2 = rng(), u3 = rng();
    const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
    return [s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3)];
  }
  function randomUnit(rng) {
    const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  }

  // ------------------------------------------------------------------ the 24 rotations of a cube
  const CUBE_ROTATIONS = (() => {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const out = [];
    const m = new THREE.Matrix4();
    for (const p of perms) {
      for (let s = 0; s < 8; s++) {
        const cols = [0, 1, 2].map((i) => {
          const v = new THREE.Vector3();
          v.setComponent(p[i], (s >> i) & 1 ? -1 : 1);
          return v;
        });
        m.makeBasis(cols[0], cols[1], cols[2]);
        if (m.determinant() < 0) continue;
        out.push(new THREE.Quaternion().setFromRotationMatrix(m));
      }
    }
    return out;
  })();

  // Which local face (index into FACE_NORMALS) points most nearly up for orientation q; also how nearly.
  const _v = new THREE.Vector3();
  function upFace(q) {
    let best = -2, k = 0;
    for (let j = 0; j < 6; j++) {
      const y = _v.copy(FACE_NORMALS[j]).applyQuaternion(q).y;
      if (y > best) {
        best = y;
        k = j;
      }
    }
    return { index: k, cos: best };
  }
  const _qv = new THREE.Quaternion();
  // The value a die is showing right now, read from what is actually drawn (group rotation x mesh rotation).
  function topValue(die) {
    _qv.copy(die.group.quaternion).multiply(die.mesh.quaternion);
    return FACE_VALUES[upFace(_qv).index];
  }

  // ------------------------------------------------------------------ faces, materials, meshes
  const PIPS = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.23], [0.73, 0.23], [0.27, 0.5], [0.73, 0.5], [0.27, 0.77], [0.73, 0.77]],
  };
  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    const f = (c) => Math.round(c + (t - c) * p).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }
  function resolveStyle(style) {
    if (style && typeof style === 'object') {
      const face = style.face || '#d64a2b', pip = style.pip || '#fffaf3';
      return { key: `c:${face}:${pip}:${style.edge || ''}`, kind: 'custom', face, pip, edge: style.edge || shade(face, -0.28) };
    }
    if (style === 'ivory') return { key: 'ivory', kind: 'ivory' };
    return { key: 'chance', kind: 'chance' };
  }
  function drawPip(g, x, y, r, color, dark, light) {
    // An engraved pip: shadowed upper-left rim, a filled bowl, a light catch lower-right.
    g.beginPath();
    g.arc(x + r * 0.07, y + r * 0.1, r * 1.06, 0, Math.PI * 2);
    g.fillStyle = light;
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    grad.addColorStop(0, dark);
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, color);
    g.fillStyle = grad;
    g.fill();
  }
  function faceCanvas(value, spec) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (spec.kind === 'chance') {
      // The Phantom Menace chance cube: blue is odd, red is even, gold inlay and pips.
      const odd = value % 2 === 1;
      const grad = g.createRadialGradient(S * 0.35, S * 0.3, 10, S / 2, S / 2, S * 0.78);
      grad.addColorStop(0, odd ? '#5aa0ff' : '#ff6a5a');
      grad.addColorStop(1, odd ? '#123f9e' : '#8e1410');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(255, 226, 150, .6)';
      g.lineWidth = 7;
      g.strokeRect(31, 31, S - 62, S - 62);
      g.strokeStyle = 'rgba(80, 40, 0, .35)';
      g.lineWidth = 2;
      g.strokeRect(36, 36, S - 72, S - 72);
      for (const [x, y] of PIPS[value]) {
        g.save();
        g.shadowColor = 'rgba(0,0,0,.5)';
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(x * S, y * S, S * 0.074, 0, Math.PI * 2);
        const pg = g.createRadialGradient(x * S - 6, y * S - 6, 2, x * S, y * S, S * 0.074);
        pg.addColorStop(0, '#fff1bf');
        pg.addColorStop(0.6, '#ffd36b');
        pg.addColorStop(1, '#c8921f');
        g.fillStyle = pg;
        g.fill();
        g.restore();
      }
    } else {
      const ivory = spec.kind === 'ivory';
      const face = ivory ? '#f4ecdb' : spec.face;
      const edge = ivory ? '#d9ccb0' : spec.edge;
      const grad = g.createRadialGradient(S * 0.38, S * 0.32, 12, S / 2, S / 2, S * 0.8);
      grad.addColorStop(0, shade(face, 0.1));
      grad.addColorStop(0.7, face);
      grad.addColorStop(1, edge);
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      // A soft band where the texture wraps the rounded edge.
      g.globalAlpha = 0.5;
      g.strokeStyle = edge;
      g.lineWidth = 22;
      g.strokeRect(0, 0, S, S);
      g.globalAlpha = 1;
      for (const [x, y] of PIPS[value]) {
        const one = value === 1;
        const col = ivory ? (one ? '#b3261e' : '#1c1b17') : spec.pip;
        const r = S * (one && ivory ? 0.12 : 0.078);
        drawPip(g, x * S, y * S, r, col, shade(col, -0.45), 'rgba(255,255,255,.35)');
      }
    }
    return c;
  }
  const matCache = new Map();
  function materialsFor(style) {
    const spec = resolveStyle(style);
    let mats = matCache.get(spec.key);
    if (!mats) {
      mats = FACE_VALUES.map((v) => {
        const tex = new THREE.CanvasTexture(faceCanvas(v, spec));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const params =
          spec.kind === 'chance'
            ? { roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 }
            : spec.kind === 'ivory'
              ? { roughness: 0.45, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35 }
              : { roughness: 0.34, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18 };
        return new THREE.MeshPhysicalMaterial({ map: tex, ...params });
      });
      matCache.set(spec.key, mats);
    }
    return mats;
  }
  const geoCache = new Map();
  function dieGeometry(size) {
    const key = 'd' + size;
    if (!geoCache.has(key)) {
      const RBG = typeof RoundedBoxGeometry !== 'undefined' ? RoundedBoxGeometry : null;
      geoCache.set(key, RBG ? new RBG(size, size, size, 4, size * 0.12) : new THREE.BoxGeometry(size, size, size));
    }
    return geoCache.get(key);
  }
  function haloGeometry(size) {
    const key = 'h' + size;
    if (!geoCache.has(key)) {
      const RBG = typeof RoundedBoxGeometry !== 'undefined' ? RoundedBoxGeometry : null;
      const s = size * 1.2;
      geoCache.set(key, RBG ? new RBG(s, s, s, 3, size * 0.24) : new THREE.BoxGeometry(s, s, s));
    }
    return geoCache.get(key);
  }
  function makeDieMesh(style = 'chance', size = 1) {
    const mesh = new THREE.Mesh(dieGeometry(size), materialsFor(style));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'die';
    return mesh;
  }

  // ------------------------------------------------------------------ sound (WebAudio, synthesized)
  const TIMBRES = {
    felt: { type: 'lowpass', f: 620, q: 0.8, decay: 0.075, tone: 150, toneDecay: 0.06, toneGain: 0.55, gain: 0.55 },
    wood: { type: 'bandpass', f: 1150, q: 1.4, decay: 0.05, tone: 470, toneDecay: 0.075, toneGain: 0.4, gain: 0.8, wave: 'triangle' },
    stone: { type: 'bandpass', f: 2900, q: 1.7, decay: 0.035, tone: 1700, toneDecay: 0.045, toneGain: 0.22, gain: 0.85 },
    grass: { type: 'lowpass', f: 420, q: 0.7, decay: 0.05, tone: 110, toneDecay: 0.04, toneGain: 0.3, gain: 0.4 },
    die: { type: 'bandpass', f: 3600, q: 2.6, decay: 0.024, tone: 2500, toneDecay: 0.03, toneGain: 0.22, gain: 0.6 },
    cup: { type: 'bandpass', f: 2500, q: 3.2, decay: 0.03, tone: 1850, toneDecay: 0.2, toneGain: 0.16, gain: 0.55 },
  };
  const audio = { ctx: null, master: null, noise: null, gestured: false, enabled: true, recent: [] };
  function ensureAudio() {
    if (!audio.gestured || !audio.enabled) return null;
    try {
      if (!audio.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return null;
        const c = new AC();
        audio.master = c.createGain();
        audio.master.gain.value = 0.7;
        audio.master.connect(c.destination);
        const len = Math.floor(c.sampleRate * 0.5);
        audio.noise = c.createBuffer(1, len, c.sampleRate);
        const d = audio.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        audio.ctx = c;
      }
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      return audio.ctx;
    } catch (e) {
      return null;
    }
  }
  function unlockAudio() {
    audio.gestured = true;
    ensureAudio();
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    const once = () => {
      unlockAudio();
      ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.removeEventListener(ev, once, true));
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, once, true));
  }
  function playClack(kind = 'wood', strength = 0.5) {
    const c = ensureAudio();
    if (!c) return;
    try {
      const T = TIMBRES[kind] || TIMBRES.wood;
      const now = c.currentTime;
      audio.recent = audio.recent.filter((t) => now - t < 0.06);
      if (audio.recent.length > 6) return;
      audio.recent.push(now);
      const s = Math.max(0.04, Math.min(1, strength));
      const vol = T.gain * Math.pow(s, 1.15);
      const pitch = 1 + (Math.random() - 0.5) * 0.16;
      const decay = T.decay * (0.75 + s * 0.5);
      const src = c.createBufferSource();
      src.buffer = audio.noise;
      const f = c.createBiquadFilter();
      f.type = T.type;
      f.frequency.value = T.f * pitch;
      f.Q.value = T.q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol, now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      src.connect(f);
      f.connect(g);
      g.connect(audio.master);
      src.start(now, Math.random() * 0.3, decay + 0.03);
      if (T.tone) {
        const o = c.createOscillator();
        o.type = T.wave || 'sine';
        o.frequency.setValueAtTime(T.tone * pitch, now);
        o.frequency.exponentialRampToValueAtTime(T.tone * pitch * 0.8, now + T.toneDecay);
        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.0001, now);
        g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * T.toneGain), now + 0.002);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + T.toneDecay);
        o.connect(g2);
        g2.connect(audio.master);
        o.start(now);
        o.stop(now + T.toneDecay + 0.03);
      }
    } catch (e) {
      /* audio is a nicety; never let it break a throw */
    }
  }
  function setSound(on) {
    audio.enabled = !!on;
    if (on && audio.gestured) ensureAudio();
  }

  // ------------------------------------------------------------------ physics
  const SURFACES = {
    felt: { restitution: 0.34, friction: 0.38, linearDamping: 0.05, angularDamping: 0.08, wallRestitution: 0.5, sound: 'felt', wallSound: 'wood' },
    wood: { restitution: 0.42, friction: 0.34, linearDamping: 0.08, angularDamping: 0.14, wallRestitution: 0.5, sound: 'wood', wallSound: 'wood' },
    stone: { restitution: 0.46, friction: 0.3, linearDamping: 0.08, angularDamping: 0.13, wallRestitution: 0.45, sound: 'stone', wallSound: 'stone' },
    grass: { restitution: 0.14, friction: 0.85, linearDamping: 0.2, angularDamping: 0.3, wallRestitution: 0.4, sound: 'grass', wallSound: 'wood' },
  };

  function makeEnv(o) {
    return {
      bounds: { minX: o.bounds.minX, maxX: o.bounds.maxX, minZ: o.bounds.minZ, maxZ: o.bounds.maxZ },
      floorY: o.floorY ?? 0,
      wallHeight: o.wallHeight ?? 8,
      gravity: o.gravity ?? -40,
      dieSize: o.dieSize ?? 1,
      surface: SURFACES[o.surface] ? o.surface : 'felt',
    };
  }

  // Starting position, rotation, velocity and spin of every thrown die for one attempt.
  function buildInits(env, input, starts, rng) {
    const { bounds, floorY } = env;
    const n = starts.length;
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const vel = input.velocity ? clampVelocity(input.velocity) : null;
    const inits = [];
    let shared = null; // one throw direction for dice leaving a shared origin
    if (input.origin && !Array.isArray(input.origin)) {
      const o = input.origin;
      let dx, dz;
      if (vel) [dx, dz] = [vel.x, vel.z];
      else {
        dx = cx - o.x;
        dz = cz - o.z;
      }
      let len = Math.hypot(dx, dz);
      if (len < 0.3) {
        const a = rng() * Math.PI * 2;
        [dx, dz, len] = [Math.cos(a), Math.sin(a), 1];
      }
      shared = { x: dx / len, z: dz / len };
    }
    for (let i = 0; i < n; i++) {
      const s = starts[i];
      const size = s.size, h = size / 2;
      let p, q;
      if (input.origin) {
        const o = Array.isArray(input.origin) ? input.origin[Math.min(i, input.origin.length - 1)] : input.origin;
        const spread = shared ? (i - (n - 1) / 2) * size * 1.35 : 0;
        const px = shared ? -shared.z : 0, pz = shared ? shared.x : 0;
        const y = o.y ?? floorY + (input.height ?? 3 * size);
        p = [o.x + px * spread + (rng() - 0.5) * 0.15 * size, y + (rng() - 0.5) * 0.3 * size, o.z + pz * spread + (rng() - 0.5) * 0.15 * size];
        q = randomQuat(rng);
      } else {
        p = s.p.slice();
        q = s.q.slice();
      }
      // velocity
      let v;
      if (vel) {
        const jitterA = (rng() - 0.5) * 0.3, jitterS = 0.9 + rng() * 0.2;
        const c = Math.cos(jitterA), sn = Math.sin(jitterA);
        v = [(vel.x * c - vel.z * sn) * jitterS, vel.y * (0.9 + rng() * 0.2), (vel.x * sn + vel.z * c) * jitterS];
      } else {
        let dx, dz;
        if (shared) [dx, dz] = [shared.x, shared.z];
        else {
          dx = cx - p[0];
          dz = cz - p[2];
          const len = Math.hypot(dx, dz);
          if (len < 0.6 * size) {
            const a = rng() * Math.PI * 2;
            [dx, dz] = [Math.cos(a), Math.sin(a)];
          } else {
            [dx, dz] = [dx / len, dz / len];
          }
          const turn = (rng() - 0.5) * 1.3;
          [dx, dz] = [dx * Math.cos(turn) - dz * Math.sin(turn), dx * Math.sin(turn) + dz * Math.cos(turn)];
        }
        const scale = Math.sqrt(size);
        if (input.origin) {
          const sp = (4 + rng() * 3) * scale;
          v = [dx * sp, (rng() - 0.5) * 2, dz * sp];
        } else {
          const sp = (5 + rng() * 4) * scale;
          v = [dx * sp, (8.5 + rng() * 3) * scale, dz * sp];
        }
      }
      if (!input.origin && p[1] < floorY + h * 1.5) v[1] = Math.max(v[1], 4.5); // lift off the floor instead of scraping it
      const axis = randomUnit(rng);
      const spin = (input.spin ?? 16) * (0.75 + rng() * 0.5);
      inits.push({ size, p, q, v, w: [axis[0] * spin, axis[1] * spin, axis[2] * spin] });
    }
    // Keep them inside the walls and apart from each other.
    for (let i = 0; i < n; i++) {
      const it = inits[i], h = it.size / 2 + 0.02;
      for (let j = 0; j < i; j++) {
        const o = inits[j];
        let dx = it.p[0] - o.p[0], dz = it.p[2] - o.p[2];
        const dy = it.p[1] - o.p[1];
        const d = Math.hypot(dx, dy, dz), need = (it.size + o.size) * 0.62;
        if (d < need) {
          let len = Math.hypot(dx, dz);
          if (len < 1e-3) [dx, dz, len] = [1, 0, 1];
          it.p[0] = o.p[0] + (dx / len) * need;
          it.p[2] = o.p[2] + (dz / len) * need;
        }
      }
      it.p[0] = Math.min(bounds.maxX - h, Math.max(bounds.minX + h, it.p[0]));
      it.p[2] = Math.min(bounds.maxZ - h, Math.max(bounds.minZ + h, it.p[2]));
      it.p[1] = Math.min(floorY + env.wallHeight - h, Math.max(floorY + h + 0.001, it.p[1]));
    }
    return inits;
  }
  function clampVelocity(v) {
    const hx = v.x || 0, hz = v.z || 0;
    const hs = Math.hypot(hx, hz);
    const k = hs > 30 ? 30 / hs : 1;
    return { x: hx * k, y: Math.max(-12, Math.min(16, v.y || 0)), z: hz * k };
  }

  function simulate(env, inits, maxTime, statics = []) {
    const S = SURFACES[env.surface] || SURFACES.felt;
    const dt = SIM_DT, fy = env.floorY, { minX, maxX, minZ, maxZ } = env.bounds;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, env.gravity, 0) });
    world.solver.iterations = 20;
    const dieMat = new CANNON.Material('die'), floorMat = new CANNON.Material('floor'), wallMat = new CANNON.Material('wall');
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: S.friction, restitution: S.restitution }));
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, wallMat, { friction: 0.14, restitution: S.wallRestitution }));
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.24, restitution: 0.4 }));
    // Walls, floor and lid are infinite half-spaces: nothing can tunnel through a plane.
    const plane = (mat, x, y, z, nx, ny, nz) => {
      const b = new CANNON.Body({ mass: 0, material: mat, type: CANNON.Body.STATIC });
      b.addShape(new CANNON.Plane());
      b.position.set(x, y, z);
      b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(nx, ny, nz));
      world.addBody(b);
      return b;
    };
    const floor = plane(floorMat, 0, fy, 0, 0, 1, 0);
    plane(wallMat, minX, 0, 0, 1, 0, 0);
    plane(wallMat, maxX, 0, 0, -1, 0, 0);
    plane(wallMat, 0, 0, minZ, 0, 0, 1);
    plane(wallMat, 0, 0, maxZ, 0, 0, -1);
    plane(wallMat, 0, fy + env.wallHeight, 0, 0, -1, 0);
    const dieBodies = new Set();
    for (const s of statics) {
      const h = s.size / 2;
      const b = new CANNON.Body({ mass: 0, material: dieMat, type: CANNON.Body.STATIC });
      b.addShape(new CANNON.Box(new CANNON.Vec3(h, h, h)));
      b.position.set(s.p[0], s.p[1], s.p[2]);
      b.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
      world.addBody(b);
      dieBodies.add(b);
    }
    const bodies = inits.map((it) => {
      const h = it.size / 2;
      const b = new CANNON.Body({ mass: 1, material: dieMat, linearDamping: S.linearDamping, angularDamping: S.angularDamping, allowSleep: false });
      b.addShape(new CANNON.Box(new CANNON.Vec3(h, h, h)));
      b.position.set(it.p[0], it.p[1], it.p[2]);
      b.quaternion.set(it.q[0], it.q[1], it.q[2], it.q[3]);
      b.quaternion.normalize();
      b.velocity.set(it.v[0], it.v[1], it.v[2]);
      b.angularVelocity.set(it.w[0], it.w[1], it.w[2]);
      world.addBody(b);
      dieBodies.add(b);
      return b;
    });
    const index = new Map(bodies.map((b, i) => [b, i]));
    const N = bodies.length;
    const maxSteps = Math.ceil(maxTime / dt);
    const tracks = bodies.map(() => new Float32Array((maxSteps + 1) * 7));
    const omega = bodies.map(() => new Float32Array(maxSteps + 1));
    const rec = (step) => {
      for (let i = 0; i < N; i++) {
        const b = bodies[i], o = step * 7, tr = tracks[i];
        tr[o] = b.position.x;
        tr[o + 1] = b.position.y;
        tr[o + 2] = b.position.z;
        tr[o + 3] = b.quaternion.x;
        tr[o + 4] = b.quaternion.y;
        tr[o + 5] = b.quaternion.z;
        tr[o + 6] = b.quaternion.w;
        omega[i][step] = b.angularVelocity.length();
      }
    };
    rec(0);
    const prevV = bodies.map(() => new CANNON.Vec3()), prevW = bodies.map(() => new CANNON.Vec3());
    const lastHit = new Float64Array(N).fill(-1);
    const impacts = [];
    let step = 0, calm = 0, settled = false;
    while (step < maxSteps) {
      for (let i = 0; i < N; i++) {
        const b = bodies[i], h = inits[i].size / 2;
        prevV[i].copy(b.velocity);
        prevW[i].copy(b.angularVelocity);
        // Once a die lies flat and has almost stopped, let it come to rest quickly instead of creeping.
        const slow = b.velocity.length() < 1 && b.angularVelocity.length() < 2.5 && b.position.y < fy + h * 1.06;
        b.linearDamping = slow ? 0.5 : S.linearDamping;
        b.angularDamping = slow ? 0.6 : S.angularDamping;
      }
      world.step(dt);
      step++;
      const t = step * dt;
      rec(step);
      for (let i = 0; i < N; i++) {
        const b = bodies[i], h = inits[i].size / 2;
        const dvx = b.velocity.x - prevV[i].x, dvy = b.velocity.y - prevV[i].y - env.gravity * dt, dvz = b.velocity.z - prevV[i].z;
        const dw = Math.hypot(b.angularVelocity.x - prevW[i].x, b.angularVelocity.y - prevW[i].y, b.angularVelocity.z - prevW[i].z);
        const hit = Math.hypot(dvx, dvy, dvz) + 0.35 * dw * h;
        if (hit < 1.6 || t - lastHit[i] < 0.05) continue;
        let kind = null, other = -1;
        for (const c of world.contacts) {
          const o = c.bi === b ? c.bj : c.bj === b ? c.bi : null;
          if (!o) continue;
          if (dieBodies.has(o)) {
            kind = 'die';
            other = index.has(o) ? index.get(o) : -1;
            break;
          }
          if (o === floor) kind = kind || 'floor';
          else kind = 'wall';
        }
        if (!kind) continue;
        lastHit[i] = t;
        if (kind === 'die' && other >= 0 && lastHit[other] === t) continue; // one clack per pair
        impacts.push({ t, die: i, speed: +hit.toFixed(3), kind });
      }
      let allCalm = true;
      for (let i = 0; i < N; i++) {
        if (bodies[i].velocity.length() > 0.1 || bodies[i].angularVelocity.length() > 0.2) {
          allCalm = false;
          break;
        }
      }
      calm = allCalm ? calm + 1 : 0;
      if (calm >= 16 && t > 0.3) {
        settled = true;
        break;
      }
    }
    const frames = step + 1;
    const ups = [];
    let flat = true, grounded = true;
    const q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const b = bodies[i], h = inits[i].size / 2;
      q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const u = upFace(q);
      ups.push(u.index);
      if (u.cos < COS_FLAT) flat = false;
      if (b.position.y > fy + h * 1.25) grounded = false;
    }
    const reason = !settled ? 'timeout' : !flat ? 'cocked' : !grounded ? 'stacked' : null;
    return {
      ok: !reason,
      reason,
      frames,
      tracks: tracks.map((tr) => tr.slice(0, frames * 7)),
      omega: omega.map((om) => om.slice(0, frames)),
      ups,
      impacts,
      duration: step * dt,
    };
  }

  // The frame to relabel a die thrown from rest: high in the air and spinning hard (spin x height).
  function swapFrameFor(sim, i, env, size) {
    const tr = sim.tracks[i], om = sim.omega[i];
    const from = Math.min(sim.frames - 1, Math.round(0.1 / SIM_DT)), to = Math.max(from + 1, Math.floor(sim.frames * 0.6));
    let best = from, score = -1, fastest = from;
    for (let f = from; f < to && f < sim.frames; f++) {
      const s = om[f] * Math.max(0, tr[f * 7 + 1] - env.floorY - size * 0.6);
      if (s > score) {
        score = s;
        best = f;
      }
      if (om[f] > om[fastest]) fastest = f;
    }
    return score > 0 ? best : fastest;
  }

  // Pure (no DOM): simulate a throw and choose mesh rotations. Returns a record without die ids.
  function computeThrow(env, input, starts, meshFrom, statics = [], firstAttempt = 0) {
    let sim = null, inits = null, attempt = firstAttempt;
    for (let a = firstAttempt; a < firstAttempt + MAX_ATTEMPTS; a++) {
      const rng = mulberry32(hashSeed(input.seed, a));
      inits = buildInits(env, input, starts, rng);
      sim = simulate(env, inits, input.maxTime ?? 6, statics);
      attempt = a;
      if (sim.ok) break;
    }
    const pickRng = mulberry32(hashSeed(input.seed, 7777 + attempt));
    const tmp = new THREE.Vector3(), qa = new THREE.Quaternion();
    const dice = starts.map((s, i) => {
      const k = sim.ups[i];
      const m = FACE_VALUES.indexOf(input.values[i]);
      const cands = CUBE_ROTATIONS.filter((R) => tmp.copy(FACE_NORMALS[m]).applyQuaternion(R).dot(FACE_NORMALS[k]) > 0.99);
      let R, from, swapFrame;
      if (input.origin || !meshFrom || !meshFrom[i]) {
        R = cands[Math.floor(pickRng() * cands.length) % cands.length];
        from = R.toArray();
        swapFrame = -1;
      } else {
        qa.fromArray(meshFrom[i]);
        let best = -1;
        for (const c of cands) {
          const d = Math.abs(c.dot(qa));
          if (d > best) {
            best = d;
            R = c;
          }
        }
        from = meshFrom[i].slice();
        swapFrame = best > 0.9999 ? -1 : swapFrameFor(sim, i, env, s.size);
      }
      return { track: sim.tracks[i], up: k, meshFrom: from, meshTo: R.toArray(), swapFrame, size: s.size };
    });
    return {
      v: 1,
      values: input.values.slice(),
      seed: input.seed,
      attempt,
      ok: sim.ok,
      reason: sim.reason,
      dt: SIM_DT,
      frames: sim.frames,
      duration: sim.duration,
      impacts: sim.impacts,
      input: { ...input, values: input.values.slice() },
      env: { ...env, bounds: { ...env.bounds } },
      starts: starts.map((s) => ({ p: s.p.slice(), q: s.q.slice(), size: s.size })),
      statics: statics.map((s) => ({ p: s.p.slice(), q: s.q.slice(), size: s.size })),
      dice,
    };
  }

  // A record without tracks (e.g. sent over the wire) is re-simulated from its inputs. The faces are
  // re-chosen from the new result, so the values are right even if another engine's floats drift.
  function resimulate(record) {
    const meshFrom = record.dice.map((d) => d.meshFrom);
    const r = computeThrow(record.env, record.input, record.starts, meshFrom, record.statics || [], record.attempt || 0);
    r.dice.forEach((d, i) => {
      d.id = record.dice[i].id;
      d.index = record.dice[i].index;
    });
    return r;
  }
  // JSON-safe copy of a record for sending to other players: inputs only, no tracks (see resimulate).
  function packRecord(record) {
    return {
      v: record.v,
      values: record.values,
      seed: record.seed,
      attempt: record.attempt,
      input: record.input,
      env: record.env,
      starts: record.starts,
      statics: record.statics,
      dice: record.dice.map((d) => ({ id: d.id, index: d.index, meshFrom: d.meshFrom, size: d.size })),
    };
  }

  // ------------------------------------------------------------------ tray
  function createTray(opts) {
    const scene = opts.scene;
    const env = makeEnv(opts);
    const S = SURFACES[env.surface];
    const root = new THREE.Group();
    root.name = 'dice-tray';
    scene.add(root);
    const dice = [];
    const tweens = [];
    let nextId = 1, play = null, clock = 0;
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
    const pickGeo = new THREE.BoxGeometry(1, 1, 1);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });

    function reindex() {
      dice.forEach((d, i) => (d.index = i));
    }
    function slotFor(i, size) {
      const cx = (env.bounds.minX + env.bounds.maxX) / 2, cz = (env.bounds.minZ + env.bounds.maxZ) / 2;
      const col = i % 4, row = Math.floor(i / 4);
      const xs = [-0.9, 0.9, -2.7, 2.7];
      return { x: cx + xs[col] * size, z: cz + row * 1.8 * size };
    }

    const tray = {
      root,
      dice,
      env,
      sound: opts.sound !== false,
      timeScale: 1,
      onImpact: null,
      get rolling() {
        return !!play;
      },

      addDie({ style = 'chance', size, position } = {}) {
        size = size ?? env.dieSize;
        const mesh = makeDieMesh(style, size);
        const group = new THREE.Group();
        group.add(mesh);
        const proxy = new THREE.Mesh(pickGeo, pickMat);
        proxy.scale.setScalar(size * 1.5);
        proxy.name = 'die-pick';
        group.add(proxy);
        root.add(group);
        const i = dice.length;
        const slot = slotFor(i, size);
        const pos = { x: position?.x ?? slot.x, y: position?.y ?? env.floorY + size / 2, z: position?.z ?? slot.z };
        group.position.set(pos.x, pos.y, pos.z);
        const rng = mulberry32(hashSeed(nextId * 7919, i));
        const R = CUBE_ROTATIONS[Math.floor(rng() * 24) % 24];
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rng() - 0.5) * 0.8);
        group.quaternion.copy(yaw).multiply(R);
        const die = { group, mesh, style, size, index: i, id: nextId++, value: 1, halo: null, glowColor: null };
        group.userData.die = die;
        die.value = topValue(die);
        dice.push(die);
        return die;
      },

      removeDie(die) {
        const i = dice.indexOf(die);
        if (i < 0) return;
        if (play && play.list.includes(die)) finish();
        root.remove(die.group);
        if (die.halo) die.halo.material.dispose();
        dice.splice(i, 1);
        reindex();
      },

      clear() {
        if (play) finish();
        for (const d of dice.slice()) tray.removeDie(d);
      },

      setStyle(die, style) {
        die.style = style;
        die.mesh.material = materialsFor(style);
      },

      throw(o = {}) {
        const list = (o.dice || dice).slice();
        const values = o.values;
        if (!Array.isArray(values) || values.length !== list.length || values.some((v) => !(v >= 1 && v <= 6 && Math.floor(v) === v))) {
          return Promise.reject(new Error('throw() needs one value from 1 to 6 for each thrown die'));
        }
        if (!list.length) return Promise.reject(new Error('throw() has no dice to throw'));
        if (play) finish();
        settleTweens();
        const seed = (o.seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
        const input = {
          values: values.slice(),
          seed,
          origin: o.origin ?? null,
          velocity: o.velocity ?? null,
          spin: o.spin ?? null,
          height: o.height ?? null,
          maxTime: o.maxTime ?? 6,
        };
        const starts = list.map((d) => ({ p: d.group.position.toArray(), q: d.group.quaternion.toArray(), size: d.size }));
        const meshFrom = list.map((d) => d.mesh.quaternion.toArray());
        const statics = dice.filter((d) => !list.includes(d)).map((d) => ({ p: d.group.position.toArray(), q: d.group.quaternion.toArray(), size: d.size }));
        const record = computeThrow(env, input, starts, meshFrom, statics);
        record.dice.forEach((e, i) => {
          e.id = list[i].id;
          e.index = list[i].index;
        });
        return start(record, list);
      },

      replay(record) {
        if (!record || !record.dice) return Promise.reject(new Error('replay() needs a record from throw()'));
        const rec = record.dice[0] && record.dice[0].track ? record : resimulate(record);
        const list = rec.dice.map((e, i) => dice.find((d) => d.id === e.id) || dice[e.index] || dice[i]);
        if (list.some((d) => !d)) return Promise.reject(new Error('replay() needs the same dice in the tray'));
        if (play) finish();
        settleTweens();
        return start(rec, list);
      },

      update(dt) {
        dt = Math.max(0, Math.min(dt || 0, 0.1));
        clock += dt;
        if (play) advance(dt * tray.timeScale);
        for (let i = tweens.length - 1; i >= 0; i--) {
          const tw = tweens[i];
          tw.t += dt;
          const k = Math.min(1, tw.t / tw.dur);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          const g = tw.die.group;
          g.position.lerpVectors(tw.from, tw.to, e);
          g.position.y += Math.sin(Math.PI * e) * tw.lift;
          g.quaternion.slerpQuaternions(tw.qFrom, tw.qTo, e);
          if (k >= 1) {
            tweens.splice(i, 1);
            tw.resolve(tw.die);
          }
        }
        for (const d of dice) {
          if (d.halo && d.halo.visible) d.halo.material.opacity = 0.42 + 0.22 * Math.sin(clock * 4.2 + d.index);
        }
      },

      arrange(die, pos, { duration = 0.5, lift = 0.8, square = true, yaw = 0 } = {}) {
        if (play && play.list.includes(die)) finish();
        settleTweens(die);
        const g = die.group;
        const from = g.position.clone();
        const to = new THREE.Vector3(pos.x ?? from.x, pos.y ?? env.floorY + die.size / 2, pos.z ?? from.z);
        const qFrom = g.quaternion.clone();
        // Keep the same face up: straighten any tilt, then square the die to the table (plus an optional yaw).
        const k = upFace(qFrom).index;
        const upNow = FACE_NORMALS[k].clone().applyQuaternion(qFrom);
        const qTo = new THREE.Quaternion().setFromUnitVectors(upNow, new THREE.Vector3(0, 1, 0)).multiply(qFrom);
        if (square) {
          const side = FACE_NORMALS[k === 0 || k === 1 ? 2 : 0].clone().applyQuaternion(qTo);
          const ang = Math.atan2(side.x, side.z);
          const snapped = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
          qTo.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), snapped - ang + yaw));
        } else if (yaw) {
          qTo.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
        }
        return new Promise((resolve) => {
          if (duration <= 0) {
            g.position.copy(to);
            g.quaternion.copy(qTo);
            resolve(die);
            return;
          }
          tweens.push({ die, from, to, qFrom, qTo, lift, t: 0, dur: duration, resolve });
        });
      },

      setGlow(die, color) {
        if (!color) {
          if (die.halo) die.halo.visible = false;
          die.glowColor = null;
          return;
        }
        if (!die.halo) {
          const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.5,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          die.halo = new THREE.Mesh(haloGeometry(die.size), mat);
          die.halo.renderOrder = 2;
          die.halo.name = 'die-glow';
          die.group.add(die.halo);
        }
        die.halo.material.color.set(color);
        die.halo.visible = true;
        die.glowColor = color;
      },

      pick(raycaster) {
        const hits = raycaster.intersectObjects(dice.map((d) => d.group), true);
        for (const h of hits) {
          let o = h.object;
          while (o && !(o.userData && o.userData.die)) o = o.parent;
          if (o) return o.userData.die;
        }
        return null;
      },

      values() {
        return dice.map(topValue);
      },

      dispose() {
        if (play) finish();
        settleTweens();
        for (const d of dice) if (d.halo) d.halo.material.dispose();
        dice.length = 0;
        scene.remove(root);
        pickGeo.dispose();
        pickMat.dispose();
      },
    };

    // Finish pending glides at once (all of them, or one die's) so nobody waits on a dropped promise.
    function settleTweens(only) {
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        if (only && tw.die !== only) continue;
        tweens.splice(i, 1);
        tw.die.group.position.copy(tw.to);
        tw.die.group.quaternion.copy(tw.qTo);
        tw.resolve(tw.die);
      }
    }
    function applyFrame(die, e, i0, i1, a) {
      const tr = e.track, o0 = i0 * 7, o1 = i1 * 7, g = die.group;
      g.position.set(tr[o0] + (tr[o1] - tr[o0]) * a, tr[o0 + 1] + (tr[o1 + 1] - tr[o0 + 1]) * a, tr[o0 + 2] + (tr[o1 + 2] - tr[o0 + 2]) * a);
      q0.set(tr[o0 + 3], tr[o0 + 4], tr[o0 + 5], tr[o0 + 6]);
      q1.set(tr[o1 + 3], tr[o1 + 4], tr[o1 + 5], tr[o1 + 6]);
      g.quaternion.slerpQuaternions(q0, q1, a);
      die.mesh.quaternion.fromArray(e.swapFrame >= 0 && i0 < e.swapFrame ? e.meshFrom : e.meshTo);
    }
    function start(record, list) {
      return new Promise((resolve) => {
        play = { record, list, t: 0, next: 0, resolve };
        list.forEach((d, i) => applyFrame(d, record.dice[i], 0, 0, 0));
      });
    }
    function advance(dt) {
      const p = play, r = p.record;
      p.t += dt;
      const last = r.frames - 1;
      const f = Math.min(p.t / r.dt, last);
      const i0 = Math.floor(f), i1 = Math.min(i0 + 1, last);
      p.list.forEach((d, i) => applyFrame(d, r.dice[i], i0, i1, f - i0));
      while (p.next < r.impacts.length && r.impacts[p.next].t <= p.t) {
        const im = r.impacts[p.next++];
        if (p.t - im.t > 0.15) continue; // skip stale sounds after a stalled frame
        if (tray.sound) {
          const kind = im.kind === 'die' ? 'die' : im.kind === 'wall' ? S.wallSound : S.sound;
          playClack(kind, Math.min(1, im.speed / 14));
        }
        if (tray.onImpact) {
          try {
            tray.onImpact(im, p.list[im.die]);
          } catch (e) {
            /* page callback errors must not stop the throw */
          }
        }
      }
      if (p.t >= r.duration) finish();
    }
    function finish() {
      const p = play;
      if (!p) return;
      const r = p.record, last = r.frames - 1;
      p.list.forEach((d, i) => {
        applyFrame(d, r.dice[i], last, last, 0);
        d.mesh.quaternion.fromArray(r.dice[i].meshTo);
        d.value = r.values[i];
      });
      play = null;
      p.resolve(r);
    }
    return tray;
  }

  return {
    FACE_VALUES,
    FACE_NORMALS,
    CUBE_ROTATIONS,
    SURFACES,
    makeDieMesh,
    createTray,
    topValue,
    playClack,
    setSound,
    unlockAudio,
    packRecord,
    resimulate,
    mulberry32,
    // Pure physics, exposed for tests and tools (no DOM needed).
    _computeThrow: (envOpts, input, starts, meshFrom, statics) => computeThrow(makeEnv(envOpts), input, starts, meshFrom, statics),
  };
})();
