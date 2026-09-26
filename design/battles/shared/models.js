// Panda Diplomacy battle figures. Plain script: expects THREE (three@0.186.1) in scope, defines `Models`.
// Every character is built from primitives, merged per (bone, material) so a figure costs ~20-40 draw calls,
// and animated procedurally by rotating a small rig (hips, torso, head, arms with elbows, legs, weapon).
const Models = (() => {
  const TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;

  // ---------------------------------------------------------------------------------------------
  // Catalogue
  // ---------------------------------------------------------------------------------------------
  const KINDS = ['panda', 'armedPanda', 'nacam', 'cam', 'casey', 'ping', 'cockpenis', 'piecer', 'josserkid'];
  const HEROES = ['casey', 'ping', 'cockpenis', 'piecer', 'josserkid'];
  const STYLES = ['toy', 'lowpoly', 'toon'];
  const UNITS4 = ['panda', 'armedPanda', 'nacam', 'cam'];
  const WEAPONS = {
    bambooSpear: { label: 'Bamboo spear', slot: 'weapon', fits: ['panda', 'armedPanda'] },
    bambooBow: { label: 'Bamboo bow', slot: 'weapon', fits: ['panda', 'armedPanda', 'cam'] },
    gemArrows: { label: 'Gem arrows', slot: 'weapon', fits: ['panda', 'armedPanda', 'cam'] },
    sling: { label: 'Sling', slot: 'weapon', fits: ['panda', 'armedPanda', 'nacam'] },
    ironGlaive: { label: 'Iron glaive', slot: 'weapon', fits: ['armedPanda', 'cam'] },
    spikedClub: { label: 'Spiked club', slot: 'weapon', fits: ['nacam'] },
    gemKnuckles: { label: 'Gem knuckles', slot: 'weapon', fits: ['cam'] },
    ironHelm: { label: 'Iron helm', slot: 'armour', fits: UNITS4.slice() },
    towerShield: { label: 'Tower shield', slot: 'armour', fits: ['panda', 'armedPanda'] },
    stormHammer: { label: 'Storm hammer', slot: 'signature', signature: true, fits: ['casey'] },
    jadeFan: { label: 'Jade fan', slot: 'signature', signature: true, fits: ['ping'] },
    warAxe: { label: 'War axe', slot: 'signature', signature: true, fits: ['cockpenis'] },
    bigWrench: { label: 'Big wrench', slot: 'signature', signature: true, fits: ['piecer'] },
    cardFan: { label: 'Card fan', slot: 'signature', signature: true, fits: ['josserkid'] },
  };
  const INFO = {
    panda: { label: 'Panda', battleType: 'Fluff', hero: false, signature: null },
    armedPanda: { label: 'Armed Panda', battleType: 'Steel', hero: false, signature: null },
    nacam: { label: 'NACAM Ogre', battleType: 'Brute', hero: false, signature: null },
    cam: { label: 'CAM', battleType: 'Glam', hero: false, signature: null },
    casey: { label: 'Casey', battleType: 'Legend', hero: true, signature: 'stormHammer' },
    ping: { label: 'Ping', battleType: 'Legend', hero: true, signature: 'jadeFan' },
    cockpenis: { label: 'Cock Penis', battleType: 'Legend', hero: true, signature: 'warAxe' },
    piecer: { label: 'The Piecer Captain', battleType: 'Legend', hero: true, signature: 'bigWrench' },
    josserkid: { label: 'The Josserkid', battleType: 'Legend', hero: true, signature: 'cardFan' },
  };
  const ANIMS = ['idle', 'attack', 'throw', 'cast', 'guard', 'hit', 'faint', 'cheer', 'walk'];

  // ---------------------------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------------------------
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (t) => t * t * (3 - 2 * t);
  const EASE = {
    l: (t) => t,
    i: (t) => t * t,
    o: (t) => 1 - (1 - t) * (1 - t),
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    s: (t) => 1 - Math.pow(1 - t, 4),
    b: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  };
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let seedCounter = 7;
  const nextSeed = () => (seedCounter = (seedCounter * 48271) % 2147483647);
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _tm = new THREE.Matrix4(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  function compose(T) {
    const p = T.p || [0, 0, 0];
    const s = T.s == null ? [1, 1, 1] : typeof T.s === 'number' ? [T.s, T.s, T.s] : T.s;
    if (T.q) _q.copy(T.q);
    else if (T.r) _q.setFromEuler(_e.set(T.r[0], T.r[1], T.r[2], T.o || 'XYZ'));
    else _q.identity();
    return new THREE.Matrix4().compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  }
  // A frame sitting on the surface of an ellipsoid (centre C, radii R) at yaw (from +Z toward +X) and pitch.
  // Local z = surface normal, local x = along the surface toward +X, local y = up along the surface.
  function surf(C, R, yaw, pitch, lift = 0, roll = 0) {
    const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
    const p = new THREE.Vector3(C[0] + R[0] * dx, C[1] + R[1] * dy, C[2] + R[2] * dz);
    const n = new THREE.Vector3(dx / R[0], dy / R[1], dz / R[2]).normalize();
    p.addScaledVector(n, lift);
    const up = Math.abs(n.y) > 0.97 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, n).normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    const m = new THREE.Matrix4().makeBasis(x, y, n);
    if (roll) m.multiply(new THREE.Matrix4().makeRotationZ(roll));
    m.setPosition(p);
    return m;
  }
  const detail = (m) => (m >= 0.095 ? 'hi' : m >= 0.035 ? 'mid' : 'lo');
  const cylDetail = (r) => (r >= 0.055 ? 'hi' : r >= 0.022 ? 'mid' : 'lo');

  // ---------------------------------------------------------------------------------------------
  // Materials (one table, three renderings)
  // ---------------------------------------------------------------------------------------------
  // t: surface type. f: flags ('n' no toon outline, 'd' double sided). e/ei/gk: emissive colour, base intensity,
  // and how strongly the animation "glow" channel (cast, idle shimmer) adds to it. team: follows the team colour.
  const MAT = {
    fur: { c: '#f7f4ec', t: 'fur' },
    ink: { c: '#1c1b17', t: 'soft' },
    nose: { c: '#1c1b17', t: 'gloss' },
    eye: { c: '#15130f', t: 'gloss', f: 'n' },
    glint: { c: '#ffffff', t: 'gloss', f: 'n' },
    team: { c: '#d64a2b', t: 'cloth', team: 1 },
    teamDark: { c: '#9c3520', t: 'cloth', team: 0.66 },
    teamGloss: { c: '#d64a2b', t: 'gloss', team: 1 },
    teamPlate: { c: '#d64a2b', t: 'gloss', team: 1, f: 'd' },
    cream: { c: '#fff6e6', t: 'soft' },
    ogre: { c: '#6f8a3a', t: 'skin' },
    ogreWar: { c: '#5f7b32', t: 'skin' },
    ogreDark: { c: '#4b6423', t: 'skin' },
    wart: { c: '#98ab55', t: 'skin' },
    earIn: { c: '#94604a', t: 'skin' },
    eyeRage: { c: '#17130f', t: 'gloss', f: 'n', e: '#ff4a1f', ei: 0, gk: 1.3, gt: 0.8 },
    tusk: { c: '#f3ead2', t: 'gloss' },
    teeth: { c: '#fffdf5', t: 'gloss' },
    hair: { c: '#2b2118', t: 'soft' },
    glam: { c: '#e8b64a', t: 'glam', e: '#f0c870', ei: 0, gk: 0.3, gt: 0.7 },
    glamHi: { c: '#f0c870', t: 'glam', e: '#fff0b0', ei: 0, gk: 0.3, gt: 0.7 },
    camHair: { c: '#6b3e1f', t: 'gloss' },
    skin: { c: '#f1c39c', t: 'skin' },
    tan: { c: '#dc9f70', t: 'skin' },
    pale: { c: '#f6d7bd', t: 'skin' },
    blush: { c: '#ea8f7a', t: 'skin' },
    lip: { c: '#a8503f', t: 'soft' },
    blond: { c: '#f3cf68', t: 'soft' },
    brownHair: { c: '#6d4526', t: 'soft' },
    wood: { c: '#94602f', t: 'wood' },
    woodDark: { c: '#5e3b1d', t: 'wood' },
    rope: { c: '#c49f60', t: 'soft' },
    bamboo: { c: '#86b545', t: 'gloss' },
    bambooNode: { c: '#5c8e2a', t: 'gloss' },
    bambooCut: { c: '#eadb9f', t: 'soft' },
    tin: { c: '#aeb5bb', t: 'metal' },
    iron: { c: '#7c848c', t: 'metal' },
    darkIron: { c: '#4b5057', t: 'metal' },
    steel: { c: '#d5dce2', t: 'metal' },
    gold: { c: '#e8b33a', t: 'metal' },
    bell: { c: '#f1c23e', t: 'metal', e: '#ffcf4a', ei: 0, gk: 0.55, gt: 0.7 },
    leather: { c: '#83522b', t: 'soft' },
    leatherDark: { c: '#58361c', t: 'soft' },
    furBrown: { c: '#8e6a45', t: 'fur' },
    furLight: { c: '#cfae84', t: 'fur' },
    jade: { c: '#2e8d6a', t: 'cloth' },
    jadeDark: { c: '#1f6a4f', t: 'cloth' },
    glowJade: { c: '#a8f5d2', t: 'glow', e: '#4fffb0', ei: 0.2, gk: 1.1 },
    silk: { c: '#ffffff', t: 'map', map: 'fan' },
    hivis: { c: '#ff7a1c', t: 'cloth' },
    reflect: { c: '#eef3f6', t: 'metal' },
    hardhat: { c: '#ffcb1f', t: 'gloss' },
    denim: { c: '#3e5c87', t: 'cloth' },
    shirt: { c: '#5d7ea3', t: 'cloth' },
    glove: { c: '#c79b52', t: 'soft' },
    boot: { c: '#4b3423', t: 'soft' },
    cable: { c: '#2d2d30', t: 'gloss' },
    purple: { c: '#7040aa', t: 'cloth' },
    green: { c: '#3f9d4d', t: 'cloth' },
    mask: { c: '#2a1d3d', t: 'gloss', f: 'd' },
    capeRed: { c: '#b3262d', t: 'cloth', f: 'dn' },
    tunic: { c: '#3b4f6b', t: 'cloth' },
    trouser: { c: '#4d3c2d', t: 'cloth' },
    glowBlue: { c: '#b8ecff', t: 'glow', e: '#5fcaff', ei: 0.55, gk: 1.3 },
    eyeGlow: { c: '#15130f', t: 'gloss', f: 'n', e: '#8fdcff', ei: 0, gk: 1.1, gt: 0.8 },
    gem: { c: '#c98bff', t: 'glow', e: '#a64dff', ei: 0.85, gk: 0.9 },
    white: { c: '#ffffff', t: 'soft' },
    sclera: { c: '#fbf7ee', t: 'gloss', f: 'n' },
    pupil: { c: '#1c1b17', t: 'gloss', f: 'n' },
    stone: { c: '#a39a8c', t: 'rough' },
    stoneDark: { c: '#857c70', t: 'rough' },
    feather: { c: '#f4efe6', t: 'soft' },
    string: { c: '#f1e8d0', t: 'basic', f: 'n' },
    scar: { c: '#d8a08c', t: 'skin' },
    cards: { c: '#ffffff', t: 'map', map: 'cards' },
    roof: { c: '#d64a2b', t: 'gloss', team: 0.9 },
  };
  const TOY = {
    matte: { roughness: 0.46, clearcoat: 0.62, clearcoatRoughness: 0.24, sheen: 0.3, sheenRoughness: 0.5 },
    soft: { roughness: 0.4, clearcoat: 0.75, clearcoatRoughness: 0.2 },
    fur: { roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.26, sheen: 0.45, sheenRoughness: 0.45 },
    gloss: { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 },
    skin: { roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.26 },
    cloth: { roughness: 0.56, clearcoat: 0.35, clearcoatRoughness: 0.38, sheen: 0.45, sheenRoughness: 0.5 },
    metal: { metalness: 0.86, roughness: 0.26, clearcoat: 0.45, clearcoatRoughness: 0.16 },
    wood: { roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.26 },
    glam: { metalness: 0.36, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 },
    glow: { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
    rough: { roughness: 0.8, clearcoat: 0.2, clearcoatRoughness: 0.5 },
    map: { roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.22 },
  };
  const LOW = {
    matte: { roughness: 0.84 },
    soft: { roughness: 0.82 }, fur: { roughness: 0.9 }, gloss: { roughness: 0.5 }, skin: { roughness: 0.8 },
    cloth: { roughness: 0.9 }, metal: { roughness: 0.38, metalness: 0.55 }, wood: { roughness: 0.85 },
    glam: { roughness: 0.42, metalness: 0.28 }, glow: { roughness: 0.6 }, rough: { roughness: 0.95 }, map: { roughness: 0.8 },
  };
  let rampTex = null;
  function toonRamp() {
    if (rampTex) return rampTex;
    const data = new Uint8Array([150, 208, 255]);
    rampTex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    rampTex.minFilter = rampTex.magFilter = THREE.NearestFilter;
    rampTex.generateMipmaps = false;
    rampTex.needsUpdate = true;
    return rampTex;
  }
  function teamShade(key, hex) {
    const spec = MAT[key];
    const c = new THREE.Color(hex);
    if (spec && spec.team && spec.team !== 1) {
      const hsl = {};
      c.getHSL(hsl);
      c.setHSL(hsl.h, hsl.s, clamp(hsl.l * spec.team, 0.04, 0.9));
    }
    return c;
  }
  function makeMaterial(style, key, teamHex) {
    let S = MAT[key];
    let vc = false;
    if (!S && key.startsWith('vc:')) {
      const [, t, f] = key.split(':');
      S = { c: '#ffffff', t, f };
      vc = true;
    }
    S = S || MAT.ink;
    const color = S.team ? teamShade(key, teamHex || '#d64a2b') : new THREE.Color(S.c);
    const side = S.f && S.f.includes('d') ? THREE.DoubleSide : THREE.FrontSide;
    const map = S.map ? texture(S.map) : null;
    let m;
    if (S.t === 'basic') m = new THREE.MeshBasicMaterial({ color, side });
    else if (style === 'toy') {
      m = new THREE.MeshPhysicalMaterial(Object.assign({ color, side, map }, TOY[S.t] || TOY.soft));
      if (m.sheen > 0) m.sheenColor = vc ? new THREE.Color('#ffffff') : color.clone().lerp(new THREE.Color('#ffffff'), 0.55);
    } else if (style === 'lowpoly') {
      m = new THREE.MeshStandardMaterial(Object.assign({ color, side, map, flatShading: true, metalness: 0 }, LOW[S.t] || LOW.soft));
    } else {
      const c2 = S.t === 'metal' && !vc ? color.clone().lerp(new THREE.Color('#ffffff'), 0.12) : color;
      m = new THREE.MeshToonMaterial({ color: c2, side, map, gradientMap: toonRamp() });
    }
    if (vc) m.vertexColors = true;
    const u = m.userData;
    u.key = key;
    u.e = new THREE.Color(S.e || (S.t === 'glow' ? S.c : '#000000'));
    u.ei = S.ei || 0;
    u.gk = S.gk || 0;
    u.gt = S.gt || 0;
    if (m.emissive) m.emissive.copy(u.e).multiplyScalar(u.ei);
    return m;
  }
  function outlineMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#1c1b17') }, uK: { value: 0.0024 }, uOpacity: { value: 1 } },
      vertexShader: [
        'attribute vec3 onormal;',
        'uniform float uK;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vec3 n = normalize(normalMatrix * onormal);',
        '  float t = clamp(-mv.z * uK, 0.0045, 0.03);',
        '  mv.xyz += n * t;',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uOpacity;',
        'void main() {',
        '  gl_FragColor = vec4(uColor, uOpacity);',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
      side: THREE.BackSide,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Canvas textures (painted fan silk, a deck of oversized cards, banner flags)
  // ---------------------------------------------------------------------------------------------
  const texCache = {};
  function canvas(w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function finishTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawSuit(g, suit, x, y, s) {
    g.beginPath();
    if (suit === 'heart') {
      g.moveTo(x, y + s * 0.9);
      g.bezierCurveTo(x - s * 1.3, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.45);
      g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.3, y - s * 0.1, x, y + s * 0.9);
      g.fill();
    } else if (suit === 'diamond') {
      g.moveTo(x, y - s);
      g.lineTo(x + s * 0.7, y);
      g.lineTo(x, y + s);
      g.lineTo(x - s * 0.7, y);
      g.closePath();
      g.fill();
    } else if (suit === 'spade') {
      g.moveTo(x, y - s * 0.95);
      g.bezierCurveTo(x + s * 1.3, y + s * 0.05, x + s * 0.6, y + s * 0.9, x, y + s * 0.35);
      g.bezierCurveTo(x - s * 0.6, y + s * 0.9, x - s * 1.3, y + s * 0.05, x, y - s * 0.95);
      g.fill();
      g.beginPath();
      g.moveTo(x, y + s * 0.3);
      g.lineTo(x + s * 0.3, y + s);
      g.lineTo(x - s * 0.3, y + s);
      g.closePath();
      g.fill();
    } else if (suit === 'club') {
      for (const [dx, dy] of [[0, -0.45], [-0.45, 0.15], [0.45, 0.15]]) {
        g.beginPath();
        g.arc(x + dx * s, y + dy * s, s * 0.38, 0, TAU);
        g.fill();
      }
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + s * 0.3, y + s);
      g.lineTo(x - s * 0.3, y + s);
      g.closePath();
      g.fill();
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -HALF + (i * PI) / 5, r = i % 2 ? s * 0.42 : s;
        g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }
  }
  function texture(name) {
    if (texCache[name] !== undefined) return texCache[name];
    let t = null;
    if (name === 'fan') {
      const c = canvas(256, 256);
      if (c) {
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(128, 128, 30, 128, 128, 130);
        grd.addColorStop(0, '#fcf5e3');
        grd.addColorStop(1, '#ecd7ab');
        g.fillStyle = grd;
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = '#d4482c';
        g.beginPath();
        g.arc(172, 80, 32, 0, TAU);
        g.fill();
        g.lineCap = 'round';
        for (const [x0, w, lean] of [[86, 13, 0.1], [118, 9, 0.16]]) {
          g.strokeStyle = '#3d7534';
          g.lineWidth = w;
          for (let y = 262; y > 20; y -= 50) {
            g.beginPath();
            g.moveTo(x0 + (262 - y) * lean, y);
            g.lineTo(x0 + (262 - y + 44) * lean, y - 44);
            g.stroke();
          }
        }
        g.fillStyle = '#4c8c3a';
        for (const [x, y, a] of [[124, 70, -0.5], [146, 58, -0.15], [104, 112, 0.6], [138, 126, -0.9], [158, 104, 0.25], [96, 150, 0.9]]) {
          g.save();
          g.translate(x, y);
          g.rotate(a);
          g.beginPath();
          g.ellipse(20, 0, 26, 7, 0, 0, TAU);
          g.fill();
          g.restore();
        }
        g.fillStyle = '#b8322a';
        g.fillRect(52, 176, 30, 30);
        g.fillStyle = '#fcf5e3';
        g.fillRect(58, 182, 18, 4);
        g.fillRect(58, 190, 18, 4);
        g.fillRect(65, 182, 4, 19);
        t = finishTex(c);
      }
    } else if (name === 'cards') {
      const W = 128, H = 184, c = canvas(W * 5, H);
      if (c) {
        const g = c.getContext('2d');
        const cards = [['A', 'spade'], ['K', 'heart'], ['Q', 'diamond'], ['J', 'club'], ['J', 'joker']];
        cards.forEach(([rank, suit], i) => {
          const x = i * W;
          g.fillStyle = '#fffaf0';
          roundRect(g, x + 4, 4, W - 8, H - 8, 14);
          g.fill();
          g.lineWidth = 5;
          g.strokeStyle = '#7040aa';
          roundRect(g, x + 4, 4, W - 8, H - 8, 14);
          g.stroke();
          const col = suit === 'joker' ? '#7040aa' : suit === 'heart' || suit === 'diamond' ? '#c8322a' : '#1c1b17';
          g.fillStyle = col;
          g.font = 'bold 34px Georgia, serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(rank, x + 24, 30);
          drawSuit(g, suit, x + 24, 62, 11);
          drawSuit(g, suit, x + W / 2, H / 2 + 6, 34);
          g.save();
          g.translate(x + W - 24, H - 30);
          g.rotate(PI);
          g.fillText(rank, 0, 0);
          g.restore();
        });
        t = finishTex(c);
      }
    }
    texCache[name] = t;
    return t;
  }
  // Card i of the atlas, as a UV rectangle.
  const cardUV = (i) => [i / 5, 0, (i + 1) / 5, 1];

  // ---------------------------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------------------------
  const QUALITY = {
    toy: { sph: { hi: [24, 16], mid: [15, 10], lo: [10, 7] }, cyl: { hi: 18, mid: 12, lo: 8 }, tor: [8, 24], lathe: 24, curve: 10, bevel: 2 },
    lowpoly: { sph: { hi: 'ico1', mid: [7, 5], lo: [6, 4] }, cyl: { hi: 7, mid: 6, lo: 5 }, tor: [4, 10], lathe: 9, curve: 3, bevel: 0 },
    toon: { sph: { hi: [18, 12], mid: [12, 9], lo: [8, 6] }, cyl: { hi: 14, mid: 10, lo: 7 }, tor: [6, 18], lathe: 16, curve: 7, bevel: 1 },
  };
  // Outline normals: averaged per position so the inverted hull has no cracks along hard edges.
  function addOutlineNormals(g) {
    const pos = g.attributes.position, nor = g.attributes.normal;
    const map = new Map();
    const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    for (let i = 0; i < pos.count; i++) {
      const k = key(i);
      let a = map.get(k);
      if (!a) map.set(k, (a = [0, 0, 0]));
      a[0] += nor.getX(i);
      a[1] += nor.getY(i);
      a[2] += nor.getZ(i);
    }
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const a = map.get(key(i));
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      out[i * 3] = a[0] / l;
      out[i * 3 + 1] = a[1] / l;
      out[i * 3 + 2] = a[2] / l;
    }
    g.setAttribute('onormal', new THREE.BufferAttribute(out, 3));
  }
  function prep(g, toon) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (toon && !g.attributes.onormal) addOutlineNormals(g);
    return g;
  }
  function superEllipsoid(ws, hs, e) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const p = g.attributes.position, n = g.attributes.normal;
    const f = (x) => Math.sign(x) * Math.pow(Math.abs(x), e);
    const k = 2 / e - 1;
    for (let i = 0; i < p.count; i++) {
      const x = f(p.getX(i)), y = f(p.getY(i)), z = f(p.getZ(i));
      p.setXYZ(i, x, y, z);
      const nx = Math.sign(x) * Math.pow(Math.abs(x), k), ny = Math.sign(y) * Math.pow(Math.abs(y), k), nz = Math.sign(z) * Math.pow(Math.abs(z), k);
      const l = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(i, nx / l, ny / l, nz / l);
    }
    return g;
  }
  function dentedHemi(ws, hs) {
    const g = new THREE.SphereGeometry(1, ws, hs, 0, TAU, 0, HALF);
    const p = g.attributes.position;
    const dents = [[0.55, 0.65, 0.52, 0.09, 0.32], [-0.62, 0.45, 0.2, 0.06, 0.28], [0.2, 0.55, -0.8, 0.05, 0.3]];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let d = 0;
      for (const [dx, dy, dz, depth, w] of dents) {
        const l = Math.hypot(dx, dy, dz);
        const a = Math.acos(clamp((x * dx + y * dy + z * dz) / l, -1, 1));
        d += depth * Math.exp(-(a * a) / (w * w));
      }
      p.setXYZ(i, x * (1 - d), y * (1 - d), z * (1 - d));
    }
    g.computeVertexNormals();
    return g;
  }
  function lumpyRock(detailLevel, seed) {
    const g = new THREE.IcosahedronGeometry(1, detailLevel);
    const p = g.attributes.position;
    const rnd = mulberry32(seed);
    const bumps = [0, 1, 2, 3, 4].map(() => [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 0.1 + rnd() * 0.14]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let d = 1;
      for (const [bx, by, bz, a] of bumps) d -= a * Math.max(0, (x * bx + y * by + z * bz) / Math.hypot(bx, by, bz)) ** 3;
      p.setXYZ(i, x * d, y * d * 0.85, z * d);
    }
    g.computeVertexNormals();
    return g;
  }
  function extrude(shape, depth, K, bevel, plane) {
    const Q = K.Q;
    const useBevel = Q.bevel > 0 && bevel > 0;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: useBevel, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: Math.max(1, Q.bevel), curveSegments: Q.curve,
    });
    g.translate(0, 0, -depth / 2);
    if (plane === 'xz') g.rotateX(HALF); // shape (u, v) -> (x = u, z = v); thickness along y
    if (plane === 'yz') g.rotateY(HALF); // shape (u, v) -> (z = -u, y = v); thickness along x
    return g;
  }
  const SHAPES = {
    axeBlade() {
      const s = new THREE.Shape();
      s.moveTo(0.0, -0.075);
      s.lineTo(0.09, -0.1);
      s.quadraticCurveTo(0.2, -0.18, 0.29, -0.235);
      s.quadraticCurveTo(0.41, 0, 0.29, 0.235);
      s.quadraticCurveTo(0.2, 0.18, 0.09, 0.1);
      s.lineTo(0.0, 0.075);
      s.closePath();
      return s;
    },
    wrench() {
      const s = new THREE.Shape();
      const hc = 0.42, R = 0.092, a0 = Math.atan2(-Math.sqrt(R * R - 0.03 * 0.03), 0.03);
      const lip = Math.atan2(Math.sqrt(R * R - 0.036 * 0.036), 0.036);
      s.moveTo(0.03, -0.08);
      s.lineTo(0.03, hc - Math.sqrt(R * R - 0.03 * 0.03));
      s.absarc(0, hc, R, a0, lip, false);
      s.lineTo(0.036, hc + 0.015);
      s.absarc(0, hc + 0.015, 0.036, 0, -PI, true);
      s.lineTo(-0.036, hc + Math.sqrt(R * R - 0.036 * 0.036));
      s.absarc(0, hc, R, PI - lip, PI - a0 + TAU * 0, false);
      s.lineTo(-0.03, -0.08);
      s.absarc(0, -0.08, 0.03, PI, TAU, false);
      const hole = new THREE.Path();
      hole.absarc(0, -0.075, 0.012, 0, TAU, true);
      s.holes.push(hole);
      return s;
    },
    wing() {
      // a bird wing sticking out sideways: base at the helmet, tip up and out, scalloped feathers below
      const s = new THREE.Shape();
      s.moveTo(0, 0.035);
      s.quadraticCurveTo(0.05, 0.15, 0.2, 0.2);
      s.quadraticCurveTo(0.215, 0.15, 0.17, 0.13);
      s.quadraticCurveTo(0.185, 0.085, 0.13, 0.085);
      s.quadraticCurveTo(0.135, 0.035, 0.08, 0.035);
      s.quadraticCurveTo(0.06, -0.01, 0, -0.02);
      s.closePath();
      return s;
    },
    glaiveBlade() {
      const s = new THREE.Shape();
      s.moveTo(-0.022, 0);
      s.lineTo(-0.028, 0.12);
      s.quadraticCurveTo(-0.02, 0.25, 0.055, 0.31);
      s.quadraticCurveTo(0.065, 0.16, 0.034, 0.0);
      s.closePath();
      return s;
    },
    crest() {
      const s = new THREE.Shape();
      s.moveTo(-0.1, 0);
      s.quadraticCurveTo(-0.12, 0.08, -0.02, 0.11);
      s.quadraticCurveTo(0.1, 0.12, 0.13, 0.03);
      s.lineTo(0.1, 0);
      s.closePath();
      return s;
    },
  };

  const kits = {};
  function kit(style) {
    if (kits[style]) return kits[style];
    const Q = QUALITY[style];
    const toon = style === 'toon';
    const cache = new Map();
    const get = (key, make) => {
      let g = cache.get(key);
      if (!g) {
        g = prep(make(), toon);
        cache.set(key, g);
      }
      return g;
    };
    const sphSpec = (d) => Q.sph[d] || Q.sph.mid;
    const K = {
      style, Q, cache,
      sphere: (d = 'hi') => get('sph' + d, () => {
        const s = sphSpec(d);
        return s === 'ico1' ? new THREE.IcosahedronGeometry(1, 1) : new THREE.SphereGeometry(1, s[0], s[1]);
      }),
      hemi: (d = 'hi') => get('hemi' + d, () => {
        let s = sphSpec(d);
        if (!Array.isArray(s)) s = [9, 6];
        return new THREE.SphereGeometry(1, s[0], Math.max(2, Math.ceil(s[1] / 2)), 0, TAU, 0, HALF);
      }),
      halfHemi: (side) => get('hh' + side, () => {
        let s = sphSpec('hi');
        if (!Array.isArray(s)) s = [9, 6];
        return new THREE.SphereGeometry(1, Math.ceil(s[0] / 2), Math.max(2, Math.ceil(s[1] / 2)), side > 0 ? HALF : -HALF, PI, 0, HALF);
      }),
      dented: () => get('dented', () => {
        let s = sphSpec('hi');
        if (!Array.isArray(s)) s = [9, 8];
        return dentedHemi(s[0], Math.ceil(s[1] / 2) + 2);
      }),
      cyl: (ratio, open, d = 'mid') => {
        ratio = Math.round(clamp(ratio, 0, 1) * 40) / 40;
        return get(`cyl${ratio}${open ? 'o' : 'c'}${d}`, () => new THREE.CylinderGeometry(ratio, 1, 1, Q.cyl[d] || Q.cyl.mid, 1, open));
      },
      torus: (tube, arc = TAU, d = 'mid') => {
        tube = Math.round(tube * 100) / 100;
        const segs = d === 'lo' ? [Math.max(3, Q.tor[0] - 3), Math.max(6, Math.round(Q.tor[1] * 0.6))] : Q.tor;
        return get(`tor${tube}_${arc.toFixed(3)}${d}`, () => new THREE.TorusGeometry(1, tube, segs[0], Math.max(3, Math.round((segs[1] * arc) / TAU)), arc));
      },
      arcTube: (ratio, phiStart, phiLen) => {
        ratio = Math.round(ratio * 200) / 200;
        return get(`arct${ratio}_${phiStart.toFixed(3)}_${phiLen.toFixed(3)}`, () => {
          const pts = [];
          const n = Math.max(4, Q.tor[0]);
          for (let i = 0; i <= n; i++) {
            const a = -HALF + (i / n) * TAU;
            pts.push(new THREE.Vector2(1 + ratio * Math.cos(a), ratio * Math.sin(a)));
          }
          return new THREE.LatheGeometry(pts, Math.max(3, Math.round((Q.lathe * phiLen) / TAU)), phiStart, phiLen);
        });
      },
      rbox: (e = 0.35) => get('rbox' + e, () => (style === 'lowpoly' ? superEllipsoid(8, 4, Math.max(0.3, e)) : superEllipsoid(Q.sph.mid[0], Q.sph.mid[1], e))),
      box: () => get('box', () => new THREE.BoxGeometry(2, 2, 2)),
      lathe: (name, pts, phiStart = 0, phiLen = TAU) => get(`lathe:${name}:${phiStart.toFixed(3)}:${phiLen.toFixed(3)}`, () =>
        new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), Math.max(3, Math.round((Q.lathe * phiLen) / TAU)), phiStart, phiLen)),
      shape: (name, depth, bevel, plane) => get(`shape:${name}:${depth}:${bevel}:${plane}`, () => extrude(SHAPES[name](), depth, K, bevel, plane)),
      rock: (seed = 1) => get('rock' + seed, () => lumpyRock(style === 'lowpoly' ? 0 : 1, seed)),
      custom: (name, make) => get('c:' + name, () => make(Q, style)),
    };
    kits[style] = K;
    return K;
  }

  // Merge a list of parts (geometry + matrix) into one geometry.
  function mergeParts(parts, toon) {
    let nv = 0, ni = 0;
    for (const P of parts) {
      const g = P.geo;
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const on = toon ? new Float32Array(nv * 3) : null;
    const col = parts[0].color ? new Float32Array(nv * 3) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nm = new THREE.Matrix3(), v = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const P of parts) {
      const g = P.geo, m = P.m;
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, oa = g.attributes.onormal;
      nm.getNormalMatrix(m);
      const flip = m.determinant() < 0;
      const r = P.uv;
      for (let i = 0; i < pa.count; i++) {
        const o3 = (vo + i) * 3;
        v.fromBufferAttribute(pa, i).applyMatrix4(m);
        pos[o3] = v.x; pos[o3 + 1] = v.y; pos[o3 + 2] = v.z;
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        nor[o3] = v.x; nor[o3 + 1] = v.y; nor[o3 + 2] = v.z;
        if (on) {
          v.fromBufferAttribute(oa || na, i).applyMatrix3(nm).normalize();
          on[o3] = v.x; on[o3 + 1] = v.y; on[o3 + 2] = v.z;
        }
        if (col) {
          col[o3] = P.color.r; col[o3 + 1] = P.color.g; col[o3 + 2] = P.color.b;
        }
        if (ua) {
          let a = ua.getX(i), b = ua.getY(i);
          if (r) {
            a = r[0] + a * (r[2] - r[0]);
            b = r[1] + b * (r[3] - r[1]);
          }
          uv[(vo + i) * 2] = a;
          uv[(vo + i) * 2 + 1] = b;
        }
      }
      if (g.index) {
        const ix = g.index;
        for (let t = 0; t < ix.count; t += 3) {
          const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
          idx[io++] = vo + a;
          idx[io++] = vo + (flip ? c : b);
          idx[io++] = vo + (flip ? b : c);
        }
      } else {
        for (let t = 0; t < pa.count; t += 3) {
          idx[io++] = vo + t;
          idx[io++] = vo + (flip ? t + 2 : t + 1);
          idx[io++] = vo + (flip ? t + 1 : t + 2);
        }
      }
      vo += pa.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (on) out.setAttribute('onormal', new THREE.BufferAttribute(on, 3));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Builder: parts are authored in figure space (feet at y=0, facing +Z, rest pose) and assigned to bones.
  // Gear held in a hand is authored in the hand's local frame (grip at origin, shaft along +Z) with {local:true}.
  // ---------------------------------------------------------------------------------------------
  class Builder {
    constructor(K, rest) {
      this.K = K;
      this.rest = rest || {};
      this.parts = [];
      this.stack = [];
      this.bones = [];
    }
    frame(m, fn) {
      const top = this.stack.length ? this.stack[this.stack.length - 1].clone().multiply(m) : m.clone();
      this.stack.push(top);
      fn();
      this.stack.pop();
    }
    bone(name, parent, pos, local) {
      this.bones.push({ name, parent, pos, local: !!local });
      if (!local) this.rest[name] = pos;
    }
    add(bone, geo, mat, T, o = {}) {
      // hands never rotate on their own, so their parts ride on the forearm (fewer draw calls)
      if (!o.local && (bone === 'handL' || bone === 'handR')) bone = bone === 'handL' ? 'foreL' : 'foreR';
      const m = T && T.isMatrix4 ? T.clone() : compose(T || {});
      if (this.stack.length) m.premultiply(this.stack[this.stack.length - 1]);
      if (!o.local) {
        const r = this.rest[bone];
        if (!r) throw new Error('Models: unknown bone ' + bone);
        m.premultiply(_tm.makeTranslation(-r[0], -r[1], -r[2]));
      }
      const spec = MAT[mat];
      this.parts.push({ bone, geo, mat, m, ol: o.ol !== false && !(spec && spec.f && spec.f.includes('n')), uv: o.uv || null });
    }
    sph(bone, mat, p, s, o = {}) {
      const S = typeof s === 'number' ? [s, s, s] : s;
      this.add(bone, this.K.sphere(o.d || detail(Math.max(S[0], S[1], S[2]))), mat, { p, s: S, r: o.r, q: o.q, o: o.order }, o);
    }
    hemi(bone, mat, p, s, o = {}) {
      const S = typeof s === 'number' ? [s, s, s] : s;
      this.add(bone, this.K.hemi(o.d || detail(Math.max(S[0], S[1], S[2]))), mat, { p, s: S, r: o.r, q: o.q }, o);
    }
    rbox(bone, mat, p, s, o = {}) {
      const S = typeof s === 'number' ? [s, s, s] : s;
      this.add(bone, this.K.rbox(o.e || 0.35), mat, { p, s: S, r: o.r, q: o.q, o: o.order }, o);
    }
    box(bone, mat, p, s, o = {}) {
      const S = typeof s === 'number' ? [s, s, s] : s;
      this.add(bone, this.K.box(), mat, { p, s: S, r: o.r, q: o.q, o: o.order }, o);
    }
    cyl(bone, mat, p, r, h, o = {}) {
      this.add(bone, this.K.cyl(o.ratio == null ? 1 : o.ratio, !!o.open, o.d || cylDetail(r)), mat, { p, s: [r, h, o.rz == null ? r : o.rz], r: o.r, q: o.q }, o);
    }
    // Tapered cylinder from a to b with spherical joints.
    seg(bone, mat, a, b, r0, r1 = r0, o = {}) {
      let P0 = _v1.set(a[0], a[1], a[2]).clone(), P1 = _v2.set(b[0], b[1], b[2]).clone();
      let rA = r0, rB = r1;
      if (rB > rA) {
        [P0, P1] = [P1, P0];
        [rA, rB] = [rB, rA];
      }
      const dir = P1.clone().sub(P0);
      const len = dir.length();
      if (len < 1e-5) return;
      dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
      const mid = P0.clone().add(P1).multiplyScalar(0.5);
      this.add(bone, this.K.cyl(rA > 0 ? rB / rA : 1, o.closed ? false : true, o.d || cylDetail(rA)), mat, { p: [mid.x, mid.y, mid.z], q, s: [rA, len, rA] }, o);
      if (o.caps !== false) {
        if (o.capA !== false && r0 > 0.003) this.sph(bone, mat, a, r0, o);
        if (o.capB !== false && r1 > 0.003) this.sph(bone, mat, b, r1, o);
      }
    }
    chain(bone, mat, pts, radii, o = {}) {
      for (let i = 0; i < pts.length - 1; i++) this.seg(bone, mat, pts[i], pts[i + 1], radii[i], radii[i + 1], Object.assign({}, o, { capA: i === 0 ? o.capA !== false : false }));
    }
    ring(bone, mat, c, rx, rz, tube, o = {}) {
      const g = this.K.torus(tube / rx, o.arc || TAU, o.d || (tube > 0.03 ? 'mid' : 'lo'));
      this.add(bone, g, mat, { p: c, r: [HALF + (o.tilt || 0), o.yaw || 0, o.phase || 0], o: 'YXZ', s: [rx, rz, rx] }, o);
    }
    lathe(bone, mat, name, pts, o = {}) {
      this.add(bone, this.K.lathe(name, pts, o.phiStart || 0, o.phiLen || TAU), mat, { p: o.p || [0, 0, 0], s: [1, 1, o.zs || 1], r: o.r }, o);
    }
    // Partial ring (arc of a torus) using the lathe convention: phi = 0 at +Z, increasing toward +X.
    arcRing(bone, mat, c, R, tube, phiStart, phiLen, o = {}) {
      this.add(bone, this.K.arcTube(tube / R, phiStart, phiLen), mat, { p: c, s: [R, R, R * (o.zs || 1)] }, o);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Rig
  // ---------------------------------------------------------------------------------------------
  const HIER = [
    ['mover', null], ['hips', 'mover'], ['torso', 'hips'], ['head', 'torso'], ['eyes', 'head'], ['ko', 'head'], ['jaw', 'head'],
    ['hatL', 'head'], ['hatR', 'head'], ['cape', 'torso'], ['tail', 'torso'], ['back', 'torso'],
    ['armL', 'torso'], ['foreL', 'armL'], ['handL', 'foreL'], ['off', 'handL'], ['heldL', 'handL'],
    ['armR', 'torso'], ['foreR', 'armR'], ['handR', 'foreR'], ['wpn', 'handR'], ['heldR', 'handR'],
    ['legL', 'hips'], ['shinL', 'legL'], ['legR', 'hips'], ['shinR', 'legR'],
  ];
  function fullRest(def) {
    const r = Object.assign({ mover: [0, 0, 0] }, def.rest);
    const mir = (p) => [-p[0], p[1], p[2]];
    for (const n of ['arm', 'fore', 'hand', 'leg', 'shin', 'hat']) if (r[n + 'L'] && !r[n + 'R']) r[n + 'R'] = mir(r[n + 'L']);
    if (!r.shinL) { r.shinL = r.legL; r.shinR = r.legR; }
    r.ko = r.ko || r.eyes;
    r.jaw = r.jaw || r.head;
    r.hatL = r.hatL || r.head;
    r.hatR = r.hatR || r.head;
    r.cape = r.cape || r.torso;
    r.tail = r.tail || r.torso;
    r.back = r.back || r.torso;
    r.off = r.handL;
    r.heldL = r.handL;
    r.wpn = r.handR;
    r.heldR = r.handR;
    return r;
  }
  function makeBones(rest, root) {
    const B = {};
    for (const [name, parent] of HIER) {
      const g = new THREE.Group();
      g.name = name;
      const p = rest[name] || [0, 0, 0];
      const pp = parent ? rest[parent] || [0, 0, 0] : [0, 0, 0];
      g.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      (parent ? B[parent] : root).add(g);
      B[name] = g;
    }
    B.ko.visible = false;
    B.heldL.visible = false;
    B.heldR.visible = false;
    return B;
  }

  // ---------------------------------------------------------------------------------------------
  // Characters
  // ---------------------------------------------------------------------------------------------
  // Two bean eyes with glints (in the 'eyes' bone, so they can blink) and KO crosses (in the 'ko' bone).
  function beanEyes(b, C, R, yaw, pitch, size, o = {}) {
    const mat = o.mat || 'eye', ko = o.ko || 'ink';
    for (const sd of [1, -1]) {
      const E = surf(C, R, yaw * sd, pitch, size[2] * (o.lift == null ? 0.35 : o.lift));
      b.frame(E, () => {
        b.sph('eyes', mat, [0, 0, 0], size);
        b.sph('eyes', 'glint', [-size[0] * 0.32, size[1] * 0.38, size[2] * 0.72], size[0] * 0.36);
        for (const a of [0.785, -0.785]) b.rbox('ko', ko, [0, 0, size[2] * 0.4], [size[0] * 1.25, size[0] * 0.28, size[2] * 0.35], { r: [0, 0, a] });
      });
    }
  }

  // ---- Pandas ----
  const PANDA_REST = {
    hips: [0, 0.2, 0], torso: [0, 0.2, 0], head: [0, 0.6, 0], eyes: [0, 0.81, 0.215], jaw: [0, 0.72, 0.12],
    armL: [0.2, 0.5, 0.035], foreL: [0.2, 0.4, 0.035], handL: [0.2, 0.3, 0.035],
    legL: [0.11, 0.2, 0.02], tail: [0, 0.24, -0.2], cape: [0, 0.56, -0.15], back: [0, 0.42, -0.22],
  };
  const PANDA_HEAD = { c: [0, 0.79, 0.01], r: [0.235, 0.205, 0.215] };
  function pandaHead(b, o = {}) {
    const C = PANDA_HEAD.c, R = PANDA_HEAD.r;
    b.sph('head', 'fur', C, R, { d: 'hi' });
    for (const sd of [1, -1]) b.sph('head', 'fur', [0.095 * sd, 0.72, 0.085], [0.13, 0.115, 0.12]);
    b.sph('head', 'fur', [0, 0.715, 0.152], [0.1, 0.075, 0.09]);
    b.sph('head', 'nose', [0, 0.752, 0.236], [0.038, 0.026, 0.024]);
    b.add('head', b.K.torus(0.22, PI * 0.72, 'lo'), 'ink', { p: [0, 0.716, 0.241], r: [-0.2, 0, PI * 1.5 - PI * 0.36], s: 0.024 });
    const earY = o.earsUp ? 0.975 : 0.948, earX = o.earsUp ? 0.172 : 0.165;
    for (const sd of [1, -1]) {
      b.sph('head', 'ink', [earX * sd, earY, -0.02], [0.076, 0.074, 0.046], { r: [0, 0, -0.35 * sd] });
      const F = surf(C, R, 0.42 * sd, 0.1, 0, 0.5 * sd);
      b.frame(F, () => {
        b.sph('head', 'ink', [0, -0.01, 0], [0.057, 0.064, 0.026]);
        b.sph('head', 'ink', [0.003 * sd, 0.03, -0.002], [0.042, 0.052, 0.024]);
      });
      const E = surf(C, R, 0.42 * sd, 0.1, 0.022);
      b.frame(E, () => {
        b.sph('eyes', 'eye', [0, -0.004, 0], [0.03, 0.032, 0.02]);
        b.sph('eyes', 'glint', [-0.011, 0.012, 0.016], 0.0115);
        for (const a of [0.785, -0.785]) b.rbox('ko', 'glint', [0, 0, 0.012], [0.036, 0.009, 0.007], { r: [0, 0, a] });
      });
    }
  }
  function pandaBody(b, o = {}) {
    if (!o.robe) {
      b.sph('torso', 'fur', [0, 0.35, 0], [0.25, 0.25, 0.23], { d: 'hi' });
      b.sph('torso', 'ink', [0, 0.45, -0.042], [0.252, 0.148, 0.206], { d: 'hi' });
      b.sph('torso', 'fur', [0, 0.25, -0.212], 0.05);
    }
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      if (!o.noArms) {
        b.seg('arm' + L, 'ink', [0.2 * sd, 0.5, 0.035], [0.2 * sd, 0.4, 0.035], 0.064, 0.06);
        b.seg('fore' + L, 'ink', [0.2 * sd, 0.4, 0.035], [0.2 * sd, 0.31, 0.035], 0.06, 0.058, { capA: false });
        b.sph('hand' + L, 'ink', [0.2 * sd, 0.29, 0.04], [0.068, 0.072, 0.07]);
      }
      b.seg('leg' + L, 'ink', [0.11 * sd, 0.2, 0.02], [0.11 * sd, 0.085, 0.03], 0.086, 0.086, { capB: false });
      b.sph('leg' + L, 'ink', [0.11 * sd, 0.056, 0.05], [0.092, 0.057, 0.114]);
    }
  }
  function pandaScarf(b) {
    b.ring('torso', 'team', [0, 0.598, 0.005], 0.118, 0.11, 0.046, { tilt: 0.14 });
    b.sph('torso', 'team', [0.06, 0.57, 0.12], [0.036, 0.032, 0.03]);
    b.rbox('torso', 'team', [0.083, 0.5, 0.168], [0.036, 0.072, 0.014], { r: [0.42, 0, 0.22] });
    b.rbox('torso', 'teamDark', [0.083, 0.5, 0.169], [0.037, 0.012, 0.0145], { r: [0.42, 0, 0.22], ol: false });
  }
  function bodyEll(y, cy, rx, ry) {
    const t = (y - cy) / ry;
    return rx * Math.sqrt(Math.max(0, 1 - t * t));
  }
  function pandaTabard(b) {
    const pts = [];
    const off = 0.014;
    pts.push([bodyEll(0.19, 0.35, 0.25, 0.25) + off + 0.035, 0.155]);
    for (let i = 0; i <= 8; i++) {
      const y = 0.19 + (0.34 * i) / 8;
      pts.push([bodyEll(y, 0.35, 0.25, 0.25) + off, y]);
    }
    b.lathe('torso', 'team', 'pandaTabard', pts, { zs: 0.93 });
    b.ring('torso', 'leather', [0, 0.3, 0], 0.262, 0.245, 0.02);
    b.rbox('torso', 'gold', [0, 0.3, 0.247], [0.034, 0.028, 0.012]);
    const E = surf([0, 0.35, 0], [0.264, 0.264, 0.246], 0, 0.36, 0.004);
    b.frame(E, () => {
      b.sph('torso', 'cream', [0, 0, 0], [0.052, 0.052, 0.01]);
      b.sph('torso', 'teamDark', [0, 0.004, 0.006], [0.022, 0.026, 0.008], { ol: false });
    });
  }

  // ---- Ogres (NACAM, and the Warlord at 1.23x) ----
  function ogreRest(S) {
    const P = (x, y, z) => [x * S, y * S, z * S];
    return {
      hips: P(0, 0.36, 0), torso: P(0, 0.36, 0), head: P(0, 0.98, 0.1), eyes: P(0, 1.097, 0.245), jaw: P(0, 1.035, 0.15),
      armL: P(0.37, 0.86, 0), foreL: P(0.4, 0.62, 0.02), handL: P(0.41, 0.38, 0.05),
      legL: P(0.15, 0.36, 0), tail: P(0, 0.42, -0.2), cape: P(0, 0.95, -0.2), back: P(0, 0.8, -0.26),
    };
  }
  const OGRE_HEAD = (S) => ({ c: [0, 1.08 * S, 0.13 * S], r: [0.145 * S, 0.14 * S, 0.14 * S] });
  function ogre(b, S, war) {
    const P = (x, y, z) => [x * S, y * S, z * S];
    const k = (v) => v * S;
    const skin = war ? 'ogreWar' : 'ogre';
    // torso: pot belly, barrel chest, hump, droopy pecs
    b.sph('torso', skin, P(0, 0.5, 0.06), [k(0.27), k(0.22), k(0.24)], { d: 'hi' });
    b.sph('torso', skin, P(0, 0.74, 0), [k(0.36), k(0.28), k(0.27)], { d: 'hi' });
    b.sph('torso', skin, P(0, 0.93, -0.08), [k(0.28), k(0.16), k(0.2)], { d: 'hi' });
    for (const sd of [1, -1]) b.sph('torso', skin, P(0.13 * sd, 0.77, 0.17), [k(0.15), k(0.12), k(0.1)], { r: [0.2, 0, 0] });
    b.sph('torso', 'ogreDark', P(0, 0.5, 0.297), k(0.02), { ol: false });
    b.seg('torso', skin, P(0, 0.9, 0.04), P(0, 1.0, 0.1), k(0.13), k(0.12));
    // head
    const H = OGRE_HEAD(S), C = H.c, R = H.r;
    b.sph('head', skin, C, R, { d: 'hi' });
    b.sph('head', skin, P(0, 1.134, 0.222), [k(0.135), k(0.046), k(0.066)]);
    b.seg('head', 'hair', P(-0.1, 1.15, 0.258), P(0, 1.132, 0.28), k(0.021), k(0.019));
    b.seg('head', 'hair', P(0, 1.132, 0.28), P(0.1, 1.15, 0.258), k(0.019), k(0.021), { capA: false });
    beanEyes(b, C, R, 0.34, 0.12, [k(0.024), k(0.022), k(0.016)], { mat: 'eyeRage', lift: 0.3 });
    b.sph('head', 'ogreDark', P(0.005, 1.062, 0.28), [k(0.052), k(0.047), k(0.046)]);
    b.sph('head', 'wart', P(0.035, 1.078, 0.318), k(0.013));
    b.sph('head', 'wart', P(0.1, 1.1, 0.215), k(0.016));
    b.sph('head', 'wart', P(-0.065, 1.19, 0.2), k(0.012));
    // underbite jaw with tusks (the jaw bone can open for roars)
    b.sph('jaw', skin, P(0, 0.992, 0.215), [k(0.128), k(0.066), k(0.105)]);
    b.sph('jaw', 'ogreDark', P(0, 1.022, 0.283), [k(0.085), k(0.022), k(0.035)], { ol: false });
    for (const sd of [1, -1]) b.seg('jaw', 'tusk', P(0.064 * sd, 1.02, 0.28), P(0.078 * sd, war ? 1.115 : 1.085, 0.3), k(0.02), k(0.004));
    for (const x of [-0.025, 0.02]) b.rbox('jaw', 'tusk', P(x, 1.035, 0.298), [k(0.012), k(0.012), k(0.008)]);
    // mismatched ears: a big droopy one and a small pointy one
    b.sph('head', skin, P(0.155, 1.075, 0.09), [k(0.075), k(0.052), k(0.024)], { r: [0.1, -0.35, -0.65] });
    b.sph('head', 'earIn', P(0.162, 1.073, 0.103), [k(0.045), k(0.028), k(0.01)], { r: [0.1, -0.35, -0.65], ol: false });
    b.seg('head', skin, P(-0.12, 1.1, 0.1), P(-0.2, 1.16, 0.085), k(0.032), k(0.003));
    // a few sad hairs
    for (const [x, z, a] of [[-0.02, 0.1, -0.3], [0.02, 0.12, 0.2], [0.0, 0.07, 0.05]]) b.seg('head', 'hair', P(x, 1.21, z), P(x + a * 0.08, 1.285, z - 0.01), k(0.009), k(0.003));
    // arms: massive shoulders, Popeye forearms, fists like boulders
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.sph('arm' + L, skin, P(0.37 * sd, 0.87, 0), k(0.165), { d: 'hi' });
      b.seg('arm' + L, skin, P(0.37 * sd, 0.84, 0), P(0.4 * sd, 0.62, 0.02), k(0.115), k(0.1), { capA: false });
      b.sph('arm' + L, skin, P(0.395 * sd, 0.73, 0.045), [k(0.11), k(0.12), k(0.11)]);
      b.seg('fore' + L, skin, P(0.4 * sd, 0.62, 0.02), P(0.41 * sd, 0.41, 0.05), k(0.1), k(0.085), { capA: false });
      b.sph('fore' + L, skin, P(0.405 * sd, 0.53, 0.035), [k(0.118), k(0.12), k(0.118)], { d: 'hi' });
      b.sph('hand' + L, skin, P(0.41 * sd, 0.345, 0.06), [k(0.1), k(0.106), k(0.1)], { d: 'hi' });
      for (let i = -1; i <= 1; i++) b.sph('hand' + L, skin, P((0.41 + i * 0.04) * sd, 0.3, 0.12), k(0.034));
      b.seg('leg' + L, skin, P(0.15 * sd, 0.36, 0), P(0.16 * sd, 0.13, 0.02), k(0.125), k(0.105), { capB: false });
      b.sph('leg' + L, skin, P(0.16 * sd, 0.062, 0.07), [k(0.122), k(0.066), k(0.16)], { d: 'hi' });
      for (let i = 0; i < 3; i++) b.sph('leg' + L, 'tusk', P((0.115 + 0.045 * i) * sd, 0.045, 0.218 - Math.abs(i - 1) * 0.018), k(0.022), { ol: false });
    }
    // loincloth
    b.ring('hips', 'rope', P(0, 0.375, 0.03), k(0.252), k(0.222), k(0.024));
    b.sph('hips', 'team', P(0, 0.33, 0.02), [k(0.236), k(0.12), k(0.212)]);
    b.rbox('hips', 'team', P(0, 0.235, 0.21), [k(0.12), k(0.125), k(0.018)], { r: [0.14, 0, 0] });
    b.rbox('hips', 'team', P(0, 0.245, -0.2), [k(0.13), k(0.12), k(0.018)], { r: [-0.14, 0, 0] });
    b.rbox('hips', 'teamDark', P(0, 0.12, 0.225), [k(0.122), k(0.014), k(0.02)], { r: [0.14, 0, 0], ol: false });
    if (!war) return;
    // ---- Warlord extras: war paint, scars, fur pauldrons, iron spike crown, chest strap ----
    for (const sd of [1, -1]) {
      for (const dy of [0, 0.032]) {
        const F = surf(C, R, 0.6 * sd, -0.12 - dy * 4, 0.003, 0.25 * sd);
        b.frame(F, () => b.rbox('head', 'team', [0, 0, 0], [k(0.042), k(0.008), k(0.006)], { ol: false }));
      }
    }
    b.frame(surf(C, R, -0.28, 0.2, 0.002, 0.3), () => b.rbox('head', 'scar', [0, 0, 0], [k(0.006), k(0.05), k(0.005)], { ol: false }));
    for (const [yaw, pitch, rl] of [[0.25, 0.15, 0.7], [-0.3, -0.25, -0.5]]) {
      b.frame(surf(P(0, 0.74, 0), [k(0.36), k(0.28), k(0.27)], yaw, pitch, 0.003, rl), () => b.rbox('torso', 'scar', [0, 0, 0], [k(0.007), k(0.07), k(0.006)], { ol: false }));
    }
    for (const sd of [1, -1]) {
      b.frame(surf(P(0, 0.74, 0), [k(0.36), k(0.28), k(0.27)], 0.45 * sd, 0.18, 0.004, 0.2 * sd), () => {
        b.rbox('torso', 'team', [0, 0.025, 0], [k(0.07), k(0.011), k(0.008)], { ol: false });
        b.rbox('torso', 'team', [0, -0.012, 0], [k(0.07), k(0.011), k(0.008)], { ol: false });
      });
    }
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      for (const [dx, dy, dz, r] of [[0, 0.09, 0, 0.12], [0.08, 0.04, 0.08, 0.09], [0.08, 0.04, -0.08, 0.09], [0.12, 0.0, 0, 0.085], [-0.04, 0.06, 0.1, 0.08]]) {
        b.sph('arm' + L, 'furBrown', P((0.37 + dx) * sd, 0.87 + dy, dz), k(r));
      }
      b.hemi('arm' + L, 'iron', P(0.39 * sd, 0.955, 0), [k(0.16), k(0.1), k(0.16)], { r: [0, 0, -0.4 * sd] });
      b.sph('arm' + L, 'darkIron', P(0.43 * sd, 1.02, 0), k(0.025), { ol: false });
      b.seg('fore' + L, 'darkIron', P(0.403 * sd, 0.56, 0.03), P(0.408 * sd, 0.45, 0.045), k(0.118), k(0.1), { caps: false, closed: true });
    }
    // crown
    b.ring('head', 'darkIron', P(0, 1.185, 0.12), k(0.132), k(0.13), k(0.022));
    for (let i = 0; i < 7; i++) {
      const a = -1.35 + (i * 2.7) / 6;
      const x = Math.sin(a) * 0.13, z = 0.12 + Math.cos(a) * 0.13;
      b.seg('head', 'darkIron', P(x, 1.19, z), P(x * 1.12, i === 3 ? 1.33 : 1.28, 0.12 + (z - 0.12) * 1.12), k(0.022), k(0.002));
    }
    b.sph('head', 'gem', P(0, 1.205, 0.255), k(0.02), { ol: false });
    // chest strap and big belt
    b.add('torso', b.K.torus(0.08, TAU, 'mid'), 'leather', { p: P(0.0, 0.75, 0.0), r: [0, HALF, 0.72], o: 'ZYX', s: [k(0.285), k(0.34), k(0.285)] });
    b.ring('hips', 'leatherDark', P(0, 0.39, 0.035), k(0.262), k(0.232), k(0.04));
    b.cyl('hips', 'darkIron', P(0, 0.39, 0.27), k(0.055), k(0.02), { r: [HALF, 0, 0] });
    b.sph('hips', 'furBrown', P(0, 0.12, 0.23), [k(0.13), k(0.03), k(0.03)], { r: [0.14, 0, 0] });
  }

  // ---- CAM ----
  const CAM_REST = {
    hips: [0, 0.64, 0], torso: [0, 0.64, 0], head: [0, 1.16, 0], eyes: [0, 1.312, 0.098], jaw: [0, 1.24, 0.03],
    armL: [0.265, 1.07, 0], foreL: [0.28, 0.85, 0.005], handL: [0.29, 0.65, 0.015],
    legL: [0.1, 0.64, 0], shinL: [0.1, 0.34, 0.01], cape: [0, 1.1, -0.12], back: [0, 0.95, -0.15], tail: [0, 0.7, -0.15],
  };
  const CAM_HEAD = { c: [0, 1.3, 0.0], r: [0.1, 0.122, 0.11] };
  function cam(b) {
    // legs
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.seg('leg' + L, 'glam', [0.1 * sd, 0.64, 0], [0.1 * sd, 0.35, 0.01], 0.088, 0.064);
      b.sph('leg' + L, 'glam', [0.104 * sd, 0.46, 0.022], [0.082, 0.12, 0.078]);
      b.seg('shin' + L, 'glam', [0.1 * sd, 0.34, 0.01], [0.1 * sd, 0.085, 0.0], 0.062, 0.044, { capA: false });
      b.sph('shin' + L, 'glam', [0.1 * sd, 0.25, -0.022], [0.064, 0.095, 0.066]);
      b.rbox('shin' + L, 'white', [0.1 * sd, 0.048, 0.05], [0.058, 0.042, 0.104], { e: 0.45 });
      b.rbox('shin' + L, 'teamDark', [0.1 * sd, 0.012, 0.05], [0.061, 0.013, 0.108], { e: 0.3 });
      b.rbox('shin' + L, 'team', [0.139 * sd, 0.05, 0.05], [0.022, 0.016, 0.06], { e: 0.4, ol: false });
      // shorts leg openings
      b.seg('leg' + L, 'team', [0.1 * sd, 0.63, 0.0], [0.103 * sd, 0.53, 0.012], 0.1, 0.097, { caps: false, closed: true });
    }
    // shorts
    b.lathe('hips', 'team', 'camShorts', [[0.195, 0.54], [0.2, 0.6], [0.192, 0.68], [0.175, 0.73], [0.15, 0.748]], { zs: 0.74 });
    b.ring('hips', 'teamDark', [0, 0.738, 0], 0.17, 0.126, 0.016);
    // V torso
    b.lathe('torso', 'glam', 'camTorso', [[0.0, 0.68], [0.14, 0.7], [0.15, 0.78], [0.18, 0.88], [0.235, 0.98], [0.255, 1.05], [0.24, 1.1], [0.17, 1.15], [0.06, 1.175], [0, 1.18]], { zs: 0.62 });
    for (const sd of [1, -1]) {
      b.sph('torso', 'glam', [0.088 * sd, 0.995, 0.108], [0.098, 0.074, 0.058], { r: [0.12, 0.12 * sd, 0.12 * sd] });
      for (let r = 0; r < 3; r++) b.rbox('torso', 'glamHi', [0.042 * sd, 0.89 - r * 0.068, 0.095 - r * 0.004], [0.034, 0.028, 0.02], { e: 0.55, r: [0.08, 0.12 * sd, 0] });
      b.sph('torso', 'glam', [0.13 * sd, 1.115, -0.01], [0.1, 0.05, 0.08], { r: [0, 0, 0.3 * sd] });
    }
    b.seg('torso', 'glam', [0, 1.13, 0], [0, 1.2, 0.012], 0.058, 0.055);
    // head
    const C = CAM_HEAD.c, R = CAM_HEAD.r;
    b.sph('head', 'glam', C, R, { d: 'hi' });
    b.rbox('head', 'glam', [0, 1.236, 0.022], [0.084, 0.062, 0.085], { e: 0.5 });
    b.sph('head', 'glam', [0, 1.198, 0.085], [0.04, 0.026, 0.024]);
    b.sph('head', 'glam', [0, 1.29, 0.11], [0.018, 0.03, 0.022]);
    for (const sd of [1, -1]) b.sph('head', 'glam', [0.099 * sd, 1.3, 0.0], [0.02, 0.034, 0.026]);
    beanEyes(b, C, R, 0.36, 0.1, [0.017, 0.02, 0.012]);
    b.rbox('head', 'camHair', [0.042, 1.343, 0.1], [0.03, 0.008, 0.01], { r: [0, 0, -0.22] });
    b.rbox('head', 'camHair', [-0.042, 1.337, 0.103], [0.03, 0.008, 0.01], { r: [0, 0, 0.05] });
    // confident grin
    b.add('head', b.K.torus(0.34, PI * 0.8, 'lo'), 'teeth', { p: [0.004, 1.236, 0.1], r: [-0.15, 0, PI * 1.5 - PI * 0.4 + 0.08], s: [0.036, 0.03, 0.03] });
    b.sph('head', 'lip', [0.004, 1.228, 0.1], [0.028, 0.012, 0.01], { ol: false });
    // swept hair
    b.sph('head', 'camHair', [0, 1.362, -0.022], [0.106, 0.066, 0.112]);
    b.sph('head', 'camHair', [0, 1.33, -0.072], [0.1, 0.08, 0.06]);
    b.sph('head', 'camHair', [0.012, 1.405, 0.03], [0.086, 0.048, 0.1], { r: [-0.55, 0.08, 0.12] });
    b.sph('head', 'camHair', [0.03, 1.425, -0.035], [0.07, 0.04, 0.085], { r: [-0.25, 0.25, 0.2] });
    for (const sd of [1, -1]) b.sph('head', 'camHair', [0.09 * sd, 1.33, 0.02], [0.022, 0.05, 0.04]);
    // headband with tails
    b.ring('head', 'team', [0, 1.352, 0.0], 0.108, 0.117, 0.017, { tilt: 0.12 });
    for (const sd of [1, -1]) b.rbox('head', 'team', [0.022 * sd, 1.3, -0.128], [0.014, 0.05, 0.006], { r: [-0.3, 0, 0.25 * sd] });
    // arms
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.sph('arm' + L, 'glam', [0.265 * sd, 1.075, 0], 0.086);
      b.seg('arm' + L, 'glam', [0.265 * sd, 1.06, 0], [0.28 * sd, 0.86, 0.005], 0.058, 0.05, { capA: false });
      b.sph('arm' + L, 'glamHi', [0.278 * sd, 0.95, 0.03], [0.06, 0.075, 0.062]);
      b.seg('fore' + L, 'glam', [0.28 * sd, 0.85, 0.005], [0.29 * sd, 0.67, 0.015], 0.05, 0.039, { capA: false });
      b.sph('fore' + L, 'glam', [0.284 * sd, 0.8, 0.01], [0.054, 0.06, 0.054]);
      b.sph('hand' + L, 'glam', [0.29 * sd, 0.625, 0.02], [0.048, 0.052, 0.05]);
    }
  }

  // ---- Casey the Norse God ----
  const CASEY_REST = {
    hips: [0, 0.8, 0], torso: [0, 0.8, 0], head: [0, 1.44, 0], eyes: [0, 1.602, 0.125], jaw: [0, 1.52, 0.05],
    armL: [0.31, 1.36, 0], foreL: [0.33, 1.08, 0.005], handL: [0.34, 0.82, 0.02],
    legL: [0.13, 0.8, 0], shinL: [0.13, 0.41, 0.01], cape: [0, 1.41, -0.12], back: [0, 1.15, -0.2], tail: [0, 0.85, -0.2],
  };
  const CASEY_HEAD = { c: [0, 1.585, 0.01], r: [0.115, 0.135, 0.125] };
  const capeProfile = [[0.36, 0.3], [0.33, 0.62], [0.29, 0.95], [0.25, 1.22], [0.215, 1.4], [0.2, 1.44]];
  function casey(b) {
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.seg('leg' + L, 'trouser', [0.13 * sd, 0.8, 0], [0.13 * sd, 0.42, 0.01], 0.1, 0.08);
      b.seg('shin' + L, 'trouser', [0.13 * sd, 0.41, 0.01], [0.13 * sd, 0.3, 0.005], 0.078, 0.074, { capA: false });
      b.seg('shin' + L, 'leather', [0.13 * sd, 0.3, 0.005], [0.13 * sd, 0.08, 0.012], 0.086, 0.08, { capB: false });
      b.ring('shin' + L, 'furBrown', [0.13 * sd, 0.3, 0.005], 0.09, 0.09, 0.034);
      b.rbox('shin' + L, 'leather', [0.13 * sd, 0.052, 0.06], [0.082, 0.052, 0.13], { e: 0.45 });
      b.rbox('shin' + L, 'leatherDark', [0.13 * sd, 0.012, 0.06], [0.086, 0.012, 0.134], { e: 0.3 });
    }
    b.lathe('torso', 'tunic', 'caseyTunic', [[0.245, 0.6], [0.232, 0.66], [0.218, 0.76], [0.222, 0.86], [0.238, 0.98], [0.262, 1.12], [0.272, 1.24], [0.252, 1.34], [0.2, 1.4], [0.12, 1.44], [0.06, 1.45]], { zs: 0.72 });
    b.frame(surf([0, 1.2, 0], [0.272, 0.2, 0.196], 0, 0.15, 0.003), () => {
      b.sph('torso', 'gold', [0, 0, 0], [0.032, 0.032, 0.01]);
      b.sph('torso', 'glowBlue', [0, 0, 0.006], [0.014, 0.014, 0.006], { ol: false });
    });
    b.ring('torso', 'gold', [0, 0.612, 0], 0.244, 0.176, 0.013);
    b.ring('torso', 'leather', [0, 0.86, 0], 0.228, 0.166, 0.032);
    b.rbox('torso', 'gold', [0, 0.86, 0.185], [0.055, 0.042, 0.016]);
    b.seg('torso', 'darkIron', [-0.022, 0.885, 0.2], [0.012, 0.855, 0.2], 0.007, 0.007, { ol: false });
    b.seg('torso', 'darkIron', [0.012, 0.855, 0.2], [-0.012, 0.85, 0.2], 0.007, 0.007, { ol: false });
    b.seg('torso', 'darkIron', [-0.012, 0.85, 0.2], [0.02, 0.825, 0.2], 0.007, 0.007, { ol: false });
    b.ring('torso', 'furBrown', [0, 1.4, -0.015], 0.2, 0.165, 0.066);
    b.seg('torso', 'skin', [0, 1.38, 0], [0, 1.48, 0.012], 0.066, 0.064);
    // cape (its own bone so it can flutter)
    const cs = PI - 1.25, cl = 2.5;
    b.lathe('cape', 'capeRed', 'caseyCape', capeProfile, { phiStart: cs, phiLen: cl });
    b.arcRing('cape', 'team', [0, 0.3, 0], 0.36, 0.024, cs, cl);
    for (const ph of [cs, cs + cl]) b.chain('cape', 'team', capeProfile.map(([r, y]) => [r * Math.sin(ph), y, r * Math.cos(ph)]), capeProfile.map(() => 0.02));
    for (const sd of [1, -1]) b.sph('torso', 'gold', [0.19 * sd, 1.425, -0.05], 0.034);
    // head
    const C = CASEY_HEAD.c, R = CASEY_HEAD.r;
    b.sph('head', 'skin', C, R, { d: 'hi' });
    b.sph('head', 'skin', [0, 1.572, 0.132], [0.026, 0.036, 0.03]);
    beanEyes(b, C, R, 0.33, 0.12, [0.019, 0.022, 0.013], { mat: 'eyeGlow' });
    for (const sd of [1, -1]) b.rbox('head', 'blond', [0.047 * sd, 1.637, 0.114], [0.036, 0.012, 0.014], { r: [0, 0, 0.16 * sd] });
    b.sph('head', 'blond', [0, 1.5, 0.062], [0.112, 0.082, 0.088]);
    for (const sd of [1, -1]) {
      b.sph('head', 'blond', [0.088 * sd, 1.545, 0.04], [0.048, 0.075, 0.06]);
      b.sph('head', 'blond', [0.033 * sd, 1.533, 0.126], [0.037, 0.014, 0.016], { r: [0, 0, -0.35 * sd] });
    }
    const braid = [[0, 1.44, 0.1, 0.036], [0, 1.395, 0.106, 0.031], [0, 1.356, 0.106, 0.027], [0, 1.321, 0.101, 0.023], [0, 1.29, 0.096, 0.019]];
    braid.forEach(([x, y, z, r], i) => b.sph('head', 'blond', [x + (i % 2 ? 0.006 : -0.006), y, z], r));
    b.ring('head', 'gold', [0, 1.303, 0.098], 0.021, 0.021, 0.008);
    b.sph('head', 'blond', [0, 1.56, -0.06], [0.13, 0.17, 0.1], { d: 'hi' });
    b.sph('head', 'blond', [0, 1.43, -0.105], [0.14, 0.12, 0.07]);
    for (const sd of [1, -1]) b.chain('head', 'blond', [[0.1 * sd, 1.62, 0.03], [0.12 * sd, 1.5, 0.03], [0.125 * sd, 1.4, 0.05]], [0.036, 0.032, 0.024]);
    // winged helmet
    b.hemi('head', 'steel', [0, 1.622, 0.0], [0.132, 0.118, 0.142], { d: 'hi' });
    b.ring('head', 'gold', [0, 1.628, 0.0], 0.131, 0.141, 0.014);
    b.sph('head', 'gold', [0, 1.742, 0.0], 0.024);
    b.rbox('head', 'gold', [0, 1.69, 0.1], [0.012, 0.06, 0.03], { r: [-0.7, 0, 0] });
    for (const sd of [1, -1]) {
      b.add('head', b.K.shape('wing', 0.018, 0.005, 'xy'), 'feather', { p: [0.118 * sd, 1.642, -0.005], r: [0.05, -0.55 * sd, 0.1 * sd], s: [sd, 1, 1] });
    }
    // arms
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.sph('arm' + L, 'skin', [0.31 * sd, 1.37, 0], 0.096);
      b.seg('arm' + L, 'skin', [0.31 * sd, 1.35, 0], [0.33 * sd, 1.09, 0.005], 0.08, 0.068, { capA: false });
      b.sph('arm' + L, 'skin', [0.325 * sd, 1.22, 0.032], [0.075, 0.09, 0.075]);
      b.seg('fore' + L, 'skin', [0.33 * sd, 1.08, 0.005], [0.34 * sd, 0.84, 0.02], 0.066, 0.055, { capA: false });
      b.seg('fore' + L, 'leather', [0.332 * sd, 1.02, 0.008], [0.338 * sd, 0.87, 0.017], 0.077, 0.068, { caps: false, closed: true });
      b.ring('fore' + L, 'gold', [0.332 * sd, 1.02, 0.008], 0.077, 0.077, 0.011);
      b.ring('fore' + L, 'gold', [0.338 * sd, 0.87, 0.017], 0.068, 0.068, 0.011);
      b.sph('hand' + L, 'skin', [0.34 * sd, 0.8, 0.028], [0.062, 0.066, 0.064]);
    }
  }

  // ---- Ping the Panda Diplomat ----
  const robeProfile = [[0.285, 0.05], [0.29, 0.1], [0.28, 0.2], [0.265, 0.3], [0.25, 0.4], [0.232, 0.48], [0.2, 0.545], [0.14, 0.59], [0.08, 0.61]];
  function ping(b) {
    pandaBody(b, { noArms: true, robe: true });
    b.lathe('torso', 'jade', 'pingRobe', robeProfile, { zs: 0.95 });
    b.ring('torso', 'gold', [0, 0.052, 0], 0.285, 0.271, 0.017);
    b.ring('torso', 'team', [0, 0.33, 0], 0.263, 0.25, 0.03);
    b.sph('torso', 'team', [0.1, 0.32, 0.225], [0.035, 0.032, 0.03]);
    b.rbox('torso', 'team', [0.115, 0.24, 0.235], [0.018, 0.06, 0.008], { r: [0.1, 0, 0.1] });
    b.rbox('torso', 'team', [0.085, 0.235, 0.238], [0.018, 0.055, 0.008], { r: [0.1, 0, -0.15] });
    // wrap collar: a gold band from the left shoulder down to the right hip
    b.frame(surf([0, 0.35, 0], [0.265, 0.265, 0.252], -0.2, 0.62, 0.004, -0.75), () => b.rbox('torso', 'gold', [0, 0, 0], [0.016, 0.1, 0.006], { ol: false }));
    b.frame(surf([0, 0.35, 0], [0.24, 0.265, 0.228], 0.12, 0.8, 0.004, 0.5), () => b.rbox('torso', 'gold', [0, 0, 0], [0.014, 0.05, 0.006], { ol: false }));
    b.ring('torso', 'gold', [0, 0.6, 0.0], 0.1, 0.095, 0.02, { tilt: 0.15 });
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.sph('arm' + L, 'jade', [0.2 * sd, 0.5, 0.035], 0.072);
      b.seg('arm' + L, 'jade', [0.2 * sd, 0.49, 0.035], [0.2 * sd, 0.4, 0.035], 0.07, 0.074, { capA: false });
      b.seg('fore' + L, 'jade', [0.2 * sd, 0.4, 0.035], [0.2 * sd, 0.3, 0.035], 0.074, 0.098, { capA: false, capB: false });
      b.ring('fore' + L, 'gold', [0.2 * sd, 0.305, 0.035], 0.094, 0.094, 0.013);
      b.sph('hand' + L, 'ink', [0.2 * sd, 0.29, 0.04], [0.06, 0.062, 0.062]);
    }
    pandaHead(b);
    // scholar's cap with little stiff wings
    b.cyl('head', 'ink', [0, 0.985, -0.005], 0.118, 0.06, { r: [-0.18, 0, 0], ratio: 0.92 });
    b.sph('head', 'ink', [0, 1.02, -0.045], [0.09, 0.075, 0.075]);
    b.ring('head', 'gold', [0, 0.962, 0.0], 0.121, 0.121, 0.009, { tilt: -0.18 });
    b.sph('head', 'jadeDark', [0, 1.062, -0.03], 0.02);
  }

  // ---- The Piecer Captain ----
  const PIECER_REST = {
    hips: [0, 0.48, 0], torso: [0, 0.48, 0], head: [0, 0.94, 0], eyes: [0, 1.087, 0.12], jaw: [0, 1.0, 0.05],
    armL: [0.28, 0.865, 0], foreL: [0.3, 0.67, 0.02], handL: [0.31, 0.49, 0.04],
    legL: [0.12, 0.48, 0], shinL: [0.12, 0.26, 0.01], back: [0, 0.75, -0.22], cape: [0, 0.9, -0.15], tail: [0, 0.5, -0.2],
  };
  const PIECER_HEAD = { c: [0, 1.07, 0.01], r: [0.13, 0.13, 0.125] };
  function piecer(b) {
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.seg('leg' + L, 'denim', [0.12 * sd, 0.48, 0], [0.12 * sd, 0.27, 0.01], 0.088, 0.077);
      b.seg('shin' + L, 'denim', [0.12 * sd, 0.26, 0.01], [0.12 * sd, 0.16, 0.005], 0.075, 0.073, { capA: false });
      b.seg('shin' + L, 'boot', [0.12 * sd, 0.18, 0.004], [0.12 * sd, 0.07, 0.01], 0.08, 0.08, { capB: false });
      b.rbox('shin' + L, 'boot', [0.12 * sd, 0.048, 0.05], [0.08, 0.048, 0.118], { e: 0.45 });
      b.rbox('shin' + L, 'leatherDark', [0.12 * sd, 0.012, 0.05], [0.084, 0.013, 0.122], { e: 0.3 });
      b.sph('shin' + L, 'darkIron', [0.12 * sd, 0.06, 0.13], [0.06, 0.04, 0.05], { ol: false });
    }
    b.sph('torso', 'shirt', [0, 0.64, 0.025], [0.245, 0.19, 0.2], { d: 'hi' });
    b.sph('torso', 'shirt', [0, 0.78, 0], [0.262, 0.2, 0.2], { d: 'hi' });
    // hi-vis vest, open at the front, with reflective bands
    const vest = [[0.262, 0.56], [0.264, 0.62], [0.266, 0.7], [0.272, 0.78], [0.262, 0.86], [0.222, 0.92], [0.15, 0.955]];
    const vs = 0.32, vl = TAU - 0.64;
    b.lathe('torso', 'hivis', 'piecerVest', vest, { zs: 0.84, phiStart: vs, phiLen: vl });
    for (const y of [0.655, 0.765]) {
      const r = y < 0.7 ? 0.2675 : 0.273;
      b.lathe('torso', 'reflect', 'piecerBand' + y, [[r + 0.004, y - 0.014], [r + 0.004, y + 0.014]], { zs: 0.84, phiStart: vs, phiLen: vl, ol: false });
    }
    // tool belt
    b.ring('torso', 'leather', [0, 0.55, 0.012], 0.262, 0.222, 0.026);
    b.rbox('torso', 'gold', [0, 0.55, 0.238], [0.035, 0.028, 0.012]);
    b.rbox('torso', 'leather', [0.2, 0.5, 0.15], [0.052, 0.062, 0.034], { r: [0, 0.65, 0] });
    b.rbox('torso', 'leatherDark', [0.2, 0.555, 0.15], [0.055, 0.012, 0.037], { r: [0, 0.65, 0] });
    b.rbox('torso', 'leather', [-0.215, 0.505, 0.125], [0.046, 0.056, 0.034], { r: [0, -0.7, 0] });
    b.rbox('torso', 'hardhat', [0.262, 0.53, -0.02], [0.03, 0.036, 0.036], { e: 0.5 });
    b.seg('torso', 'wood', [-0.25, 0.43, 0.04], [-0.262, 0.6, 0.06], 0.014, 0.014);
    b.rbox('torso', 'iron', [-0.262, 0.605, 0.06], [0.046, 0.02, 0.02], { e: 0.4, r: [0, 0.6, 0] });
    // cable coil over the left shoulder
    const coil = new THREE.Matrix4().compose(new THREE.Vector3(0.225, 0.83, 0.015), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.85, 0.45, 'XYZ')), new THREE.Vector3(1, 1, 1));
    b.frame(coil, () => {
      for (let i = 0; i < 3; i++) b.add('torso', b.K.torus(0.15, TAU, 'mid'), i === 1 ? 'hivis' : 'cable', { p: [0.004 * i, 0.006 * i, (i - 1) * 0.024], s: 0.13 + i * 0.004 });
    });
    b.seg('torso', 'cable', [0.2, 0.7, 0.1], [0.18, 0.61, 0.15], 0.016, 0.016);
    b.rbox('torso', 'hardhat', [0.178, 0.595, 0.155], [0.022, 0.03, 0.022], { e: 0.4 });
    // head
    const C = PIECER_HEAD.c, R = PIECER_HEAD.r;
    b.seg('torso', 'tan', [0, 0.92, 0], [0, 0.99, 0.01], 0.075, 0.075);
    b.sph('head', 'tan', C, R, { d: 'hi' });
    for (const sd of [1, -1]) {
      b.sph('head', 'tan', [0.128 * sd, 1.07, 0.0], [0.026, 0.042, 0.032]);
      b.sph('head', 'blush', [0.072 * sd, 1.04, 0.1], [0.032, 0.024, 0.018], { ol: false });
      b.rbox('head', 'brownHair', [0.052 * sd, 1.127, 0.112], [0.042, 0.014, 0.016], { r: [0, 0, -0.1 * sd] });
      b.sph('head', 'brownHair', [0.047 * sd, 1.023, 0.117], [0.056, 0.024, 0.032], { r: [0, 0.1 * sd, -0.28 * sd] });
      b.sph('head', 'brownHair', [0.1 * sd, 1.0, 0.075], [0.03, 0.055, 0.04], { r: [0, 0, 0.2 * sd] });
    }
    b.sph('head', 'blush', [0, 1.064, 0.132], [0.036, 0.034, 0.034]);
    b.sph('head', 'brownHair', [0, 1.03, 0.128], [0.03, 0.022, 0.024]);
    b.sph('head', 'lip', [0, 0.998, 0.118], [0.024, 0.01, 0.01], { ol: false });
    beanEyes(b, C, R, 0.35, 0.14, [0.018, 0.021, 0.013]);
    // hard hat
    b.hemi('head', 'hardhat', [0, 1.112, 0.0], [0.146, 0.118, 0.152], { d: 'hi' });
    b.cyl('head', 'hardhat', [0, 1.117, 0.022], 0.172, 0.012, { rz: 0.19 });
    b.rbox('head', 'hardhat', [0, 1.228, 0.0], [0.022, 0.013, 0.13], { e: 0.4 });
    b.frame(surf([0, 1.112, 0], [0.146, 0.118, 0.152], 0, 0.5, 0.002), () => b.sph('head', 'team', [0, 0, 0], [0.036, 0.036, 0.007], { ol: false }));
    // arms: shirt sleeves rolled to the elbow, gloves, team armband
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R';
      b.sph('arm' + L, 'shirt', [0.28 * sd, 0.87, 0], 0.088);
      b.seg('arm' + L, 'shirt', [0.28 * sd, 0.855, 0], [0.3 * sd, 0.67, 0.02], 0.076, 0.07, { capA: false });
      b.ring('arm' + L, 'shirt', [0.298 * sd, 0.685, 0.018], 0.074, 0.074, 0.018);
      b.seg('fore' + L, 'tan', [0.3 * sd, 0.67, 0.02], [0.31 * sd, 0.51, 0.04], 0.06, 0.052, { capA: false });
      b.ring('hand' + L, 'glove', [0.31 * sd, 0.505, 0.04], 0.056, 0.056, 0.016);
      b.sph('hand' + L, 'glove', [0.31 * sd, 0.47, 0.045], [0.06, 0.064, 0.062]);
    }
    b.ring('armL', 'team', [0.29, 0.775, 0.01], 0.079, 0.079, 0.02);
  }

  // ---- The Josserkid ----
  const JOSS_REST = {
    hips: [0, 0.52, 0], torso: [0, 0.52, 0], head: [0, 0.92, 0], eyes: [0, 1.052, 0.1], jaw: [0, 0.98, 0.05],
    armL: [0.17, 0.865, 0], foreL: [0.19, 0.695, 0.01], handL: [0.2, 0.54, 0.02],
    legL: [0.08, 0.52, 0], shinL: [0.08, 0.275, 0.0], hatL: [0.07, 1.165, 0], back: [0, 0.75, -0.15], cape: [0, 0.85, -0.1], tail: [0, 0.55, -0.15],
  };
  const JOSS_HEAD = { c: [0, 1.04, 0.01], r: [0.1, 0.115, 0.105] };
  const jossTorso = [[0.0, 0.47], [0.12, 0.47], [0.13, 0.52], [0.13, 0.6], [0.145, 0.7], [0.16, 0.8], [0.155, 0.86], [0.12, 0.9], [0.06, 0.93]];
  function josserkid(b) {
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R', legMat = sd > 0 ? 'purple' : 'green', shoeMat = sd > 0 ? 'green' : 'purple';
      b.seg('leg' + L, legMat, [0.08 * sd, 0.52, 0], [0.08 * sd, 0.28, 0.0], 0.052, 0.043);
      b.seg('shin' + L, legMat, [0.08 * sd, 0.275, 0.0], [0.08 * sd, 0.085, 0.0], 0.042, 0.034, { capA: false });
      b.rbox('shin' + L, shoeMat, [0.08 * sd, 0.04, 0.035], [0.046, 0.036, 0.085], { e: 0.5 });
      b.chain('shin' + L, shoeMat, [[0.08 * sd, 0.04, 0.1], [0.08 * sd, 0.058, 0.16], [0.08 * sd, 0.1, 0.17], [0.08 * sd, 0.112, 0.14]], [0.03, 0.02, 0.012, 0.008]);
      b.sph('shin' + L, 'bell', [0.08 * sd, 0.1, 0.135], 0.018);
    }
    b.lathe('torso', 'green', 'jossL', jossTorso, { zs: 0.78, phiStart: 0, phiLen: PI });
    b.lathe('torso', 'purple', 'jossR', jossTorso, { zs: 0.78, phiStart: PI, phiLen: PI });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      b.seg('torso', i % 2 ? 'purple' : 'green', [Math.sin(a) * 0.128, 0.53, Math.cos(a) * 0.1], [Math.sin(a) * 0.16, 0.41, Math.cos(a) * 0.13], 0.046, 0.0, { capA: false });
    }
    b.ring('torso', 'gold', [0, 0.535, 0], 0.133, 0.105, 0.012);
    for (const y of [0.63, 0.71, 0.79]) b.sph('torso', 'bell', [0, y, 0.78 * (y < 0.7 ? 0.138 : 0.153) + 0.004], 0.012, { ol: false });
    // ruff collar in team colour
    b.ring('torso', 'team', [0, 0.912, 0], 0.1, 0.09, 0.032);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      b.seg('torso', i % 2 ? 'cream' : 'team', [Math.sin(a) * 0.08, 0.925, Math.cos(a) * 0.072], [Math.sin(a) * 0.175, 0.87, Math.cos(a) * 0.16], 0.036, 0.0, { capA: false });
    }
    // head
    const C = JOSS_HEAD.c, R = JOSS_HEAD.r;
    b.seg('torso', 'pale', [0, 0.9, 0], [0, 0.97, 0.01], 0.045, 0.045);
    b.sph('head', 'pale', C, R, { d: 'hi' });
    b.sph('head', 'pale', [0, 0.962, 0.05], [0.048, 0.04, 0.045]);
    b.seg('head', 'pale', [0, 1.04, 0.1], [0, 1.02, 0.138], 0.019, 0.005);
    for (const sd of [1, -1]) b.seg('head', 'pale', [0.094 * sd, 1.04, 0.0], [0.14 * sd, 1.085, -0.025], 0.024, 0.004);
    // half mask: a band across the eyes with flicked-up points
    b.add('head', b.K.custom('jossMask', (Q) => new THREE.SphereGeometry(1, Array.isArray(Q.sph.mid) ? Q.sph.mid[0] + 4 : 10, 4, HALF - 1.12, 2.24, 1.2, 0.42)), 'mask', { p: C, s: [R[0] * 1.07, R[1] * 1.07, R[2] * 1.07] });
    for (const sd of [1, -1]) b.seg('head', 'mask', [0.098 * sd, 1.075, 0.045], [0.135 * sd, 1.125, 0.03], 0.018, 0.002);
    for (const sd of [1, -1]) {
      const E = surf(C, [R[0] * 1.07, R[1] * 1.07, R[2] * 1.07], 0.36 * sd, 0.1, 0.004);
      b.frame(E, () => {
        b.sph('eyes', 'sclera', [0, 0, 0], [0.024, 0.017, 0.01]);
        b.sph('eyes', 'pupil', [0.009, -0.002, 0.007], [0.011, 0.012, 0.007]);
        b.sph('eyes', 'glint', [0.005, 0.004, 0.012], 0.004);
        for (const a of [0.785, -0.785]) b.rbox('ko', 'glint', [0, 0, 0.008], [0.026, 0.006, 0.005], { r: [0, 0, a] });
      });
    }
    // sly grin: lopsided smile with a dimple
    b.add('head', b.K.torus(0.2, PI * 0.72, 'lo'), 'ink', { p: [0.008, 0.99, 0.103], r: [-0.1, 0, PI * 1.5 - PI * 0.36 + 0.28], s: 0.034 });
    b.sph('head', 'ink', [0.041, 1.003, 0.094], 0.006, { ol: false });
    // jester hat: split cap, team band, two floppy points with bells
    b.add('head', b.K.halfHemi(1), 'green', { p: [0, 1.1, 0.0], s: [0.113, 0.105, 0.116] });
    b.add('head', b.K.halfHemi(-1), 'purple', { p: [0, 1.1, 0.0], s: [0.113, 0.105, 0.116] });
    b.ring('head', 'team', [0, 1.103, 0], 0.114, 0.118, 0.019);
    for (const sd of [1, -1]) {
      const bone = sd > 0 ? 'hatL' : 'hatR', mat = sd > 0 ? 'green' : 'purple';
      b.chain(bone, mat, [[0.05 * sd, 1.16, 0], [0.14 * sd, 1.265, -0.01], [0.24 * sd, 1.255, -0.02], [0.3 * sd, 1.165, -0.02], [0.312 * sd, 1.075, -0.01]], [0.066, 0.05, 0.036, 0.024, 0.015]);
      b.sph(bone, 'bell', [0.312 * sd, 1.05, -0.01], 0.031);
      b.rbox(bone, 'darkIron', [0.312 * sd, 1.034, 0.018], [0.014, 0.004, 0.006], { ol: false });
    }
    // arms
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R', mat = sd > 0 ? 'purple' : 'green';
      b.sph('arm' + L, mat, [0.17 * sd, 0.87, 0], 0.052);
      b.seg('arm' + L, mat, [0.17 * sd, 0.86, 0], [0.19 * sd, 0.695, 0.01], 0.045, 0.04, { capA: false });
      b.seg('fore' + L, mat, [0.19 * sd, 0.695, 0.01], [0.2 * sd, 0.555, 0.02], 0.04, 0.034, { capA: false });
      b.ring('fore' + L, 'team', [0.2 * sd, 0.56, 0.02], 0.042, 0.042, 0.014);
      b.sph('hand' + L, 'pale', [0.2 * sd, 0.525, 0.025], [0.038, 0.042, 0.04]);
    }
  }

  // Head frames used by hats and helmets.
  const HEADS = {
    panda: PANDA_HEAD, armedPanda: PANDA_HEAD, ping: PANDA_HEAD,
    nacam: OGRE_HEAD(1), cockpenis: OGRE_HEAD(1.23), cam: CAM_HEAD, casey: CASEY_HEAD, piecer: PIECER_HEAD, josserkid: JOSS_HEAD,
  };

  // Per-kind definitions: rest pose of the rig, base (idle) pose offsets, default gear, personality.
  const DEFS = {
    panda: {
      rest: PANDA_REST, gear: [], gs: 1, speed: 1.05,
      base: { aLz: 0.32, aRz: 0.32, aLx: -0.12, aRx: -0.12, fL: -0.25, fR: -0.25 },
      build(b) { pandaBody(b); pandaHead(b); pandaScarf(b); },
      persona: { breath: 1.2, sway: 1, look: 1, arms: 1, jaw: 0, bounce: 0 },
      walk: { cycle: 0.52, leg: 0.42, knee: 0, arm: 0.35, sway: 0.1, twist: 0.06, lean: 0.04, bob: 0.02 },
    },
    armedPanda: {
      rest: PANDA_REST, gear: ['tinHelmet', 'shortSpear'], gs: 1, speed: 1.05,
      base: { aLz: 0.3, aRz: 0.28, aLx: -0.1, aRx: -0.12, fL: -0.25, fR: -0.25 },
      build(b) { pandaBody(b); pandaHead(b, { earsUp: true }); pandaTabard(b); },
      persona: { breath: 1, sway: 0.8, look: 0.8, arms: 0.8, jaw: 0, bounce: 0 },
      walk: { cycle: 0.52, leg: 0.42, knee: 0, arm: 0.3, sway: 0.08, twist: 0.06, lean: 0.05, bob: 0.02 },
    },
    nacam: {
      rest: ogreRest(1), gear: ['club'], gs: 1.35, speed: 0.9,
      base: { tx: 0.28, hdx: -0.3, aLz: 0.2, aRz: 0.2, aLx: 0.02, aRx: 0.02, fL: -0.3, fR: -0.3, jaw: 0.04 },
      build(b) { ogre(b, 1, false); },
      persona: { breath: 1.5, sway: 1.2, look: 1.2, arms: 1.5, jaw: 0.07, bounce: 0 },
      walk: { cycle: 0.78, leg: 0.36, knee: 0, arm: 0.3, sway: 0.13, twist: 0.1, lean: 0.06, bob: 0.02 },
    },
    cam: {
      rest: CAM_REST, gear: [], gs: 1.3, speed: 1.05,
      base: { aLz: 0.3, aRz: 0.3, aLx: 0.02, aRx: 0.02, fL: -0.32, fR: -0.32, hdx: -0.06 },
      build(b) { cam(b); },
      persona: { breath: 1.1, sway: 0.7, look: 0.9, arms: 1, jaw: 0, bounce: 0 },
      walk: { cycle: 0.72, leg: 0.48, knee: 0.7, arm: 0.42, sway: 0.06, twist: 0.1, lean: -0.02, bob: 0.015 },
    },
    casey: {
      rest: CASEY_REST, gear: ['stormHammer'], gs: 1.55, speed: 0.95,
      base: { aLz: 0.2, aRz: 0.22, aLx: 0.02, aRx: 0.0, fL: -0.3, fR: -0.3, hdx: -0.04 },
      build(b) { casey(b); },
      persona: { breath: 0.9, sway: 0.6, look: 0.8, arms: 0.8, jaw: 0, bounce: 0 },
      walk: { cycle: 0.8, leg: 0.44, knee: 0.65, arm: 0.34, sway: 0.05, twist: 0.08, lean: 0.02, bob: 0.012 },
    },
    ping: {
      rest: PANDA_REST, gear: ['jadeFan'], gs: 1, speed: 0.95,
      base: { aLx: -0.5, aRx: -0.5, aLz: 0.12, aRz: 0.12, fL: -1.15, fR: -1.1 },
      build(b) { ping(b); },
      persona: { breath: 0.8, sway: 0.5, look: 0.6, arms: 0.4, jaw: 0, bounce: 0 },
      walk: { cycle: 0.7, leg: 0.3, knee: 0, arm: 0.1, sway: 0.05, twist: 0.03, lean: 0.02, bob: 0.01 },
    },
    cockpenis: {
      rest: ogreRest(1.23), gear: ['warAxe'], gs: 1.6, speed: 0.85,
      base: { tx: 0.24, hdx: -0.26, aLz: 0.24, aRz: 0.22, aLx: 0.02, aRx: 0.0, fL: -0.35, fR: -0.35, jaw: 0.06 },
      build(b) { ogre(b, 1.23, true); },
      persona: { breath: 1.4, sway: 1, look: 1, arms: 1.3, jaw: 0.08, bounce: 0 },
      walk: { cycle: 0.86, leg: 0.34, knee: 0, arm: 0.28, sway: 0.12, twist: 0.1, lean: 0.06, bob: 0.02 },
    },
    piecer: {
      rest: PIECER_REST, gear: ['bigWrench'], gs: 1.25, speed: 1,
      base: { aLz: 0.24, aRz: 0.22, aLx: 0.02, aRx: 0.0, fL: -0.3, fR: -0.3 },
      build(b) { piecer(b); },
      persona: { breath: 1, sway: 1, look: 1, arms: 0.8, jaw: 0, bounce: 0 },
      walk: { cycle: 0.66, leg: 0.42, knee: 0.55, arm: 0.35, sway: 0.08, twist: 0.08, lean: 0.03, bob: 0.015 },
    },
    josserkid: {
      rest: JOSS_REST, gear: ['cardFan'], gs: 1.15, speed: 1.15,
      base: { aLz: 0.34, aRz: 0.2, aLx: 0.05, fL: -0.35, hrz: 0.05, hdz: 0.1, tz: -0.03 },
      build(b) { josserkid(b); },
      persona: { breath: 0.9, sway: 1.3, look: 1.4, arms: 1, jaw: 0, bounce: 0.012 },
      walk: { cycle: 0.6, leg: 0.5, knee: 0.8, arm: 0.45, sway: 0.08, twist: 0.12, lean: 0.03, bob: 0.02, hop: 0.03 },
    },
  };
  for (const k of KINDS) DEFS[k].rest = fullRest(DEFS[k]);

  // ---------------------------------------------------------------------------------------------
  // Gear
  // ---------------------------------------------------------------------------------------------
  // item: what the right hand holds (drives the attack/throw), left: what the left hand holds.
  function bambooShaft(b, bone, z0, z1, r, s) {
    b.seg(bone, 'bamboo', [0, 0, z0], [0, 0, z1], r, r, { local: true });
    for (let z = z0 + 0.1 * s; z < z1 - 0.04 * s; z += 0.15 * s) b.cyl(bone, 'bambooNode', [0, 0, z], r * 1.22, 0.014 * s, { local: true, r: [HALF, 0, 0] });
  }
  const GEAR = {
    shortSpear: {
      item: 'spear', tip: (s) => ['wpn', [0, 0, 0.53 * s]],
      build(b, s) {
        bambooShaft(b, 'wpn', -0.24 * s, 0.4 * s, 0.017 * s, s);
        b.seg('wpn', 'bambooCut', [0, 0, 0.4 * s], [0, 0.004, 0.53 * s], 0.018 * s, 0.0, { local: true, capA: false });
        b.ring('wpn', 'rope', [0, 0, 0.36 * s], 0.02 * s, 0.02 * s, 0.006 * s, { local: true, tilt: -HALF });
      },
    },
    longSpear: {
      item: 'spear', tip: (s) => ['wpn', [0, 0, 0.9 * s]],
      build(b, s) {
        bambooShaft(b, 'wpn', -0.34 * s, 0.74 * s, 0.018 * s, s);
        b.seg('wpn', 'bambooCut', [0, 0, 0.74 * s], [0, 0.006, 0.92 * s], 0.019 * s, 0.0, { local: true, capA: false });
        b.ring('wpn', 'rope', [0, 0, 0.7 * s], 0.021 * s, 0.021 * s, 0.006 * s, { local: true, tilt: -HALF });
        b.ring('wpn', 'rope', [0, 0, 0.66 * s], 0.021 * s, 0.021 * s, 0.006 * s, { local: true, tilt: -HALF });
      },
    },
    glaive: {
      item: 'spear', tip: (s) => ['wpn', [0, 0, 0.98 * s]],
      build(b, s) {
        b.seg('wpn', 'woodDark', [0, 0, -0.3 * s], [0, 0, 0.66 * s], 0.017 * s, 0.017 * s, { local: true });
        b.cyl('wpn', 'iron', [0, 0, 0.665 * s], 0.026 * s, 0.05 * s, { local: true, r: [HALF, 0, 0] });
        b.add('wpn', b.K.shape('glaiveBlade', 0.012, 0.004, 'xz'), 'steel', { p: [0, 0, 0.68 * s], s: s }, { local: true });
        b.seg('wpn', 'iron', [-0.02 * s, 0, 0.66 * s], [-0.07 * s, 0, 0.62 * s], 0.01 * s, 0.0, { local: true });
        b.sph('wpn', 'iron', [0, 0, -0.3 * s], 0.024 * s, { local: true });
        b.seg('wpn', 'team', [0.0, 0, 0.64 * s], [0.012 * s, 0, 0.54 * s], 0.012 * s, 0.003 * s, { local: true });
      },
    },
    club: {
      item: 'club', tip: (s) => ['wpn', [0, 0, 0.48 * s]],
      build(b, s) {
        b.seg('wpn', 'woodDark', [0, 0, -0.1 * s], [0, 0, 0.17 * s], 0.024 * s, 0.03 * s, { local: true });
        b.seg('wpn', 'wood', [0, 0, 0.15 * s], [0, 0, 0.3 * s], 0.032 * s, 0.064 * s, { local: true, capA: false, capB: false });
        b.sph('wpn', 'wood', [0, 0, 0.36 * s], [0.08 * s, 0.08 * s, 0.12 * s], { local: true, d: 'hi' });
        for (const [x, y, z, r] of [[0.07, 0.02, 0.34, 0.032], [-0.06, 0.05, 0.4, 0.03], [0.02, -0.075, 0.42, 0.028], [-0.04, -0.05, 0.3, 0.026], [0.03, 0.06, 0.44, 0.024], [0.0, 0.0, 0.47, 0.03]]) b.sph('wpn', 'wood', [x * s, y * s, z * s], r * s, { local: true });
        for (const [x, y, z, r] of [[0.078, 0.025, 0.345, 0.012], [-0.066, 0.056, 0.405, 0.011], [0.022, -0.082, 0.425, 0.01]]) b.sph('wpn', 'woodDark', [x * s, y * s, z * s], r * s, { local: true, ol: false });
        b.ring('wpn', 'leather', [0, 0, 0.0], 0.03 * s, 0.03 * s, 0.008 * s, { local: true, tilt: -HALF });
        b.ring('wpn', 'leather', [0, 0, 0.05 * s], 0.031 * s, 0.031 * s, 0.008 * s, { local: true, tilt: -HALF });
      },
    },
    spikedClub: {
      item: 'club', tip: (s) => ['wpn', [0, 0, 0.52 * s]],
      build(b, s) {
        GEAR.club.build(b, s);
        b.ring('wpn', 'darkIron', [0, 0, 0.26 * s], 0.06 * s, 0.06 * s, 0.012 * s, { local: true, tilt: -HALF });
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + (i % 2) * 0.3, z = (0.3 + (i % 3) * 0.07) * s, r = (0.055 + (i % 3) * 0.012) * s;
          b.seg('wpn', 'iron', [Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, z], [Math.cos(a) * (r + 0.05 * s), Math.sin(a) * (r + 0.05 * s), z + 0.01 * s], 0.014 * s, 0.0, { local: true, capA: false });
        }
        b.seg('wpn', 'iron', [0, 0, 0.5 * s], [0, 0, 0.56 * s], 0.014 * s, 0.0, { local: true, capA: false });
      },
    },
    sling: {
      item: 'sling', tip: (s) => ['slingStone', [0, 0, 0]],
      build(b, s) {
        b.bone('slingStone', 'wpn', [0, -0.175 * s, 0], true);
        for (const sd of [1, -1]) b.seg('wpn', 'rope', [0, -0.01 * s, 0], [0.016 * s * sd, -0.165 * s, 0], 0.0045 * s, 0.0045 * s, { local: true, ol: false });
        b.sph('wpn', 'leather', [0, -0.178 * s, 0], [0.028 * s, 0.016 * s, 0.034 * s], { local: true });
        b.sph('slingStone', 'stone', [0, 0.012 * s, 0], 0.02 * s, { local: true });
      },
    },
    bow: {
      left: 'bow', tip: (s) => ['off', [0, 0, 0]],
      build(b, s) { bowParts(b, s); },
    },
    quiver: { build(b, s, kind) { quiverParts(b, s, kind, false); } },
    gemQuiver: { build(b, s, kind) { quiverParts(b, s, kind, true); } },
    towerShield: { left: 'shield', build(b, s) { shieldParts(b, s, 'off', null); } },
    backShield: { build(b, s, kind) { shieldParts(b, s, 'back', kind); } },
    tinHelmet: {
      build(b, s, kind) {
        const H = HEADS[kind];
        const c = [H.c[0], H.c[1] + H.r[1] * 0.36, H.c[2] - 0.012];
        b.add('head', b.K.dented(), 'tin', { p: c, s: [H.r[0] * 0.93, H.r[1] * 0.72, H.r[2] * 0.97] });
        b.cyl('head', 'tin', [c[0], c[1] + 0.004, c[2]], H.r[0] * 1.3, 0.012, { rz: H.r[2] * 1.32, d: 'hi' });
        b.ring('head', 'tin', [c[0], c[1] + 0.004, c[2]], H.r[0] * 1.3, H.r[2] * 1.32, 0.011);
        for (let i = 0; i < 7; i++) {
          const a = -1.3 + (i * 2.6) / 6;
          b.sph('head', 'iron', [Math.sin(a) * H.r[0] * 0.94, c[1] + 0.022, c[2] + Math.cos(a) * H.r[2] * 0.97], 0.008, { ol: false });
        }
        b.seg('head', 'leatherDark', [H.r[0] * 0.95, c[1] - 0.01, 0.02], [0.05, H.c[1] - H.r[1] * 0.72, 0.13], 0.008, 0.008, { ol: false });
        b.seg('head', 'leatherDark', [-H.r[0] * 0.95, c[1] - 0.01, 0.02], [-0.05, H.c[1] - H.r[1] * 0.72, 0.13], 0.008, 0.008, { ol: false });
      },
    },
    ironHelm: {
      build(b, s, kind) {
        const H = HEADS[kind];
        const pandaLike = kind === 'panda' || kind === 'armedPanda';
        const sc = pandaLike ? [1.08, 1.02, 1.1] : kind === 'cam' ? [1.18, 1.05, 1.16] : [1.12, 1.08, 1.12];
        const c = [H.c[0], H.c[1] + H.r[1] * (pandaLike ? 0.14 : 0.08), H.c[2] - 0.004];
        const R = [H.r[0] * sc[0], H.r[1] * sc[1], H.r[2] * sc[2]];
        b.hemi('head', 'steel', c, R, { d: 'hi' });
        b.ring('head', 'iron', c, R[0], R[2], 0.022 * Math.max(1, s * 0.8));
        // nasal guard and cheek plates
        b.frame(surf(c, R, 0, 0.12, 0.004), () => b.rbox('head', 'iron', [0, -0.03 * s, 0], [0.016 * s, 0.05 * s, 0.01 * s]));
        // team-colour crest along the top
        b.add('head', b.K.shape('crest', 0.03, 0.006, 'yz'), 'team', { p: [c[0], c[1] + R[1] * 0.93, c[2] - 0.005], s: [1.4 * s * 0.8, 1.2 * s * 0.8, 1.6 * s * 0.8], r: [0, PI, 0] });
        b.rbox('head', 'gold', [c[0], c[1] + R[1] * 0.99, c[2] + R[2] * 0.02], [0.012 * s, 0.012 * s, R[2] * 0.75], { e: 0.4 });
      },
    },
    gemKnuckles: {
      build(b, s) {
        for (const sd of [1, -1]) {
          const L = sd > 0 ? 'L' : 'R';
          b.ring('hand' + L, 'gold', [0.29 * sd, 0.615, 0.035], 0.05, 0.05, 0.012, { tilt: -0.3 });
          for (let i = -1; i <= 1; i++) b.add('hand' + L, b.K.custom('gemOcta', () => new THREE.OctahedronGeometry(1, 0)), 'gem', { p: [(0.29 + i * 0.026) * sd, 0.6, 0.07], s: [0.017, 0.022, 0.017], r: [0.3, 0.4, 0] });
        }
      },
    },
    stormHammer: {
      item: 'hammer', tip: (s) => ['wpn', [0, 0, 0.34 * s]],
      build(b, s) {
        b.seg('wpn', 'leather', [0, 0, -0.13 * s], [0, 0, 0.25 * s], 0.021 * s, 0.021 * s, { local: true });
        for (let z = -0.08; z < 0.2; z += 0.06) b.ring('wpn', 'leatherDark', [0, 0, z * s], 0.022 * s, 0.022 * s, 0.006 * s, { local: true, tilt: -HALF });
        b.sph('wpn', 'steel', [0, 0, -0.145 * s], 0.03 * s, { local: true });
        b.rbox('wpn', 'steel', [0, 0, 0.34 * s], [0.15 * s, 0.082 * s, 0.088 * s], { local: true, e: 0.28 });
        for (const x of [-0.06, 0.06]) b.rbox('wpn', 'glowBlue', [x * s, 0, 0.34 * s], [0.008 * s, 0.086 * s, 0.092 * s], { local: true, e: 0.2 });
        for (const sd of [1, -1]) b.rbox('wpn', 'glowBlue', [0.151 * sd * s, 0, 0.34 * s], [0.004 * s, 0.045 * s, 0.05 * s], { local: true, e: 0.3, ol: false });
        b.rbox('wpn', 'gold', [0, 0, 0.255 * s], [0.03 * s, 0.03 * s, 0.012 * s], { local: true, e: 0.4 });
        b.bone('arcs', 'wpn', [0, 0, 0.34 * s], true);
      },
    },
    jadeFan: {
      item: 'fan', tip: (s) => ['wpn', [0, 0, 0.22 * s]],
      build(b, s) {
        b.seg('wpn', 'bamboo', [0, 0, -0.07], [0, 0, 0.12], 0.011, 0.011, { local: true });
        b.cyl('wpn', 'silk', [0, 0, 0.215], 0.112, 0.006, { local: true, d: 'hi' });
        b.add('wpn', b.K.torus(0.1, TAU, 'mid'), 'glowJade', { p: [0, 0, 0.215], r: [HALF, 0, 0], s: 0.113 }, { local: true });
        b.sph('wpn', 'gold', [0, 0, -0.075], 0.014, { local: true });
        b.seg('wpn', 'team', [0, 0, -0.085], [0, 0.0, -0.15], 0.006, 0.018, { local: true, capB: false });
      },
    },
    warAxe: {
      item: 'axe', tip: (s) => ['wpn', [0.2 * s, 0, 0.46 * s]],
      build(b, s) {
        b.seg('wpn', 'woodDark', [0, 0, -0.24 * s], [0, 0, 0.56 * s], 0.022 * s, 0.02 * s, { local: true });
        for (const z of [-0.04, 0.0, 0.04]) b.ring('wpn', 'leather', [0, 0, z * s], 0.024 * s, 0.024 * s, 0.008 * s, { local: true, tilt: -HALF });
        b.cyl('wpn', 'darkIron', [0, 0, 0.46 * s], 0.03 * s, 0.14 * s, { local: true, r: [HALF, 0, 0] });
        for (const sd of [1, -1]) b.add('wpn', b.K.shape('axeBlade', 0.03, 0.008, 'xz'), 'iron', { p: [0.018 * sd * s, 0, 0.46 * s], s: [sd * s * 0.62, s, s * 0.62] }, { local: true });
        b.seg('wpn', 'darkIron', [0, 0, 0.53 * s], [0, 0, 0.64 * s], 0.02 * s, 0.0, { local: true, capA: false });
        b.sph('wpn', 'darkIron', [0, 0, -0.25 * s], 0.03 * s, { local: true });
      },
    },
    bigWrench: {
      item: 'wrench', tip: (s) => ['wpn', [0, 0, 0.44 * s]],
      build(b, s) {
        b.add('wpn', b.K.shape('wrench', 0.03, 0.006, 'xz'), 'steel', { p: [0, 0, 0], s: s }, { local: true });
        b.rbox('wpn', 'team', [0, 0, 0.03 * s], [0.036 * s, 0.022 * s, 0.07 * s], { local: true, e: 0.4 });
      },
    },
    cardFan: {
      item: 'cards', tip: (s) => ['wpn', [0, 0, 0.2 * s]],
      build(b, s) {
        const angles = [-0.56, -0.28, 0, 0.28, 0.56];
        angles.forEach((a, i) => {
          const m = new THREE.Matrix4().makeRotationY(a);
          m.multiply(new THREE.Matrix4().makeTranslation(0, 0.0025 * (i - 2), 0.1 * s));
          b.frame(m, () => b.box('wpn', 'cards', [0, 0, 0], [0.058 * s, 0.0022, 0.083 * s], { local: true, uv: cardUV(i), r: [0, 0, 0] }));
        });
        b.sph('wpn', 'pale', [0, 0.0, 0.0], 0.03 * s, { local: true });
      },
    },
    // Things held only while throwing.
    rockR: { build(b, s) { b.add('heldR', b.K.rock(3), 'stone', { p: [0, -0.03 * s, 0.05 * s], s: 0.055 * s }, { local: true }); } },
    rockL: { build(b, s) { b.add('heldL', b.K.rock(5), 'stone', { p: [0, -0.03 * s, 0.05 * s], s: 0.06 * s }, { local: true }); } },
    dumbbellR: {
      build(b, s) {
        b.seg('heldR', 'darkIron', [-0.09 * s, -0.02 * s, 0.03 * s], [0.09 * s, -0.02 * s, 0.03 * s], 0.012 * s, 0.012 * s, { local: true });
        for (const sd of [1, -1]) b.cyl('heldR', 'darkIron', [0.09 * sd * s, -0.02 * s, 0.03 * s], 0.045 * s, 0.03 * s, { local: true, r: [0, 0, HALF] });
      },
    },
    boltL: {
      build(b, s) {
        b.add('heldL', b.K.custom('hex', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, false)), 'steel', { p: [0, -0.03 * s, 0.05 * s], s: [0.04 * s, 0.03 * s, 0.04 * s], r: [0.4, 0, 0] }, { local: true });
        b.seg('heldL', 'iron', [0, -0.03 * s, 0.05 * s], [0, 0.04 * s, 0.1 * s], 0.014 * s, 0.014 * s, { local: true });
      },
    },
  };
  function bowParts(b, s) {
    // Bow in the left hand: limbs along local z, string on the +y side; tips at z = +-0.3s.
    const L = 0.3 * s, D = 0.075 * s;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const u = -1 + (i * 2) / 6;
      pts.push([0, D * (u * u) - 0.012 * s, L * u]);
    }
    b.chain('off', 'bamboo', pts, pts.map((p, i) => (i === 3 ? 0.019 : 0.014 - Math.abs(i - 3) * 0.0015) * s), { local: true });
    b.ring('off', 'rope', [0, -0.012 * s, 0.03 * s], 0.02 * s, 0.02 * s, 0.006 * s, { local: true, tilt: -HALF });
    b.ring('off', 'rope', [0, -0.012 * s, -0.03 * s], 0.02 * s, 0.02 * s, 0.006 * s, { local: true, tilt: -HALF });
    for (const sd of [1, -1]) b.sph('off', 'bambooNode', [0, D - 0.012 * s, L * sd], 0.016 * s, { local: true });
  }
  function quiverParts(b, s, kind, gem) {
    const R = DEFS[kind].rest.back;
    const top = [R[0] + 0.1 * s, R[1] + 0.14 * s, R[2] - 0.02], bot = [R[0] - 0.08 * s, R[1] - 0.16 * s, R[2] + 0.02];
    b.seg('back', 'leather', bot, top, 0.052 * s, 0.058 * s, { caps: false, closed: true });
    b.ring('back', 'leatherDark', top, 0.06 * s, 0.06 * s, 0.01 * s, { tilt: -0.5, yaw: 0, phase: 0, r: null });
    const dir = new THREE.Vector3(top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]).normalize();
    for (let i = 0; i < 4; i++) {
      const o = [((i % 2) - 0.5) * 0.04 * s, 0, (Math.floor(i / 2) - 0.5) * 0.04 * s];
      const a = [top[0] + o[0], top[1], top[2] + o[2]];
      const e = [a[0] + dir.x * 0.1 * s, a[1] + dir.y * 0.1 * s, a[2] + dir.z * 0.1 * s];
      if (gem) {
        b.seg('back', 'wood', a, e, 0.006 * s, 0.006 * s, { caps: false });
        b.add('back', b.K.custom('gemOcta', () => new THREE.OctahedronGeometry(1, 0)), 'gem', { p: [e[0] + dir.x * 0.02 * s, e[1] + dir.y * 0.02 * s, e[2] + dir.z * 0.02 * s], s: [0.016 * s, 0.028 * s, 0.016 * s], q: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir) });
      } else {
        b.seg('back', 'wood', a, e, 0.006 * s, 0.006 * s, { caps: false });
        b.rbox('back', i % 2 ? 'feather' : 'team', [e[0], e[1] + 0.012 * s, e[2]], [0.004 * s, 0.03 * s, 0.018 * s], { q: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir), ol: false });
      }
    }
    // strap across the chest
    const T = DEFS[kind].rest.torso;
    b.add('torso', b.K.torus(0.05, TAU, 'lo'), 'leatherDark', { p: [0, R[1] + 0.03, (R[2] + 0.12) * 0.25], r: [0.2, 0, -0.75], s: [0.27 * s, 0.27 * s, 0.24 * s] });
    void T;
  }
  function shieldParts(b, s, bone, kind) {
    // A tall curved tower shield. On the left arm it faces forward; slung on the back it faces backward.
    const onBack = bone === 'back';
    const R0 = onBack ? DEFS[kind].rest.back : [0, 0, 0];
    const w = 1.0, h = 0.62 * s, rad = 0.46 * s;
    const frame = onBack
      ? new THREE.Matrix4().compose(new THREE.Vector3(R0[0], R0[1] + 0.05, R0[2] - 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, PI, 0)), new THREE.Vector3(0.9, 0.9, 0.9))
      : new THREE.Matrix4().compose(new THREE.Vector3(0.05 * s, 0.11 * s, 0.07 * s), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    const o = { local: !onBack };
    b.frame(frame, () => {
      b.add(bone, b.K.custom('shieldPlate', (Q) => new THREE.CylinderGeometry(1, 1, 1, Math.max(4, Math.round(Q.cyl.hi * 0.5)), 1, true, -w / 2, w)), 'teamPlate', { p: [0, 0, -rad + 0.02 * s], s: [rad, h, rad] }, o);
      const edge = [];
      for (let i = 0; i <= 8; i++) {
        const a = -w / 2 + (i * w) / 8;
        edge.push([Math.sin(a) * rad, Math.cos(a) * rad - rad + 0.02 * s]);
      }
      for (const y of [h / 2, -h / 2]) b.chain(bone, 'iron', edge.map(([x, z]) => [x, y, z]), edge.map(() => 0.014 * s), o);
      for (const i of [0, 8]) b.seg(bone, 'iron', [edge[i][0], h / 2, edge[i][1]], [edge[i][0], -h / 2, edge[i][1]], 0.014 * s, 0.014 * s, o);
      b.hemi(bone, 'iron', [0, 0.02 * s, 0.02 * s], [0.065 * s, 0.065 * s, 0.04 * s], Object.assign({ r: [HALF, 0, 0] }, o));
      b.sph(bone, 'cream', [0, 0.02 * s, 0.018 * s], [0.12 * s, 0.12 * s, 0.012 * s], o);
      for (const sd of [1, -1]) b.sph(bone, 'ink', [0.075 * sd * s, 0.11 * s, 0.016 * s], [0.032 * s, 0.032 * s, 0.01 * s], Object.assign({ ol: false }, o));
      b.rbox(bone, 'leather', [0, 0, -0.012 * s], [0.02 * s, 0.14 * s, 0.01 * s], o);
    });
  }

  // Gear for a kind with the given upgrade ids (one weapon + one armour; heroes keep their signature gear).
  function resolveGear(kind, ids) {
    const list = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter((id) => WEAPONS[id] && WEAPONS[id].fits.includes(kind) && !WEAPONS[id].signature);
    let weapon = null, armour = null;
    for (const id of list) {
      if (WEAPONS[id].slot === 'weapon') weapon = id;
      else if (WEAPONS[id].slot === 'armour') armour = id;
    }
    const g = new Set(DEFS[kind].gear);
    const dropRight = () => { for (const r of ['shortSpear', 'club']) g.delete(r); };
    switch (weapon) {
      case 'bambooSpear': dropRight(); g.add('longSpear'); break;
      case 'bambooBow': dropRight(); g.add('bow'); g.add('quiver'); break;
      case 'gemArrows': dropRight(); g.add('bow'); g.add('gemQuiver'); break;
      case 'sling': dropRight(); g.add('sling'); break;
      case 'ironGlaive': dropRight(); g.add('glaive'); break;
      case 'spikedClub': g.delete('club'); g.add('spikedClub'); break;
      case 'gemKnuckles': g.add('gemKnuckles'); break;
    }
    switch (armour) {
      case 'ironHelm': g.delete('tinHelmet'); g.add('ironHelm'); break;
      case 'towerShield': g.add(g.has('bow') ? 'backShield' : 'towerShield'); break;
    }
    let right = null, left = null;
    for (const id of g) {
      if (GEAR[id].item) right = GEAR[id].item;
      if (GEAR[id].left) left = GEAR[id].left;
    }
    // how this figure attacks and throws
    let attack, throwStyle, throwKind, held = null;
    if (right === 'spear') attack = 'thrust';
    else if (right === 'club') attack = 'smash';
    else if (right === 'hammer') attack = 'smash';
    else if (right === 'axe') attack = 'smash2';
    else if (right === 'wrench') attack = 'swing';
    else if (right === 'fan') attack = 'swat';
    else if (right === 'cards') attack = 'slash';
    else if (kind === 'nacam' || kind === 'cockpenis') attack = 'pound';
    else if (kind === 'cam' || kind === 'casey' || kind === 'piecer') attack = 'punch';
    else attack = 'bump';
    if (left === 'bow') { throwStyle = 'shoot'; throwKind = weapon === 'gemArrows' ? 'gemArrow' : 'arrow'; }
    else if (right === 'sling') { throwStyle = 'sling'; throwKind = 'stone'; }
    else if (right === 'cards') { throwStyle = 'flick'; throwKind = 'card'; }
    else if (right === 'fan') { throwStyle = 'gust'; throwKind = 'gust'; }
    else if (right === 'hammer') { throwStyle = 'hurl'; throwKind = 'lightning'; }
    else if (right === 'spear' && !g.has('glaive')) { throwStyle = 'javelin'; throwKind = 'spear'; }
    else if (!right) { throwStyle = 'overR'; throwKind = kind === 'cam' ? 'dumbbell' : 'rock'; held = kind === 'cam' ? 'dumbbellR' : 'rockR'; }
    else { throwStyle = 'overL'; throwKind = kind === 'piecer' ? 'bolt' : 'rock'; held = kind === 'piecer' ? 'boltL' : 'rockL'; }
    if (held) g.add(held);
    return { weapon, armour, ids: [weapon, armour].filter(Boolean), gear: [...g], right, left, attack, throwStyle, throwKind };
  }

  // ---------------------------------------------------------------------------------------------
  // Templates (merged geometry per kind/gear and style, shared by every figure)
  // ---------------------------------------------------------------------------------------------
  const templates = new Map();
  // Plain-coloured materials (no team colour, texture or glow) are merged per surface type with vertex colours.
  const VC_TYPE = { soft: 'matte', fur: 'matte', skin: 'matte', cloth: 'matte', wood: 'matte', rough: 'matte', gloss: 'gloss', metal: 'metal', basic: 'basic' };
  const vcKey = (key) => {
    const S = MAT[key];
    if (!S || S.team || S.map || S.e || S.ei || S.gk || !VC_TYPE[S.t]) return null;
    return 'vc:' + VC_TYPE[S.t] + ':' + (S.f || '');
  };
  function finalize(b, toon) {
    const groups = new Map();
    for (const P of b.parts) {
      const vk = vcKey(P.mat);
      if (vk) {
        const c = new THREE.Color(MAT[P.mat].c);
        if (toon && MAT[P.mat].t === 'metal') c.lerp(new THREE.Color('#ffffff'), 0.12);
        P.color = c;
      }
      const k = P.bone + '|' + (vk || P.mat) + '|' + (P.ol ? 1 : 0);
      let arr = groups.get(k);
      if (!arr) groups.set(k, (arr = []));
      arr.push(P);
    }
    const meshes = [];
    for (const [k, arr] of groups) {
      const [bone, mat, ol] = k.split('|');
      meshes.push({ bone, mat, ol: ol === '1', geo: mergeParts(arr, toon) });
    }
    return { meshes, bones: b.bones };
  }
  function baseTemplate(kind, style) {
    const key = 'base|' + kind + '|' + style;
    let T = templates.get(key);
    if (!T) {
      const b = new Builder(kit(style), Object.assign({}, DEFS[kind].rest));
      DEFS[kind].build(b);
      T = finalize(b, style === 'toon');
      templates.set(key, T);
    }
    return T;
  }
  function gearTemplate(id, kind, style) {
    const key = 'gear|' + id + '|' + kind + '|' + style;
    let T = templates.get(key);
    if (!T) {
      const b = new Builder(kit(style), Object.assign({}, DEFS[kind].rest));
      GEAR[id].build(b, DEFS[kind].gs, kind);
      T = finalize(b, style === 'toon');
      templates.set(key, T);
    }
    return T;
  }

  // ---------------------------------------------------------------------------------------------
  // Animation: a flat set of channels, procedural idle/walk layers, and keyframed one-shot clips
  // ---------------------------------------------------------------------------------------------
  const CH = ['mx', 'my', 'mz', 'mrx', 'mry', 'mrz', 'hy', 'hrx', 'hry', 'hrz', 'tx', 'ty', 'tz', 'sq', 'hdx', 'hdy', 'hdz', 'jaw',
    'aLx', 'aLy', 'aLz', 'fL', 'aRx', 'aRy', 'aRz', 'fR', 'wx', 'wy', 'wz', 'oLx', 'oLy', 'oLz',
    'lLx', 'lLz', 'lRx', 'lRz', 'kL', 'kR', 'cape', 'hatL', 'hatR', 'tail', 'glow', 'draw', 'whirl', 'spin'];
  const CI = {};
  CH.forEach((c, i) => (CI[c] = i));
  const NCH = CH.length;

  // Resting pose adjustments for what the hands hold.
  const ITEM_POSE = {
    spear: { aRz: 0.5, aRx: -0.06, fR: -1.1, wx: 0.0, wy: -0.42 },
    club: { aRz: 0.22, aRx: -0.1, fR: -0.45, wx: 1.25 },
    sling: { aRz: 0.3, fR: -0.35 },
    hammer: { aRz: 0.24, aRx: 0.0, fR: -0.2, wx: 1.9 },
    axe: { aRz: 0.34, aRx: -0.35, fR: -1.95, wx: 0.1, wy: 0.2 },
    wrench: { aRz: 0.2, aRx: -0.3, fR: -2.15, wx: 0.35, wy: 0.3 },
    fan: { wx: 0.1 },
    cards: { aRx: -0.62, fR: -1.25, wx: 0.25, aRz: 0.08 },
  };
  const LEFT_POSE = {
    bow: { aLz: 0.28, aLx: -0.05, fL: -0.15, oLx: -1.5, oLy: 0.0 },
    shield: { aLz: 0.12, aLx: -0.25, fL: -0.8, oLx: 1.02, oLy: 0.22 },
  };
  function basePose(f) {
    const P = new Float32Array(NCH);
    const set = (o) => { for (const k in o) P[CI[k]] = o[k]; };
    set(f.def.base);
    if (ITEM_POSE[f.gear.right] && !(f.kind === 'ping')) set(ITEM_POSE[f.gear.right]);
    if (f.gear.right === 'fan') set(ITEM_POSE.fan);
    if (LEFT_POSE[f.gear.left]) set(LEFT_POSE[f.gear.left]);
    return P;
  }

  function idleLayer(f, P, w) {
    const p = f.def.persona, t = f.time * f.rate + f.phase;
    const br = Math.sin(t * TAU * 0.3);
    P[CI.sq] += 0.016 * br * p.breath * w;
    P[CI.tx] += 0.012 * br * w;
    P[CI.hy] += 0.003 * br * w;
    P[CI.hrz] += 0.02 * Math.sin(t * TAU * 0.13) * p.sway * w;
    P[CI.hry] += 0.04 * Math.sin(t * TAU * 0.071 + 1.3) * p.sway * w;
    P[CI.hdz] += 0.05 * Math.sin(t * TAU * 0.11 + 2) * p.look * w;
    P[CI.hdy] += 0.13 * Math.sin(t * TAU * 0.047 + 0.4) * p.look * w;
    P[CI.hdx] += 0.03 * Math.sin(t * TAU * 0.09 + 3) * w;
    const arm = 0.035 * p.arms * w;
    P[CI.aLz] += arm * (0.5 + 0.5 * br);
    P[CI.aRz] += arm * (0.5 + 0.5 * Math.sin(t * TAU * 0.3 + 0.4));
    P[CI.aLx] += 0.03 * Math.sin(t * TAU * 0.17) * w;
    P[CI.aRx] += 0.03 * Math.sin(t * TAU * 0.17 + 1.1) * w;
    P[CI.cape] += (0.06 + 0.06 * Math.sin(t * TAU * 0.37) + 0.03 * Math.sin(t * TAU * 0.83)) * w;
    P[CI.hatL] += 0.1 * Math.sin(t * TAU * 0.6) * w;
    P[CI.hatR] += 0.1 * Math.sin(t * TAU * 0.6 + 1.9) * w;
    P[CI.tail] += 0.35 * Math.sin(t * TAU * 0.5) * w;
    P[CI.glow] += (0.3 + 0.3 * Math.sin(t * TAU * 0.45)) * w;
    P[CI.jaw] += p.jaw * (0.5 + 0.5 * Math.sin(t * TAU * 0.3)) * w;
    if (p.bounce) P[CI.hy] += p.bounce * Math.abs(Math.sin(t * TAU * 0.9)) * w;
  }
  function walkLayer(f, P) {
    const W = f.def.walk, ph = (f.t / W.cycle) * TAU;
    const s = Math.sin(ph), c = Math.cos(ph);
    const A = W.leg;
    P[CI.lLx] += -A * s;
    P[CI.lRx] += A * s;
    if (W.knee) {
      P[CI.kL] += W.knee * Math.max(0, c);
      P[CI.kR] += W.knee * Math.max(0, -c);
    }
    const legLen = f.rest.hips[1] / f.height;
    P[CI.hy] += -legLen * (1 - Math.cos(A * s)) + W.bob * Math.abs(c);
    P[CI.aLx] += W.arm * s;
    P[CI.aRx] += -W.arm * s;
    P[CI.hrz] += W.sway * s;
    P[CI.tz] += -W.sway * 0.5 * s;
    P[CI.ty] += W.twist * s;
    P[CI.tx] += W.lean;
    P[CI.hdz] += W.sway * 0.3 * s;
    P[CI.cape] += 0.22 + 0.08 * Math.sin(ph * 2);
    P[CI.hatL] += 0.25 * Math.sin(ph * 2 + 0.5);
    P[CI.hatR] += 0.25 * Math.sin(ph * 2 + 2);
    if (W.hop) P[CI.my] += W.hop * Math.abs(s);
  }

  // Clip definitions. Tracks are additive offsets from the base pose unless the name starts with '=' (absolute);
  // key values may be 'B' for the base value. Times are seconds for a speed-1 character.
  const B = 'B';
  const mirrorName = (n, S) => n.replace(/^(=?)(a|f|l|k)S/, `$1$2${S}`).replace(/^(=?)(a|f|l|k)O/, `$1$2${S === 'R' ? 'L' : 'R'}`);
  function sided(tracks, S) {
    const out = {};
    for (const n in tracks) out[mirrorName(n, S)] = tracks[n];
    return out;
  }
  const neg = (keys) => keys.map((k) => [k[0], typeof k[1] === 'number' ? -k[1] : k[1], k[2]]);
  const CLIPS = {
    thrust: () => ({
      dur: 1.05, impact: 0.4,
      tracks: {
        '=aRx': [[0, B], [0.3, 0.35], [0.4, -1.45, 's'], [0.62, -1.35], [1.05, B]],
        '=fR': [[0, B], [0.3, -1.8], [0.4, -0.05, 's'], [0.62, -0.15], [1.05, B]],
        '=aRz': [[0, B], [0.3, 0.3], [0.4, 0.02, 's'], [1.05, B]],
        '=wx': [[0, B], [0.3, 1.35], [0.4, 1.4, 's'], [0.62, 1.38], [1.05, B]],
        '=wy': [[0, B], [0.3, 0.0], [0.4, 0.08, 's'], [0.62, 0.08], [1.05, B]],
        ty: [[0, 0], [0.3, -0.45], [0.4, 0.35, 's'], [0.62, 0.3], [1.05, 0]],
        tx: [[0, 0], [0.3, -0.08], [0.4, 0.2, 's'], [0.62, 0.18], [1.05, 0]],
        mz: [[0, 0], [0.3, -0.04], [0.4, 0.2, 's'], [0.62, 0.18], [1.05, 0]],
        sq: [[0, 0], [0.3, -0.07], [0.4, 0.05, 's'], [0.55, -0.02], [1.05, 0]],
        lLx: [[0, 0], [0.3, 0.12], [0.4, -0.45, 's'], [0.62, -0.4], [1.05, 0]],
        lRx: [[0, 0], [0.4, 0.3, 's'], [0.62, 0.28], [1.05, 0]],
        aLx: [[0, 0], [0.3, -0.35], [0.4, 0.5, 's'], [1.05, 0]],
        hdx: [[0, 0], [0.3, 0.1], [0.4, -0.05, 's'], [1.05, 0]],
      },
    }),
    smash: (f) => ({
      dur: 1.2, impact: 0.5, events: f.kind === 'casey' ? [[0.46, 'arcs', true], [0.8, 'arcs', false]] : [],
      tracks: {
        '=aRx': [[0, B], [0.38, -2.85], [0.5, -0.75, 's'], [0.72, -0.7], [1.2, B]],
        '=fR': [[0, B], [0.38, -0.9], [0.5, -0.25, 's'], [1.2, B]],
        '=aRz': [[0, B], [0.38, 0.2], [0.5, 0.1, 's'], [1.2, B]],
        '=wx': [[0, B], [0.38, 1.0], [0.5, 1.2, 's'], [1.2, B]],
        '=wy': [[0, B], [0.38, 0], [1.2, B]],
        tx: [[0, 0], [0.38, -0.28], [0.5, 0.42, 's'], [0.75, 0.38], [1.2, 0]],
        ty: [[0, 0], [0.38, -0.25], [0.5, 0.15, 's'], [1.2, 0]],
        sq: [[0, 0], [0.38, 0.07], [0.5, -0.12, 's'], [0.62, 0.03, 'o'], [0.75, -0.02], [1.2, 0]],
        my: [[0, 0], [0.3, 0.04, 'o'], [0.45, 0.02], [0.5, 0, 's']],
        mz: [[0, 0], [0.38, -0.03], [0.5, 0.12, 's'], [0.75, 0.11], [1.2, 0]],
        hdx: [[0, 0], [0.38, -0.25], [0.5, 0.15, 's'], [1.2, 0]],
        aLx: [[0, 0], [0.38, -0.6], [0.5, 0.4, 's'], [1.2, 0]],
        aLz: [[0, 0], [0.38, 0.4], [0.5, 0.2], [1.2, 0]],
        lLx: [[0, 0], [0.5, -0.3, 's'], [1.2, 0]],
        jaw: [[0, 0], [0.38, 0.25], [0.5, 0.45, 's'], [0.9, 0.3], [1.2, 0]],
        glow: [[0, 0], [0.4, 0.5], [0.5, 2.2, 's'], [0.9, 0.4], [1.2, 0]],
      },
    }),
    smash2: () => ({
      dur: 1.35, impact: 0.58,
      tracks: {
        '=aRx': [[0, B], [0.44, -2.9], [0.58, -0.8, 's'], [0.82, -0.75], [1.35, B]],
        '=fR': [[0, B], [0.44, -0.6], [0.58, -0.15, 's'], [1.35, B]],
        '=aRz': [[0, B], [0.44, 0.05], [0.58, -0.1, 's'], [1.35, B]],
        '=wx': [[0, B], [0.44, 0.9], [0.58, 1.25, 's'], [1.35, B]],
        '=wy': [[0, B], [0.44, 0], [1.35, B]],
        '=aLx': [[0, B], [0.44, -2.8], [0.58, -0.85, 's'], [0.82, -0.8], [1.35, B]],
        '=fL': [[0, B], [0.44, -0.7], [0.58, -0.3, 's'], [1.35, B]],
        '=aLz': [[0, B], [0.44, -0.15], [0.58, -0.25, 's'], [1.35, B]],
        tx: [[0, 0], [0.44, -0.32], [0.58, 0.45, 's'], [0.85, 0.4], [1.35, 0]],
        sq: [[0, 0], [0.44, 0.08], [0.58, -0.14, 's'], [0.7, 0.04, 'o'], [0.85, -0.02], [1.35, 0]],
        my: [[0, 0], [0.34, 0.05, 'o'], [0.5, 0.03], [0.58, 0, 's']],
        mz: [[0, 0], [0.44, -0.04], [0.58, 0.14, 's'], [0.85, 0.12], [1.35, 0]],
        hdx: [[0, 0], [0.44, -0.3], [0.58, 0.18, 's'], [1.35, 0]],
        lLx: [[0, 0], [0.58, -0.3, 's'], [1.35, 0]],
        jaw: [[0, 0], [0.44, 0.4], [0.58, 0.6, 's'], [1.0, 0.3], [1.35, 0]],
      },
    }),
    pound: () => ({
      dur: 1.25, impact: 0.52,
      tracks: {
        '=aRx': [[0, B], [0.4, -2.9], [0.52, -1.0, 's'], [0.75, -0.95], [1.25, B]],
        '=aLx': [[0, B], [0.4, -2.9], [0.52, -1.0, 's'], [0.75, -0.95], [1.25, B]],
        '=fR': [[0, B], [0.4, -0.5], [0.52, -0.1, 's'], [1.25, B]],
        '=fL': [[0, B], [0.4, -0.5], [0.52, -0.1, 's'], [1.25, B]],
        '=aRz': [[0, B], [0.4, -0.2], [0.52, -0.3, 's'], [1.25, B]],
        '=aLz': [[0, B], [0.4, -0.2], [0.52, -0.3, 's'], [1.25, B]],
        tx: [[0, 0], [0.4, -0.3], [0.52, 0.5, 's'], [0.8, 0.45], [1.25, 0]],
        sq: [[0, 0], [0.4, 0.08], [0.52, -0.14, 's'], [0.64, 0.04, 'o'], [1.25, 0]],
        mz: [[0, 0], [0.52, 0.12, 's'], [0.8, 0.1], [1.25, 0]],
        hdx: [[0, 0], [0.4, -0.3], [0.52, 0.15, 's'], [1.25, 0]],
        jaw: [[0, 0], [0.4, 0.5], [0.52, 0.6, 's'], [0.9, 0.3], [1.25, 0]],
      },
    }),
    punch: () => ({
      dur: 0.85, impact: 0.36,
      tracks: {
        '=aRx': [[0, B], [0.26, 0.35], [0.36, -1.55, 's'], [0.5, -1.5], [0.85, B]],
        '=fR': [[0, B], [0.26, -2.1], [0.36, -0.05, 's'], [0.5, -0.1], [0.85, B]],
        '=aRz': [[0, B], [0.26, 0.35], [0.36, 0.12, 's'], [0.85, B]],
        ty: [[0, 0], [0.26, -0.55], [0.36, 0.5, 's'], [0.5, 0.45], [0.85, 0]],
        tx: [[0, 0], [0.26, -0.05], [0.36, 0.18, 's'], [0.85, 0]],
        mz: [[0, 0], [0.26, -0.04], [0.36, 0.16, 's'], [0.5, 0.15], [0.85, 0]],
        '=aLx': [[0, B], [0.26, -1.2], [0.36, -0.6, 's'], [0.85, B]],
        '=fL': [[0, B], [0.26, -2.0], [0.36, -1.7], [0.85, B]],
        lLx: [[0, 0], [0.36, -0.35, 's'], [0.5, -0.3], [0.85, 0]],
        lRx: [[0, 0], [0.36, 0.2, 's'], [0.85, 0]],
        sq: [[0, 0], [0.26, -0.05], [0.36, 0.04, 's'], [0.85, 0]],
        glow: [[0, 0], [0.3, 0.3], [0.36, 1.6, 's'], [0.7, 0]],
      },
    }),
    dropkick: () => ({
      dur: 1.4, impact: 0.55,
      tracks: {
        my: [[0, 0], [0.15, -0.02], [0.45, 0.32, 'o'], [0.6, 0.28], [0.88, 0, 'i'], [0.95, 0]],
        mz: [[0, 0], [0.15, -0.05], [0.55, 0.45, 'o'], [0.88, 0.3], [1.4, 0]],
        mrx: [[0, 0], [0.15, 0.1], [0.45, -0.95, 'o'], [0.62, -1.05], [0.88, -0.1, 'i'], [1.0, 0.05], [1.4, 0]],
        lLx: [[0, 0], [0.15, 0.3], [0.45, -1.3, 'o'], [0.62, -1.45], [0.88, -0.2], [1.1, 0]],
        lRx: [[0, 0], [0.15, 0.3], [0.45, -1.25, 'o'], [0.62, -1.4], [0.88, -0.2], [1.1, 0]],
        kL: [[0, 0], [0.15, 0.8], [0.42, 1.3], [0.52, 0.0, 's'], [0.7, 0.1], [0.86, 0.6], [1.1, 0]],
        kR: [[0, 0], [0.15, 0.8], [0.42, 1.3], [0.52, 0.0, 's'], [0.7, 0.1], [0.86, 0.6], [1.1, 0]],
        aLx: [[0, 0], [0.15, 0.8], [0.45, -0.7], [0.62, -0.9], [1.0, 0], [1.4, 0]],
        aRx: [[0, 0], [0.15, 0.8], [0.45, -0.7], [0.62, -0.9], [1.0, 0], [1.4, 0]],
        aLz: [[0, 0], [0.45, 0.6], [1.0, 0]],
        aRz: [[0, 0], [0.45, 0.6], [1.0, 0]],
        sq: [[0, 0], [0.12, -0.08], [0.2, 0.06], [0.88, 0], [0.95, -0.12, 's'], [1.1, 0.03], [1.4, 0]],
        hdx: [[0, 0], [0.45, 0.4], [0.62, 0.45], [1.0, 0]],
      },
    }),
    bump: () => ({
      dur: 1.0, impact: 0.42,
      tracks: {
        tx: [[0, 0], [0.3, -0.3], [0.42, -0.2, 's'], [0.6, -0.15], [1.0, 0]],
        sq: [[0, 0], [0.3, 0.1], [0.42, -0.12, 's'], [0.52, 0.08, 'o'], [0.62, -0.04], [0.72, 0.02], [1.0, 0]],
        mz: [[0, 0], [0.3, -0.06], [0.42, 0.24, 's'], [0.62, 0.2], [1.0, 0]],
        my: [[0, 0], [0.32, 0.0], [0.37, 0.05, 'o'], [0.42, 0, 'i']],
        aLx: [[0, 0], [0.3, 0.7], [0.42, 1.0, 's'], [0.62, 0.9], [1.0, 0]],
        aRx: [[0, 0], [0.3, 0.7], [0.42, 1.0, 's'], [0.62, 0.9], [1.0, 0]],
        aLz: [[0, 0], [0.3, 0.4], [0.42, 0.6, 's'], [1.0, 0]],
        aRz: [[0, 0], [0.3, 0.4], [0.42, 0.6, 's'], [1.0, 0]],
        hdx: [[0, 0], [0.3, -0.2], [0.42, 0.1, 's'], [1.0, 0]],
        lLx: [[0, 0], [0.42, -0.25, 's'], [1.0, 0]],
        lRx: [[0, 0], [0.42, 0.25, 's'], [1.0, 0]],
      },
    }),
    swing: () => ({
      dur: 1.1, impact: 0.46,
      tracks: {
        ty: [[0, 0], [0.36, -0.85], [0.46, 0.55, 's'], [0.7, 0.65], [1.1, 0]],
        '=aRx': [[0, B], [0.36, -1.3], [0.46, -1.45, 's'], [0.7, -1.25], [1.1, B]],
        '=aRz': [[0, B], [0.36, 1.05], [0.46, 0.1, 's'], [0.7, -0.25], [1.1, B]],
        '=fR': [[0, B], [0.36, -0.7], [0.46, -0.15, 's'], [0.7, -0.4], [1.1, B]],
        '=wx': [[0, B], [0.36, 1.35], [0.46, 1.5, 's'], [1.1, B]],
        '=wy': [[0, B], [0.36, 0], [1.1, B]],
        tx: [[0, 0], [0.36, -0.05], [0.46, 0.15, 's'], [1.1, 0]],
        mz: [[0, 0], [0.46, 0.12, 's'], [0.7, 0.1], [1.1, 0]],
        sq: [[0, 0], [0.36, -0.05], [0.46, 0.04, 's'], [1.1, 0]],
        lLx: [[0, 0], [0.46, -0.3, 's'], [1.1, 0]],
        aLx: [[0, 0], [0.36, -0.4], [0.46, 0.3, 's'], [1.1, 0]],
      },
    }),
    swat: () => ({
      dur: 0.95, impact: 0.36,
      tracks: {
        '=aRx': [[0, B], [0.26, -2.3], [0.36, -1.25, 's'], [0.55, -1.2], [0.95, B]],
        '=fR': [[0, B], [0.26, -1.3], [0.36, -0.25, 's'], [0.95, B]],
        '=aRz': [[0, B], [0.26, 0.7], [0.36, 0.0, 's'], [0.95, B]],
        '=wx': [[0, B], [0.26, -0.2], [0.36, 0.35, 's'], [0.95, B]],
        ty: [[0, 0], [0.26, -0.3], [0.36, 0.3, 's'], [0.95, 0]],
        mz: [[0, 0], [0.36, 0.1, 's'], [0.95, 0]],
        tx: [[0, 0], [0.26, -0.1], [0.36, 0.12, 's'], [0.95, 0]],
        '=aLx': [[0, B], [0.26, -0.3], [0.36, 0.2, 's'], [0.95, B]],
        '=fL': [[0, B], [0.26, -0.6], [0.95, B]],
        glow: [[0, 0], [0.36, 1.2, 's'], [0.8, 0]],
      },
    }),
    slash: () => ({
      dur: 1.0, impact: 0.4,
      tracks: {
        mry: [[0, 0], [0.16, -0.35], [0.5, TAU, 'o']],
        my: [[0, 0], [0.18, 0], [0.32, 0.1, 'o'], [0.48, 0, 'i']],
        '=aRx': [[0, B], [0.16, -0.8], [0.4, -1.5, 's'], [0.62, -1.35], [1.0, B]],
        '=aRz': [[0, B], [0.16, -0.3], [0.4, 1.2, 's'], [0.62, 1.0], [1.0, B]],
        '=fR': [[0, B], [0.16, -1.6], [0.4, -0.1, 's'], [1.0, B]],
        '=wx': [[0, B], [0.4, 1.35, 's'], [1.0, B]],
        '=aLz': [[0, B], [0.3, 1.1], [0.62, 0.9], [1.0, B]],
        mz: [[0, 0], [0.4, 0.12], [0.7, 0.1], [1.0, 0]],
        hatL: [[0, 0], [0.3, 0.6], [0.6, -0.3], [1.0, 0]],
        hatR: [[0, 0], [0.3, 0.6], [0.6, -0.3], [1.0, 0]],
      },
    }),
    // ---- throws ----
    over: (f, S) => {
      const sg = S === 'R' ? 1 : -1;
      return {
        dur: 1.1, impact: 0.46, events: [[0.04, 'held', true], [0.46, 'held', false]],
        tracks: Object.assign(sided({
          '=aSx': [[0, B], [0.34, -3.25], [0.46, -1.1, 's'], [0.62, -0.6], [1.1, B]],
          '=fS': [[0, B], [0.34, -1.6], [0.46, -0.1, 's'], [1.1, B]],
          '=aSz': [[0, B], [0.34, 0.35], [0.46, 0.1, 's'], [1.1, B]],
          '=aOx': [[0, B], [0.34, -1.35], [0.46, -0.3, 's'], [1.1, B]],
          '=fO': [[0, B], [0.34, -0.2], [1.1, B]],
          lOx: [[0, 0], [0.34, -0.2], [0.46, -0.4, 's'], [0.7, -0.35], [1.1, 0]],
        }, S), {
          ty: [[0, 0], [0.34, -0.5 * sg], [0.46, 0.45 * sg, 's'], [0.62, 0.5 * sg], [1.1, 0]],
          tx: [[0, 0], [0.34, -0.2], [0.46, 0.25, 's'], [0.62, 0.3], [1.1, 0]],
          mz: [[0, 0], [0.34, -0.05], [0.46, 0.12, 's'], [1.1, 0]],
          sq: [[0, 0], [0.34, -0.05], [0.46, 0.05, 's'], [1.1, 0]],
        }),
      };
    },
    javelin: () => ({
      dur: 1.1, impact: 0.46, events: [[0.46, 'hideWpn', true], [1.02, 'hideWpn', false]],
      tracks: {
        '=aRx': [[0, B], [0.34, -3.25], [0.46, -1.1, 's'], [0.62, -0.6], [1.1, B]],
        '=fR': [[0, B], [0.34, -1.6], [0.46, -0.1, 's'], [1.1, B]],
        '=aRz': [[0, B], [0.34, 0.3], [0.46, 0.1, 's'], [1.1, B]],
        '=wx': [[0, B], [0.34, 4.75], [0.46, 0.7, 's'], [1.1, B]],
        '=aLx': [[0, B], [0.34, -1.35], [0.46, -0.3, 's'], [1.1, B]],
        ty: [[0, 0], [0.34, -0.5], [0.46, 0.45, 's'], [0.62, 0.5], [1.1, 0]],
        tx: [[0, 0], [0.34, -0.2], [0.46, 0.25, 's'], [0.62, 0.3], [1.1, 0]],
        mz: [[0, 0], [0.34, -0.05], [0.46, 0.14, 's'], [1.1, 0]],
        lLx: [[0, 0], [0.34, -0.2], [0.46, -0.4, 's'], [0.7, -0.35], [1.1, 0]],
      },
    }),
    sling: () => ({
      dur: 1.35, impact: 0.95, events: [[0.95, 'stone', false], [1.3, 'stone', true]],
      tracks: {
        '=aRx': [[0, B], [0.2, -2.75], [0.82, -2.85], [0.95, -1.2, 's'], [1.1, -0.9], [1.35, B]],
        '=fR': [[0, B], [0.2, -0.45], [0.82, -0.5], [0.95, -0.1, 's'], [1.35, B]],
        '=aRz': [[0, B], [0.2, 0.3], [0.82, 0.3], [0.95, 0.1], [1.35, B]],
        whirl: [[0, 0], [0.22, 1, 'o'], [0.86, 1], [0.95, 0, 's']],
        spin: [[0, 0], [0.86, TAU * 3.5, 'l']],
        ty: [[0, 0], [0.8, -0.35], [0.95, 0.35, 's'], [1.35, 0]],
        tx: [[0, 0], [0.8, -0.1], [0.95, 0.22, 's'], [1.35, 0]],
        mz: [[0, 0], [0.95, 0.1, 's'], [1.35, 0]],
        '=aLx': [[0, B], [0.3, -1.1], [0.9, -1.1], [1.0, -0.2], [1.35, B]],
        lLx: [[0, 0], [0.8, -0.2], [0.95, -0.35, 's'], [1.35, 0]],
      },
    }),
    shoot: () => ({
      dur: 1.4, impact: 0.82, events: [[0.24, 'arrow', true], [0.82, 'arrow', false]],
      tracks: {
        '=aLx': [[0, B], [0.25, -1.5], [1.08, -1.5], [1.4, B]],
        '=fL': [[0, B], [0.25, -0.05], [1.08, -0.05], [1.4, B]],
        '=aLz': [[0, B], [0.25, 0.1], [1.08, 0.1], [1.4, B]],
        '=oLx': [[0, B], [0.25, 0.0], [1.08, 0.0], [1.4, B]],
        '=oLy': [[0, B], [0.25, 0.0], [1.4, B]],
        '=aRx': [[0, B], [0.25, -1.45], [0.72, -1.35], [0.82, -1.3, 's'], [0.98, -1.1], [1.4, B]],
        '=fR': [[0, B], [0.25, -0.35], [0.72, -2.3], [0.82, -2.2], [1.4, B]],
        '=aRz': [[0, B], [0.25, -0.12], [0.72, 0.3], [0.82, 0.65, 's'], [1.4, B]],
        draw: [[0, 0], [0.25, 0.05], [0.72, 1], [0.815, 1], [0.83, 0, 'l']],
        ty: [[0, 0], [0.25, -0.22], [1.08, -0.22], [1.4, 0]],
        hdy: [[0, 0], [0.25, 0.18], [1.08, 0.18], [1.4, 0]],
        sq: [[0, 0], [0.72, 0.03], [0.82, -0.03, 's'], [1.0, 0]],
      },
    }),
    flick: () => ({
      dur: 0.95, impact: 0.4,
      tracks: {
        '=aRx': [[0, B], [0.3, -1.25], [0.4, -1.45, 's'], [0.6, -1.2], [0.95, B]],
        '=aRz': [[0, B], [0.3, -0.55], [0.4, 0.9, 's'], [0.6, 1.0], [0.95, B]],
        '=fR': [[0, B], [0.3, -1.7], [0.4, -0.15, 's'], [0.95, B]],
        '=wx': [[0, B], [0.3, 0.9], [0.4, 1.4, 's'], [0.95, B]],
        ty: [[0, 0], [0.3, 0.4], [0.4, -0.35, 's'], [0.95, 0]],
        mz: [[0, 0], [0.4, 0.06, 's'], [0.95, 0]],
        hdz: [[0, 0], [0.3, 0.15], [0.4, -0.1, 's'], [0.95, 0]],
        hatL: [[0, 0], [0.4, 0.5], [0.7, -0.2], [0.95, 0]],
        hatR: [[0, 0], [0.4, 0.5], [0.7, -0.2], [0.95, 0]],
      },
    }),
    gust: () => ({
      dur: 1.1, impact: 0.48,
      tracks: {
        '=aRx': [[0, B], [0.34, -1.9], [0.48, -1.5, 's'], [0.75, -1.45], [1.1, B]],
        '=aRz': [[0, B], [0.34, 1.0], [0.48, 0.05, 's'], [0.75, 0.0], [1.1, B]],
        '=fR': [[0, B], [0.34, -1.1], [0.48, -0.08, 's'], [1.1, B]],
        '=wx': [[0, B], [0.34, 0.0], [0.48, 0.05, 's'], [1.1, B]],
        ty: [[0, 0], [0.34, -0.4], [0.48, 0.2, 's'], [1.1, 0]],
        mz: [[0, 0], [0.48, 0.06, 's'], [1.1, 0]],
        '=aLx': [[0, B], [0.34, -0.9], [1.1, B]],
        '=fL': [[0, B], [0.34, -1.4], [1.1, B]],
        glow: [[0, 0], [0.4, 0.8], [0.48, 2, 's'], [0.9, 0]],
      },
    }),
    hurl: () => ({
      dur: 1.25, impact: 0.55, events: [[0.3, 'arcs', true], [0.85, 'arcs', false]],
      tracks: {
        '=aRx': [[0, B], [0.4, -3.1], [0.55, -1.5, 's'], [0.8, -1.45], [1.25, B]],
        '=fR': [[0, B], [0.4, -1.2], [0.55, -0.05, 's'], [1.25, B]],
        '=aRz': [[0, B], [0.4, 0.3], [0.55, 0.05, 's'], [1.25, B]],
        '=wx': [[0, B], [0.4, 1.1], [0.55, 1.55, 's'], [1.25, B]],
        ty: [[0, 0], [0.4, -0.5], [0.55, 0.4, 's'], [1.25, 0]],
        tx: [[0, 0], [0.4, -0.2], [0.55, 0.2, 's'], [1.25, 0]],
        mz: [[0, 0], [0.55, 0.1, 's'], [1.25, 0]],
        '=aLx': [[0, B], [0.4, -1.3], [0.55, -0.4, 's'], [1.25, B]],
        glow: [[0, 0], [0.4, 1.2], [0.55, 3, 's'], [0.9, 0.6], [1.25, 0]],
        cape: [[0, 0], [0.55, 0.5], [1.25, 0]],
      },
    }),
    // ---- guard / hit / faint / cheer / cast ----
    guard: (f) => {
      const shield = f.gear.left === 'shield';
      const T = {
        tx: [[0, 0], [0.15, 0.16, 'o'], [0.95, 0.14], [1.2, 0]],
        sq: [[0, 0], [0.15, -0.08, 'o'], [0.95, -0.07], [1.2, 0]],
        hdx: [[0, 0], [0.15, 0.15, 'o'], [0.95, 0.12], [1.2, 0]],
        lLz: [[0, 0], [0.15, 0.1], [0.95, 0.1], [1.2, 0]],
        lRz: [[0, 0], [0.15, 0.1], [0.95, 0.1], [1.2, 0]],
        lLx: [[0, 0], [0.15, -0.15], [0.95, -0.15], [1.2, 0]],
        kL: [[0, 0], [0.15, 0.3], [0.95, 0.3], [1.2, 0]],
        kR: [[0, 0], [0.15, 0.3], [0.95, 0.3], [1.2, 0]],
        mz: [[0, 0], [0.15, -0.03], [0.95, -0.03], [1.2, 0]],
      };
      if (shield) {
        Object.assign(T, {
          '=aLx': [[0, B], [0.15, -0.75, 'o'], [0.95, -0.72], [1.2, B]],
          '=aLz': [[0, B], [0.15, -0.3, 'o'], [0.95, -0.28], [1.2, B]],
          '=fL': [[0, B], [0.15, -0.9, 'o'], [0.95, -0.9], [1.2, B]],
          '=oLy': [[0, B], [0.15, 0.35, 'o'], [0.95, 0.35], [1.2, B]],
          '=oLx': [[0, B], [0.15, 1.6, 'o'], [0.95, 1.58], [1.2, B]],
          '=aRx': [[0, B], [0.15, 0.25, 'o'], [0.95, 0.22], [1.2, B]],
        });
      } else {
        Object.assign(T, {
          '=aLx': [[0, B], [0.15, -1.3, 'o'], [0.95, -1.28], [1.2, B]],
          '=aRx': [[0, B], [0.15, -1.3, 'o'], [0.95, -1.28], [1.2, B]],
          '=fL': [[0, B], [0.15, -1.75, 'o'], [0.95, -1.75], [1.2, B]],
          '=fR': [[0, B], [0.15, -1.75, 'o'], [0.95, -1.75], [1.2, B]],
          '=aLz': [[0, B], [0.15, -0.3, 'o'], [0.95, -0.3], [1.2, B]],
          '=aRz': [[0, B], [0.15, -0.3, 'o'], [0.95, -0.3], [1.2, B]],
        });
        if (f.gear.left === 'bow') T['=oLx'] = [[0, B], [0.15, 0], [0.95, 0], [1.2, B]];
      }
      return { dur: 1.2, impact: 0, tracks: T };
    },
    hit: () => ({
      dur: 0.65, impact: 0, events: [[0, 'flash', true]],
      tracks: {
        mz: [[0, 0], [0.07, -0.13, 's'], [0.3, -0.1], [0.65, 0]],
        my: [[0, 0], [0.07, 0.03, 's'], [0.2, 0, 'i']],
        tx: [[0, 0], [0.07, -0.4, 's'], [0.25, -0.2], [0.4, 0.05], [0.65, 0]],
        hdx: [[0, 0], [0.07, -0.45, 's'], [0.3, -0.1], [0.65, 0]],
        hdz: [[0, 0], [0.07, 0.25, 's'], [0.35, -0.1], [0.65, 0]],
        aLx: [[0, 0], [0.07, 0.5, 's'], [0.3, 0.2], [0.65, 0]],
        aRx: [[0, 0], [0.07, 0.5, 's'], [0.3, 0.2], [0.65, 0]],
        aLz: [[0, 0], [0.07, 0.55, 's'], [0.3, 0.2], [0.65, 0]],
        aRz: [[0, 0], [0.07, 0.55, 's'], [0.3, 0.2], [0.65, 0]],
        sq: [[0, 0], [0.07, 0.08, 's'], [0.2, -0.06], [0.35, 0.03], [0.65, 0]],
        jaw: [[0, 0], [0.07, 0.35, 's'], [0.5, 0]],
        hatL: [[0, 0], [0.1, 0.7], [0.3, -0.4], [0.65, 0]],
        hatR: [[0, 0], [0.1, 0.7], [0.3, -0.4], [0.65, 0]],
        cape: [[0, 0], [0.1, -0.3], [0.4, 0.2], [0.65, 0]],
      },
    }),
    faint: (f) => {
      const sd = f.faintSide; // +1 falls toward its right (-X), -1 toward its left
      const W = (f.halfW / f.height) * 0.95;
      const S = sd > 0 ? 'R' : 'L'; // arm underneath
      const T = sided({
        '=aSz': [[0, B], [0.5, 0.8], [0.9, 2.5], [1.7, 2.6]],
        '=aSx': [[0, B], [0.9, -0.2], [1.7, -0.25]],
        '=fS': [[0, B], [0.9, -0.3], [1.7, -0.3]],
        '=aOz': [[0, B], [0.9, 0.25], [1.1, 0.12, 'o'], [1.7, 0.05]],
        '=aOx': [[0, B], [0.9, -0.7], [1.1, -0.95, 'o'], [1.7, -0.9]],
        '=fO': [[0, B], [0.9, -0.2], [1.7, -0.15]],
        '=wx': [[0, B], [0.9, 1.57], [1.7, 1.57]],
        '=wy': [[0, B], [0.9, 0], [1.7, 0]],
        lSx: [[0, 0], [0.9, 0.15], [1.1, 0.2]],
        lOx: [[0, 0], [0.9, -0.3], [1.1, -0.42]],
      }, S);
      Object.assign(T, {
        hdz: [[0, 0], [0.25, 0.3 * sd], [0.55, -0.2 * sd], [1.0, 0.3 * sd], [1.7, 0.28 * sd]],
        hdy: [[0, 0], [0.15, 0.4], [0.35, -0.4], [0.55, 0.2], [1.7, 0.15 * sd]],
        tx: [[0, 0], [0.25, -0.25], [0.6, 0.1], [1.7, 0.05]],
        kL: [[0, 0], [0.3, 0.5], [0.6, 0.2], [1.7, 0.15]],
        kR: [[0, 0], [0.3, 0.5], [0.6, 0.2], [1.7, 0.1]],
        mrz: [[0, 0], [0.3, -0.12 * sd], [0.86, (HALF + 0.03) * sd, 'i'], [1.0, (HALF - 0.1) * sd, 'o'], [1.15, (HALF + 0.02) * sd], [1.7, HALF * sd]],
        my: [[0, 0], [0.86, W, 'i'], [1.0, W + 0.035, 'o'], [1.15, W], [1.7, W]],
        mx: [[0, 0], [0.3, 0.02 * sd], [0.86, 0.3 * sd]],
        sq: [[0, 0], [0.86, 0], [0.92, -0.08], [1.1, 0.03], [1.3, 0]],
        jaw: [[0, 0], [0.9, 0.35], [1.7, 0.3]],
        hatL: [[0, 0], [0.9, 0.3], [1.1, 0.8], [1.7, 0.7]],
        hatR: [[0, 0], [0.9, 0.3], [1.1, 0.8], [1.7, 0.7]],
      });
      return { dur: 1.7, impact: 0, hold: true, idleW: 0, events: [[0.34, 'ko', true]], tracks: T };
    },
    cheer: (f) => {
      const T = {
        my: [[0, 0], [0.12, 0], [0.3, 0.18, 'o'], [0.45, 0, 'i'], [0.52, 0], [0.7, 0.14, 'o'], [0.85, 0, 'i']],
        sq: [[0, 0], [0.12, -0.1], [0.2, 0.08], [0.45, -0.12, 'i'], [0.52, 0.03], [0.62, 0.06], [0.85, -0.1, 'i'], [0.95, 0.03], [1.1, 0]],
        '=aLx': [[0, B], [0.2, -2.8, 'o'], [1.2, -2.8], [1.5, B]],
        '=aRx': [[0, B], [0.2, -2.8, 'o'], [1.2, -2.8], [1.5, B]],
        '=aLz': [[0, B], [0.2, 0.45], [0.4, 0.2], [0.6, 0.45], [0.8, 0.2], [1.0, 0.45], [1.2, 0.3], [1.5, B]],
        '=aRz': [[0, B], [0.2, 0.45], [0.4, 0.2], [0.6, 0.45], [0.8, 0.2], [1.0, 0.45], [1.2, 0.3], [1.5, B]],
        '=fL': [[0, B], [0.2, -0.3], [1.2, -0.3], [1.5, B]],
        '=fR': [[0, B], [0.2, -0.3], [1.2, -0.3], [1.5, B]],
        hdx: [[0, 0], [0.2, -0.25], [1.2, -0.2], [1.5, 0]],
        jaw: [[0, 0], [0.2, 0.55], [1.2, 0.5], [1.5, 0]],
        kL: [[0, 0], [0.12, 0.4], [0.3, 0.5], [0.45, 0.2], [0.7, 0.5], [0.85, 0.1], [1.1, 0]],
        kR: [[0, 0], [0.12, 0.4], [0.3, 0.5], [0.45, 0.2], [0.7, 0.5], [0.85, 0.1], [1.1, 0]],
        glow: [[0, 0], [0.3, 1.2], [1.2, 1], [1.5, 0]],
        hatL: [[0, 0], [0.3, 0.6], [0.45, -0.4], [0.7, 0.6], [0.85, -0.4], [1.2, 0]],
        hatR: [[0, 0], [0.3, 0.6], [0.45, -0.4], [0.7, 0.6], [0.85, -0.4], [1.2, 0]],
        tail: [[0, 0], [0.3, 0.8], [0.5, -0.8], [0.7, 0.8], [0.9, -0.8], [1.2, 0]],
      };
      if (f.gear.left === 'bow') T['=oLx'] = [[0, B], [0.2, 0], [1.2, 0], [1.5, B]];
      if (f.kind === 'cam') {
        Object.assign(T, {
          '=aLx': [[0, B], [0.2, -1.45, 'o'], [1.2, -1.45], [1.5, B]],
          '=aRx': [[0, B], [0.2, -1.45, 'o'], [1.2, -1.45], [1.5, B]],
          '=aLz': [[0, B], [0.2, 1.62, 'o'], [1.2, 1.62], [1.5, B]],
          '=aRz': [[0, B], [0.2, 1.62, 'o'], [1.2, 1.62], [1.5, B]],
          '=fL': [[0, B], [0.2, -2.05, 'o'], [0.6, -2.3], [0.8, -1.95], [1.2, -2.2], [1.5, B]],
          '=fR': [[0, B], [0.2, -2.05, 'o'], [0.6, -2.3], [0.8, -1.95], [1.2, -2.2], [1.5, B]],
          tx: [[0, 0], [0.2, -0.08], [1.2, -0.08], [1.5, 0]],
          glow: [[0, 0], [0.3, 2.5], [1.2, 2.0], [1.5, 0]],
        });
      }
      return { dur: 1.5, impact: 0, tracks: T };
    },
    cast: (f) => {
      const k = f.kind;
      const T = {
        '=aRx': [[0, B], [0.35, -2.9], [0.7, -3.0], [0.95, -2.9], [1.3, B]],
        '=fR': [[0, B], [0.35, -0.3], [1.3, B]],
        '=aLx': [[0, B], [0.35, -2.6], [0.95, -2.6], [1.3, B]],
        '=aLz': [[0, B], [0.35, 0.5], [1.3, B]],
        '=aRz': [[0, B], [0.35, 0.3], [1.3, B]],
        '=fL': [[0, B], [0.35, -0.3], [1.3, B]],
        tx: [[0, 0], [0.35, -0.18], [0.7, -0.22], [1.0, -0.15], [1.3, 0]],
        hdx: [[0, 0], [0.35, -0.35], [1.0, -0.3], [1.3, 0]],
        my: [[0, 0], [0.4, 0.02], [0.58, 0.1, 'o'], [0.72, 0, 'i']],
        glow: [[0, 0], [0.35, 0.6], [0.7, 2.5, 's'], [1.0, 1], [1.3, 0]],
        sq: [[0, 0], [0.3, -0.06], [0.45, 0.08], [0.72, -0.08], [0.85, 0.02], [1.3, 0]],
        jaw: [[0, 0], [0.35, 0.5], [1.0, 0.5], [1.3, 0]],
        cape: [[0, 0], [0.5, 0.5], [1.0, 0.4], [1.3, 0]],
      };
      if (f.gear.left === 'bow') T['=oLx'] = [[0, B], [0.3, 0], [1.0, 0], [1.3, B]];
      if (f.gear.right === 'wrench' || f.gear.right === 'club' || f.gear.right === 'spear') T['=wx'] = [[0, B], [0.35, 0.1], [1.0, 0.1], [1.3, B]];
      if (f.gear.right === 'wrench') {
        T['=wy'] = [[0, B], [0.35, 0], [0.75, TAU, 'io'], [1.3, B]];
      }
      let ev = [];
      if (k === 'casey') {
        Object.assign(T, {
          my: [[0, 0], [0.35, 0.06], [0.6, 0.12, 'o'], [1.0, 0.1], [1.3, 0]],
          '=wx': [[0, B], [0.35, 0.1], [1.0, 0.1], [1.3, B]],
          cape: [[0, 0], [0.4, 0.8], [0.7, 0.6], [1.0, 0.8], [1.3, 0]],
          glow: [[0, 0], [0.35, 1], [0.7, 3, 's'], [1.05, 1.5], [1.3, 0]],
        });
        ev = [[0.3, 'arcs', true], [1.1, 'arcs', false]];
      } else if (k === 'ping') {
        Object.assign(T, {
          '=aRx': [[0, B], [0.3, -1.6], [0.55, -2.25], [0.8, -1.6], [1.05, -1.25], [1.3, B]],
          '=aRz': [[0, B], [0.3, 0.8], [0.55, 0.2], [0.8, -0.3], [1.05, 0.3], [1.3, B]],
          '=fR': [[0, B], [0.3, -0.4], [1.05, -0.4], [1.3, B]],
          '=aLx': [[0, B], [0.35, -1.2], [1.0, -1.2], [1.3, B]],
          '=fL': [[0, B], [0.35, -1.5], [1.0, -1.5], [1.3, B]],
          '=aLz': [[0, B], [0.35, -0.1], [1.3, B]],
          tx: [[0, 0], [0.35, 0.05], [1.3, 0]],
          hdx: [[0, 0], [0.35, 0.15], [1.0, 0.15], [1.3, 0]],
          my: [[0, 0], [0.4, 0.04], [0.8, 0.06], [1.3, 0]],
        });
      } else if (k === 'cockpenis') {
        Object.assign(T, {
          '=aLx': [[0, B], [0.35, -0.5], [1.0, -0.5], [1.3, B]],
          '=aLz': [[0, B], [0.35, 1.4], [1.0, 1.35], [1.3, B]],
          '=fL': [[0, B], [0.35, -0.8], [1.0, -0.8], [1.3, B]],
          '=aRx': [[0, B], [0.35, -2.6], [1.0, -2.6], [1.3, B]],
          '=wx': [[0, B], [0.35, 0.2], [1.3, B]],
          jaw: [[0, 0], [0.35, 0.75], [1.0, 0.75], [1.3, 0]],
          hdx: [[0, 0], [0.35, -0.45], [1.0, -0.4], [1.3, 0]],
          my: [[0, 0], [0.6, 0.05, 'o'], [0.72, 0, 'i']],
        });
      } else if (k === 'nacam') {
        const pounds = [];
        for (let i = 0; i < 5; i++) pounds.push([0.25 + i * 0.16, i % 2 ? -0.7 : -1.25]);
        Object.assign(T, {
          '=aLx': [[0, B], ...pounds.map(([t, v]) => [t, v]), [1.3, B]],
          '=aRx': [[0, B], ...pounds.map(([t, v]) => [t, v === -0.7 ? -1.25 : -0.7]), [1.3, B]],
          '=fL': [[0, B], [0.2, -2.0], [1.05, -2.0], [1.3, B]],
          '=fR': [[0, B], [0.2, -2.0], [1.05, -2.0], [1.3, B]],
          '=aLz': [[0, B], [0.2, -0.1], [1.05, -0.1], [1.3, B]],
          '=aRz': [[0, B], [0.2, -0.1], [1.05, -0.1], [1.3, B]],
          '=wx': [[0, B], [0.2, 0.2], [1.05, 0.2], [1.3, B]],
          tx: [[0, 0], [0.2, -0.15], [1.05, -0.15], [1.3, 0]],
          jaw: [[0, 0], [0.2, 0.3], [0.9, 0.7], [1.1, 0.7], [1.3, 0]],
          hdx: [[0, 0], [0.9, -0.3], [1.1, -0.3], [1.3, 0]],
        });
      } else if (k === 'cam') {
        Object.assign(T, {
          '=aLx': [[0, B], [0.3, -1.45], [1.05, -1.45], [1.3, B]],
          '=aRx': [[0, B], [0.3, -1.45], [1.05, -1.45], [1.3, B]],
          '=aLz': [[0, B], [0.3, 1.62], [1.05, 1.62], [1.3, B]],
          '=aRz': [[0, B], [0.3, 1.62], [1.05, 1.62], [1.3, B]],
          '=fL': [[0, B], [0.3, -2.2], [0.7, -2.4, 's'], [1.05, -2.2], [1.3, B]],
          '=fR': [[0, B], [0.3, -2.2], [0.7, -2.4, 's'], [1.05, -2.2], [1.3, B]],
          tx: [[0, 0], [0.3, -0.12], [1.05, -0.12], [1.3, 0]],
          sq: [[0, 0], [0.3, 0.08], [0.7, 0.12, 's'], [1.05, 0.08], [1.3, 0]],
          glow: [[0, 0], [0.3, 1], [0.7, 3, 's'], [1.05, 2], [1.3, 0]],
          my: [[0, 0]],
        });
      } else if (k === 'josserkid') {
        Object.assign(T, {
          mry: [[0, 0], [0.2, -0.3], [0.75, TAU, 'io']],
          my: [[0, 0], [0.25, 0], [0.45, 0.16, 'o'], [0.7, 0, 'i']],
          '=aRx': [[0, B], [0.3, -2.4], [1.0, -2.4], [1.3, B]],
          '=aLx': [[0, B], [0.3, -0.4], [1.0, -0.4], [1.3, B]],
          '=aLz': [[0, B], [0.3, 1.2], [1.0, 1.1], [1.3, B]],
          '=wx': [[0, B], [0.3, 0.4], [1.0, 0.4], [1.3, B]],
          hatL: [[0, 0], [0.4, 0.8], [0.7, -0.5], [1.0, 0.3], [1.3, 0]],
          hatR: [[0, 0], [0.4, 0.8], [0.7, -0.5], [1.0, 0.3], [1.3, 0]],
        });
      } else if (k === 'panda' || k === 'ping') {
        T['=aLz'] = [[0, B], [0.35, 0.5], [0.55, 0.25], [0.75, 0.5], [0.95, 0.25], [1.3, B]];
        T['=aRz'] = [[0, B], [0.35, 0.5], [0.55, 0.25], [0.75, 0.5], [0.95, 0.25], [1.3, B]];
      }
      return { dur: 1.3, impact: k === 'casey' ? 0.72 : 0.7, events: ev, tracks: T };
    },
  };
  function clipDef(f, name, opt) {
    const g = f.gear;
    switch (name) {
      case 'attack': {
        const v = opt && opt.variant && CLIPS[opt.variant] ? opt.variant : g.attack;
        return CLIPS[v](f);
      }
      case 'throw':
        if (g.throwStyle === 'overR') return CLIPS.over(f, 'R');
        if (g.throwStyle === 'overL') return CLIPS.over(f, 'L');
        return CLIPS[g.throwStyle](f);
      case 'cast': return CLIPS.cast(f);
      case 'guard': return CLIPS.guard(f);
      case 'hit': return CLIPS.hit(f);
      case 'faint': return CLIPS.faint(f);
      case 'cheer': return CLIPS.cheer(f);
      case 'walk': return { dur: f.def.walk.cycle, loop: true, walk: true, idleW: 0.25, tracks: {} };
      default: return { dur: 1, loop: true, idleW: 1, tracks: {} };
    }
  }
  function compileClip(def, base, speed) {
    const k = 1 / speed;
    const tracks = [];
    for (const nm in def.tracks || {}) {
      const abs = nm[0] === '=';
      const ci = CI[abs ? nm.slice(1) : nm];
      if (ci === undefined) continue;
      const keys = def.tracks[nm].map((kf) => [kf[0] * (def.loop ? 1 : k), kf[1] === B ? (abs ? base[ci] : 0) : kf[1], EASE[kf[2] || 'io'] || EASE.io]);
      tracks.push({ ci, abs, keys });
    }
    const events = (def.events || []).map((e) => [e[0] * k, e[1], e[2]]).sort((a, b2) => a[0] - b2[0]);
    return {
      dur: def.loop ? def.dur : def.dur * k, impact: (def.impact || 0) * k, loop: !!def.loop, hold: !!def.hold, walk: !!def.walk,
      idleW: def.idleW == null ? 0.25 : def.idleW, tracks, events,
    };
  }
  function sampleKeys(ks, t) {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      const kf = ks[i];
      if (t <= kf[0]) {
        const p = ks[i - 1];
        const u = (t - p[0]) / (kf[0] - p[0] || 1e-6);
        return p[1] + (kf[1] - p[1]) * kf[2](u);
      }
    }
    return ks[ks.length - 1][1];
  }

  // ---------------------------------------------------------------------------------------------
  // Figure
  // ---------------------------------------------------------------------------------------------
  const _box = new THREE.Box3(), _box2 = new THREE.Box3(), _inv = new THREE.Matrix4(), _mm = new THREE.Matrix4();
  class Figure {
    constructor(kind, opts = {}) {
      if (!DEFS[kind]) kind = 'panda';
      this.kind = kind;
      this.style = STYLES.includes(opts.style) ? opts.style : 'toy';
      this.def = DEFS[kind];
      this.rest = this.def.rest;
      this.K = kit(this.style);
      this.root = new THREE.Group();
      this.root.name = 'figure:' + kind;
      this.bones = makeBones(this.rest, this.root);
      this.teamHex = opts.teamColor || '#d64a2b';
      this.mats = new Map();
      this.olMat = this.style === 'toon' ? outlineMaterial() : null;
      this.baseMeshes = [];
      this.gearMeshes = [];
      this.extraBones = [];
      this.rnd = mulberry32(opts.seed != null ? opts.seed : nextSeed());
      this.phase = this.rnd() * 100;
      this.rate = 0.9 + this.rnd() * 0.2;
      this.faintSide = opts.faintSide || (this.rnd() < 0.5 ? 1 : -1);
      this.height = 1;
      this.halfW = 0.25;
      this.time = 0;
      this.t = 0;
      this.cur = new Float32Array(NCH);
      this.prev = new Float32Array(NCH);
      this.tmp = new Float32Array(NCH);
      this.blendT = 1;
      this.blendDur = 0.15;
      this.flashT = 0;
      this.flashDur = 0.25;
      this.flashColor = new THREE.Color('#ffffff');
      this.opacity = 1;
      this.nextBlink = 1 + this.rnd() * 3;
      this.blinkT = -1;
      this.state = {};
      this.fainted = false;
      this.alive = true;
      this._instantiate(baseTemplate(kind, this.style), this.baseMeshes);
      this.anchors = {};
      const A = (name, bone, p) => {
        const o = new THREE.Object3D();
        o.name = 'anchor:' + name;
        this.bones[bone].add(o);
        if (p) o.position.set(p[0], p[1], p[2]);
        this.anchors[name] = o;
      };
      const hd = HEADS[kind], r = this.rest;
      A('head', 'head', [hd.c[0] - r.head[0], hd.c[1] - r.head[1], hd.c[2] - r.head[2]]);
      A('overhead', 'head', [hd.c[0] - r.head[0], hd.c[1] - r.head[1] + hd.r[1] * 1.9, hd.c[2] - r.head[2]]);
      A('chest', 'torso', [0, (r.head[1] - r.torso[1]) * 0.62, (kind === 'nacam' || kind === 'cockpenis' ? 0.3 : 0.2) * (this.def.gs > 1.2 ? 1.1 : 1)]);
      A('hand', 'handR', [0, -0.03, 0.02]);
      A('handL', 'handL', [0, -0.03, 0.02]);
      A('weaponTip', 'wpn', [0, 0, 0]);
      A('feet', 'mover', [0, 0, 0]);
      this.setGear(opts.gear != null ? opts.gear : opts.weapon ? [opts.weapon] : []);
      this.setTeamColor(this.teamHex);
    }
    _mat(key) {
      let m = this.mats.get(key);
      if (!m) {
        if (key === 'silk' || key === 'cards') m = makeMaterial(this.style, key);
        else m = makeMaterial(this.style, key, this.teamHex);
        this.mats.set(key, m);
        if (this.opacity < 1) this._applyOpacity(m);
      }
      return m;
    }
    _instantiate(T, list) {
      for (const nb of T.bones) {
        if (this.bones[nb.name]) continue;
        const g = new THREE.Group();
        g.name = nb.name;
        const parent = this.bones[nb.parent];
        if (nb.local) g.position.set(nb.pos[0], nb.pos[1], nb.pos[2]);
        else {
          const pr = this.rest[nb.parent] || [0, 0, 0];
          g.position.set(nb.pos[0] - pr[0], nb.pos[1] - pr[1], nb.pos[2] - pr[2]);
        }
        parent.add(g);
        this.bones[nb.name] = g;
        this.extraBones.push(nb.name);
        list.push(g);
      }
      for (const M of T.meshes) {
        const bone = this.bones[M.bone];
        const mesh = new THREE.Mesh(M.geo, this._mat(M.mat));
        mesh.castShadow = M.geo.boundingSphere.radius > 0.05 && !/eye|glint|pupil|sclera|ko/.test(M.bone + M.mat);
        // toon figures only cast: soft-shadow noise shows through the cel ramp as stipple
        mesh.receiveShadow = this.style !== 'toon';
        mesh.userData.fig = this;
        bone.add(mesh);
        list.push(mesh);
        if (this.olMat && M.ol) {
          const o = new THREE.Mesh(M.geo, this.olMat);
          o.castShadow = false;
          o.receiveShadow = false;
          o.userData.fig = this;
          o.userData.outline = true;
          bone.add(o);
          list.push(o);
        }
      }
    }
    // --- gear -------------------------------------------------------------------------------
    // Replaces the slot the id belongs to (weapon or armour) and keeps the other; null clears the weapon.
    setWeapon(id) {
      const cur = this.gear || {};
      const slot = id && WEAPONS[id] ? WEAPONS[id].slot : 'weapon';
      return this.setGear((slot === 'armour' ? [cur.weapon, id] : [id, cur.armour]).filter(Boolean));
    }
    setGear(ids) {
      const G = resolveGear(this.kind, ids);
      for (const o of this.gearMeshes) if (o.parent) o.parent.remove(o);
      for (const n of this.extraBones) delete this.bones[n];
      this.gearMeshes = [];
      this.extraBones = [];
      this._removeDynamic();
      this.gear = G;
      this.weapon = G.weapon;
      this.armour = G.armour;
      this.attackKind = G.attack;
      this.throwKind = G.throwKind;
      for (const id of G.gear) this._instantiate(gearTemplate(id, this.kind, this.style), this.gearMeshes);
      this.base = basePose(this);
      // weapon tip anchor
      const tipGear = G.gear.map((id) => GEAR[id]).find((g) => g.tip && (g.item || g.left));
      const tip = this.anchors.weaponTip;
      if (tip.parent) tip.parent.remove(tip);
      if (tipGear) {
        const [bone, p] = tipGear.tip(this.def.gs);
        (this.bones[bone] || this.bones.wpn).add(tip);
        tip.position.set(p[0], p[1], p[2]);
      } else {
        this.bones.handR.add(tip);
        tip.position.set(0, -0.04 * this.def.gs, 0.05 * this.def.gs);
      }
      if (G.left === 'bow') this._makeBowString();
      if (G.right === 'hammer') this._makeArcs();
      this.bones.heldL.visible = false;
      this.bones.heldR.visible = false;
      this.bones.wpn.visible = true;
      this._measure();
      this._start(this.fainted ? 'faint' : 'idle', null, true);
      if (this.fainted) this._jumpToEnd();
      return this;
    }
    _removeDynamic() {
      if (this.bow) {
        for (const o of [this.bow.s1, this.bow.s2, this.bow.arrow]) if (o.parent) o.parent.remove(o);
        this.bow.arrow.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.bow = null;
      }
      if (this.arcs) {
        if (this.arcs.group.parent) this.arcs.group.parent.remove(this.arcs.group);
        this.arcs.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.arcs = null;
      }
    }
    _makeBowString() {
      const s = this.def.gs;
      const mat = this._mat('string');
      const geo = this.K.cyl(1, true, 'lo');
      const s1 = new THREE.Mesh(geo, mat), s2 = new THREE.Mesh(geo, mat);
      const arrow = buildProjectileGroup(this.weapon === 'gemArrows' ? 'gemArrow' : 'arrow', this.style, this.teamHex, s, this);
      arrow.visible = false;
      this.bones.off.add(s1, s2, arrow);
      const L = 0.3 * s, D = 0.075 * s - 0.012 * s;
      this.bow = { s1, s2, arrow, top: new THREE.Vector3(0, D, L), bot: new THREE.Vector3(0, D, -L), rest: new THREE.Vector3(0, D, 0), nock: new THREE.Vector3(), r: 0.0035 * s };
    }
    _makeArcs() {
      const group = new THREE.Group();
      const mats = [
        new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        new THREE.MeshBasicMaterial({ color: '#5fbfff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      ];
      const ribbons = [];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 2 * 3), 3));
        const idx = [];
        for (let j = 0; j < 7; j++) idx.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
        g.setIndex(idx);
        const m = new THREE.Mesh(g, mats[i % 2]);
        m.frustumCulled = false;
        group.add(m);
        ribbons.push(m);
      }
      group.visible = false;
      (this.bones.arcs || this.bones.wpn).add(group);
      this.arcs = { group, ribbons, mats, t: 0 };
    }
    _measure() {
      // Height and half-width in the base pose (used by squads and the faint animation).
      this._applyPose(this.base);
      this.root.updateMatrixWorld(true);
      _inv.copy(this.root.matrixWorld).invert();
      _box.makeEmpty();
      _box2.makeEmpty();
      const bodyBones = new Set(['torso', 'head', 'hips', 'jaw']);
      for (const m of this.baseMeshes) {
        if (!m.isMesh || m.userData.outline) continue;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        _mm.multiplyMatrices(_inv, m.matrixWorld);
        const bb = m.geometry.boundingBox.clone().applyMatrix4(_mm);
        _box.union(bb);
        if (bodyBones.has(m.parent.name)) _box2.union(bb);
      }
      this.height = Math.round(_box.max.y * 100) / 100;
      this.halfW = Math.max(0.12, Math.max(-_box2.min.x, _box2.max.x));
      this.footprint = Math.max(0.55, (_box.max.x - _box.min.x) * 0.95);
    }
    setTeamColor(hex) {
      this.teamHex = hex;
      for (const [key, m] of this.mats) {
        const spec = MAT[key];
        if (spec && spec.team) {
          const c = teamShade(key, hex);
          if (this.style === 'toon' && spec.t === 'metal') c.lerp(new THREE.Color('#ffffff'), 0.12);
          m.color.copy(c);
          if (m.sheenColor) m.sheenColor.copy(c).lerp(new THREE.Color('#ffffff'), 0.55);
        }
      }
      if (this.bow && this.bow.arrow.userData.setTeamColor) this.bow.arrow.userData.setTeamColor(hex);
      return this;
    }
    getAnchor(name) {
      return this.anchors[name] || this.anchors.chest;
    }
    // --- animation --------------------------------------------------------------------------
    play(name, opt) {
      if (!ANIMS.includes(name) && name !== 'attack') name = 'idle';
      const c = this._start(name, opt);
      return { duration: c.loop ? (name === 'walk' ? c.dur : 0) : c.dur, impact: c.impact };
    }
    _start(name, opt, instant) {
      const def = clipDef(this, name, opt);
      const speed = name === 'idle' || name === 'walk' ? 1 : this.def.speed;
      this.clip = compileClip(def, this.base, speed);
      this.clipName = name;
      this.prev.set(this.cur);
      // unwind full turns so blends never spin backwards
      const r = this.prev[CI.mry] % TAU;
      this.prev[CI.mry] = r > PI ? r - TAU : r < -PI ? r + TAU : r;
      this.t = 0;
      this.evIndex = 0;
      this.blendT = instant ? 1 : 0;
      this.blendDur = this.fainted && name !== 'faint' ? 0.45 : 0.14;
      if (name !== 'faint') {
        this.fainted = false;
        this._event('ko', false);
      } else this.fainted = true;
      this._event('held', false);
      this._event('arrow', false);
      this._event('arcs', false);
      this._event('hideWpn', false);
      this._event('stone', true);
      if (instant) this.update(0);
      return this.clip;
    }
    _jumpToEnd() {
      this.t = this.clip.dur;
      this.evIndex = 0;
      this.blendT = 1;
      this.update(0);
    }
    _event(name, val) {
      const B2 = this.bones;
      switch (name) {
        case 'ko':
          B2.ko.visible = !!val;
          B2.eyes.visible = !val;
          break;
        case 'held':
          B2.heldR.visible = !!val && this.gear.throwStyle === 'overR';
          B2.heldL.visible = !!val && this.gear.throwStyle === 'overL';
          break;
        case 'arrow':
          this.state.arrow = !!val;
          break;
        case 'arcs':
          this.state.arcs = !!val;
          break;
        case 'hideWpn':
          B2.wpn.visible = !val;
          break;
        case 'stone':
          if (B2.slingStone) B2.slingStone.visible = !!val;
          break;
        case 'flash':
          if (this.flashT <= 0) this.flash('#ffffff', 0.22);
          break;
      }
    }
    flash(hex = '#ffffff', seconds = 0.25) {
      this.flashColor.set(hex);
      this.flashDur = Math.max(0.01, seconds);
      this.flashT = this.flashDur;
      return this;
    }
    update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      this.time += dt;
      this.t += dt;
      const c = this.clip;
      // events
      while (this.evIndex < c.events.length && c.events[this.evIndex][0] <= this.t) {
        const e = c.events[this.evIndex++];
        this._event(e[1], e[2]);
      }
      const P = this.tmp;
      P.set(this.base);
      if (c.idleW > 0) idleLayer(this, P, c.idleW);
      if (c.walk) walkLayer(this, P);
      const tt = c.loop ? this.t % c.dur : Math.min(this.t, c.dur);
      for (const tr of c.tracks) {
        const v = sampleKeys(tr.keys, tt);
        if (tr.abs) P[tr.ci] = v;
        else P[tr.ci] += v;
      }
      if (this.blendT < this.blendDur) {
        this.blendT += dt;
        const w = smooth(clamp(this.blendT / this.blendDur, 0, 1));
        for (let i = 0; i < NCH; i++) P[i] = this.prev[i] + (P[i] - this.prev[i]) * w;
      }
      this.cur.set(P);
      this._applyPose(P);
      this._blink(dt);
      this._dynamic(P, dt);
      this._emissive(P[CI.glow], dt);
      if (!c.loop && !c.hold && this.t >= c.dur) this._start('idle');
    }
    _applyPose(P) {
      const Bn = this.bones, H = this.height;
      Bn.mover.position.set(P[CI.mx] * H, P[CI.my] * H, P[CI.mz] * H);
      Bn.mover.rotation.set(P[CI.mrx], P[CI.mry], P[CI.mrz]);
      Bn.hips.position.y = this.rest.hips[1] + P[CI.hy] * H;
      Bn.hips.rotation.set(P[CI.hrx], P[CI.hry], P[CI.hrz]);
      Bn.torso.rotation.set(P[CI.tx], P[CI.ty], P[CI.tz]);
      const sq = P[CI.sq];
      Bn.torso.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
      Bn.head.rotation.set(P[CI.hdx], P[CI.hdy], P[CI.hdz]);
      Bn.jaw.rotation.x = P[CI.jaw];
      Bn.armL.rotation.set(P[CI.aLx], P[CI.aLy], P[CI.aLz]);
      Bn.armR.rotation.set(P[CI.aRx], -P[CI.aRy], -P[CI.aRz]);
      Bn.foreL.rotation.x = P[CI.fL];
      Bn.foreR.rotation.x = P[CI.fR];
      Bn.wpn.rotation.set(P[CI.wx], P[CI.wy], P[CI.wz]);
      Bn.off.rotation.set(P[CI.oLx], P[CI.oLy], P[CI.oLz]);
      Bn.legL.rotation.set(P[CI.lLx], 0, P[CI.lLz]);
      Bn.legR.rotation.set(P[CI.lRx], 0, -P[CI.lRz]);
      Bn.shinL.rotation.x = P[CI.kL];
      Bn.shinR.rotation.x = P[CI.kR];
      Bn.cape.rotation.x = P[CI.cape];
      Bn.hatL.rotation.z = -P[CI.hatL];
      Bn.hatR.rotation.z = P[CI.hatR];
      Bn.tail.rotation.y = P[CI.tail];
    }
    _blink(dt) {
      if (this.fainted) return;
      if (this.blinkT < 0 && this.time > this.nextBlink) this.blinkT = 0;
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const u = this.blinkT / 0.16;
        const k = u < 0.5 ? u * 2 : 2 - u * 2;
        this.bones.eyes.scale.y = Math.max(0.08, 1 - Math.max(0, k));
        if (u >= 1) {
          this.blinkT = -1;
          this.bones.eyes.scale.y = 1;
          this.nextBlink = this.time + 2 + this.rnd() * 3.5;
        }
      }
    }
    _dynamic(P, dt) {
      const Bn = this.bones;
      if (this.gear.right === 'sling') {
        // cords hang with gravity, or whirl around overhead
        const w = P[CI.whirl], sp = P[CI.spin];
        _v1.set(0, -1, 0);
        if (w > 0) {
          _v2.set(Math.cos(sp), 0.2, Math.sin(sp)).normalize();
          _v1.lerp(_v2, w).normalize();
        }
        _q.setFromUnitVectors(_v2.set(0, -1, 0), _v1);
        Bn.handR.updateWorldMatrix(true, false);
        Bn.handR.getWorldQuaternion(_q2);
        Bn.wpn.quaternion.copy(_q2.invert().multiply(_q));
      }
      if (this.bow) {
        const bw = this.bow, d = P[CI.draw];
        bw.nock.copy(bw.rest);
        if (d > 0.001) {
          Bn.handR.updateWorldMatrix(true, false);
          Bn.off.updateWorldMatrix(true, false);
          Bn.handR.getWorldPosition(_v1);
          Bn.off.worldToLocal(_v1);
          bw.nock.lerp(_v1, d);
        }
        const place = (mesh, a, b2) => {
          _v1.subVectors(b2, a);
          const len = _v1.length();
          mesh.position.addVectors(a, b2).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(Y_AXIS, _v1.normalize());
          mesh.scale.set(bw.r, Math.max(1e-4, len), bw.r);
        };
        place(bw.s1, bw.top, bw.nock);
        place(bw.s2, bw.bot, bw.nock);
        bw.arrow.visible = !!this.state.arrow;
        if (bw.arrow.visible) {
          bw.arrow.position.copy(bw.nock);
          _v1.set(0, -0.012 * this.def.gs, 0).sub(bw.nock);
          if (_v1.lengthSq() < 1e-6) _v1.set(0, 0, 1);
          bw.arrow.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), _v1.normalize());
        }
      }
      if (this.arcs) {
        const A = this.arcs;
        A.group.visible = !!this.state.arcs;
        if (A.group.visible) {
          A.t -= dt;
          if (A.t <= 0) {
            A.t = 0.05;
            const s = this.def.gs;
            for (const m of A.ribbons) {
              const pos = m.geometry.attributes.position;
              const a0 = this.rnd() * TAU, b0 = this.rnd() * PI;
              let x = Math.cos(a0) * Math.sin(b0) * 0.1 * s, y = Math.cos(b0) * 0.07 * s, z = Math.sin(a0) * Math.sin(b0) * 0.08 * s;
              const dx = x * 0.35, dy = y * 0.35, dz = z * 0.35;
              const wdt = (m.material === A.mats[0] ? 0.006 : 0.014) * s;
              for (let j = 0; j < 8; j++) {
                const jx = (this.rnd() - 0.5) * 0.05 * s, jy = (this.rnd() - 0.5) * 0.05 * s, jz = (this.rnd() - 0.5) * 0.05 * s;
                pos.setXYZ(j * 2, x + jx, y + jy + wdt, z + jz);
                pos.setXYZ(j * 2 + 1, x + jx, y + jy - wdt, z + jz + wdt);
                x += dx; y += dy; z += dz;
              }
              pos.needsUpdate = true;
            }
          }
        }
      }
    }
    _emissive(glow, dt) {
      let fk = 0;
      if (this.flashT > 0) {
        fk = Math.pow(this.flashT / this.flashDur, 1.3);
        this.flashT = Math.max(0, this.flashT - dt);
      }
      if (fk === this._lfk && Math.abs(glow - (this._lg || 0)) < 0.004) return;
      this._lfk = fk;
      this._lg = glow;
      for (const m of this.mats.values()) {
        if (!m.emissive) continue;
        const u = m.userData;
        m.emissive.copy(u.e).multiplyScalar(u.ei + u.gk * Math.max(0, glow - u.gt));
        if (fk > 0) m.emissive.lerp(this.flashColor, fk);
      }
    }
    // --- visibility -------------------------------------------------------------------------
    setOpacity(a) {
      this.opacity = clamp(a, 0, 1);
      for (const m of this.mats.values()) this._applyOpacity(m);
      if (this.olMat) this._applyOpacity(this.olMat);
      this.root.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = this.opacity > 0.5; });
      return this;
    }
    _applyOpacity(m) {
      const t = this.opacity < 0.999;
      if (m.isShaderMaterial) m.uniforms.uOpacity.value = this.opacity;
      else m.opacity = this.opacity;
      if (m.transparent !== t && !(m.blending === THREE.AdditiveBlending)) {
        m.transparent = t;
        m.depthWrite = !t;
        m.needsUpdate = true;
      }
    }
    get isFainted() {
      return this.fainted;
    }
    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      this._removeDynamic();
      for (const m of this.mats.values()) m.dispose();
      if (this.olMat) this.olMat.dispose();
      this.mats.clear();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Projectiles (for the battle page to fly between armies; all point along +Z)
  // ---------------------------------------------------------------------------------------------
  function buildProjectileGroup(kind, style, teamHex, s = 1, fig = null) {
    const K = kit(style);
    const b = new Builder(K, { p: [0, 0, 0] });
    const add = (fn) => fn();
    add(() => {
      if (kind === 'arrow' || kind === 'gemArrow') {
        b.seg('p', 'wood', [0, 0, 0], [0, 0, 0.36 * s], 0.006 * s, 0.006 * s, { caps: false });
        if (kind === 'gemArrow') b.add('p', K.custom('gemOcta', () => new THREE.OctahedronGeometry(1, 0)), 'gem', { p: [0, 0, 0.38 * s], s: [0.014 * s, 0.014 * s, 0.03 * s] });
        else b.seg('p', 'iron', [0, 0, 0.35 * s], [0, 0, 0.41 * s], 0.014 * s, 0, { capA: false });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU;
          b.rbox('p', i ? 'feather' : 'team', [Math.cos(a) * 0.012 * s, Math.sin(a) * 0.012 * s, 0.04 * s], [0.002 * s, 0.012 * s, 0.035 * s], { r: [0, 0, a + HALF], ol: false });
        }
      } else if (kind === 'stone') {
        b.add('p', K.rock(7), 'stone', { s: 0.024 * s });
      } else if (kind === 'rock') {
        b.add('p', K.rock(3), 'stone', { s: 0.07 * s });
      } else if (kind === 'card') {
        b.box('p', 'cards', [0, 0, 0], [0.058 * s, 0.0022, 0.083 * s], { uv: cardUV(0) });
      } else if (kind === 'bolt') {
        b.add('p', K.custom('hex', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, false)), 'steel', { s: [0.045 * s, 0.03 * s, 0.045 * s], r: [HALF, 0, 0] });
        b.seg('p', 'iron', [0, 0, 0], [0, 0, -0.09 * s], 0.015 * s, 0.015 * s);
      } else if (kind === 'dumbbell') {
        b.seg('p', 'darkIron', [-0.12 * s, 0, 0], [0.12 * s, 0, 0], 0.016 * s, 0.016 * s);
        for (const sd of [1, -1]) b.cyl('p', 'darkIron', [0.12 * sd * s, 0, 0], 0.06 * s, 0.04 * s, { r: [0, 0, HALF] });
      } else if (kind === 'spear') {
        bambooShaft(b, 'p', -0.24 * s, 0.4 * s, 0.017 * s, s);
        b.seg('p', 'bambooCut', [0, 0, 0.4 * s], [0, 0.004, 0.53 * s], 0.018 * s, 0.0, { capA: false });
      } else {
        b.sph('p', 'glowBlue', [0, 0, 0], 0.05 * s);
      }
    });
    // Builder bones expect a rest map; 'p' sits at the origin.
    const T = finalize(b, style === 'toon');
    const group = new THREE.Group();
    group.name = 'projectile:' + kind;
    const mats = new Map();
    const ol = style === 'toon' ? outlineMaterial() : null;
    for (const M of T.meshes) {
      let m = fig ? fig._mat(M.mat) : mats.get(M.mat);
      if (!m) {
        m = makeMaterial(style, M.mat, teamHex);
        mats.set(M.mat, m);
      }
      const mesh = new THREE.Mesh(M.geo, m);
      mesh.castShadow = true;
      group.add(mesh);
      if (ol && M.ol) group.add(new THREE.Mesh(M.geo, fig ? fig.olMat : ol));
    }
    group.userData.setTeamColor = (hex) => {
      for (const [key, m] of mats) if (MAT[key] && MAT[key].team) m.color.copy(teamShade(key, hex));
    };
    group.userData.dispose = () => {
      for (const m of mats.values()) m.dispose();
      if (ol) ol.dispose();
      for (const M of T.meshes) M.geo.dispose();
    };
    return group;
  }

  // ---------------------------------------------------------------------------------------------
  // Squads
  // ---------------------------------------------------------------------------------------------
  function squadSlots(n, fp, rnd) {
    const rows = [1, 2, 3, 3, 4, 4, 5, 5, 6];
    const out = [];
    let r = 0;
    while (out.length < n) {
      const cnt = Math.min(rows[r] || 6, n - out.length);
      const shift = r === 3 ? 0.5 : r === 5 ? -0.5 : 0;
      for (let j = 0; j < cnt; j++) {
        const x = (j - (cnt - 1) / 2 + shift * 0.5) * fp * 1.25 + (r ? (rnd() - 0.5) * fp * 0.22 : 0);
        const z = -r * fp * 1.05 + (r ? (rnd() - 0.5) * fp * 0.2 : 0);
        out.push({ x, z, yaw: r ? (rnd() - 0.5) * 0.3 : 0, scale: r ? 0.95 + rnd() * 0.08 : 1 });
      }
      r++;
    }
    return out;
  }
  class Squad {
    constructor(kind, count, opts = {}) {
      this.kind = kind;
      this.opts = Object.assign({}, opts);
      this.maxVisible = Math.max(1, opts.maxVisible == null ? 9 : opts.maxVisible);
      const seed = opts.seed == null ? nextSeed() : opts.seed;
      this.rnd = mulberry32(seed);
      this.root = new THREE.Group();
      this.root.name = 'squad:' + kind;
      this.figures = [];
      for (let i = 0; i < this.maxVisible; i++) {
        const f = new Figure(kind, Object.assign({}, opts, { seed: seed + i * 7919, faintSide: i === 0 ? 1 : undefined }));
        f.squadIndex = i;
        this.figures.push(f);
        this.root.add(f.root);
      }
      const fp = this.figures[0].footprint;
      this.slots = squadSlots(this.maxVisible, fp, this.rnd);
      this.figures.forEach((f, i) => {
        const s = this.slots[i];
        f.root.position.set(s.x, 0, s.z);
        f.root.rotation.y = s.yaw;
        f.root.scale.setScalar(s.scale);
        f._sq = { state: 'alive', t: 0, delay: 0 };
      });
      this.queue = [];
      this.count = 0;
      this._setCountNow(count == null ? this.maxVisible : count);
    }
    get leader() {
      return this.figures[0];
    }
    get living() {
      return this.figures.filter((f) => f._sq.state === 'alive' || f._sq.state === 'pop');
    }
    _setCountNow(n) {
      this.count = Math.max(0, Math.round(n));
      const vis = Math.min(this.count, this.maxVisible);
      this.figures.forEach((f, i) => {
        const alive = i < vis;
        f._sq.state = alive ? 'alive' : 'gone';
        f.alive = alive;
        f.root.visible = alive;
        f.root.position.y = 0;
        f.root.scale.setScalar(this.slots[i].scale);
        if (f.opacity !== 1) f.setOpacity(1);
      });
    }
    setCount(n) {
      this.count = Math.max(0, Math.round(n));
      const vis = Math.min(this.count, this.maxVisible);
      let k = 0;
      for (let i = this.maxVisible - 1; i >= 0; i--) {
        const f = this.figures[i], S = f._sq;
        const want = i < vis;
        if (want && (S.state === 'gone' || S.state === 'dying' || S.state === 'sinking')) {
          S.state = 'pop';
          S.t = -0.05 * (vis - 1 - i) * 0.5;
          f.alive = true;
          f.root.visible = true;
          f.root.position.y = 0;
          f.root.scale.setScalar(0.001);
          f.setOpacity(1);
          f.play('idle');
          f._start('idle', null, true);
        } else if (!want && (S.state === 'alive' || S.state === 'pop')) {
          S.state = 'dying';
          S.t = -(k++ * 0.12 + this.rnd() * 0.08);
          S.started = false;
          f.alive = false;
        }
      }
      return this;
    }
    setGear(ids) {
      for (const f of this.figures) f.setGear(ids);
      return this;
    }
    setWeapon(id) {
      for (const f of this.figures) f.setWeapon(id);
      return this;
    }
    setTeamColor(hex) {
      for (const f of this.figures) f.setTeamColor(hex);
      return this;
    }
    play(name, o = {}) {
      const stagger = o.stagger == null ? 0.06 : o.stagger;
      const live = this.living;
      let res = { duration: 0, impact: 0 };
      let maxDelay = 0;
      live.forEach((f, i) => {
        const d = i === 0 ? 0 : i * stagger + this.rnd() * stagger * 0.5;
        maxDelay = Math.max(maxDelay, d);
        if (d <= 0) {
          const r = f.play(name, o);
          if (i === 0) res = r;
        } else this.queue.push({ f, name, o, t: d });
      });
      if (!live.length) return res;
      return { duration: res.duration + (res.duration ? maxDelay : 0), impact: res.impact };
    }
    flash(hex = '#ffffff', seconds = 0.25) {
      for (const f of this.living) f.flash(hex, seconds);
      return this;
    }
    update(dt) {
      if (this.queue.length) {
        for (const q of this.queue) q.t -= dt;
        const ready = this.queue.filter((q) => q.t <= 0);
        this.queue = this.queue.filter((q) => q.t > 0);
        for (const q of ready) if (q.f._sq.state === 'alive' || q.f._sq.state === 'pop') q.f.play(q.name, q.o);
      }
      for (const f of this.figures) {
        const S = f._sq;
        if (S.state === 'gone') continue;
        if (S.state === 'dying') {
          S.t += dt;
          if (S.t >= 0 && !S.started) {
            S.started = true;
            f.play('faint');
          }
          if (S.started && S.t > f.clip.dur + 0.35) {
            S.state = 'sinking';
            S.t = 0;
          }
        } else if (S.state === 'sinking') {
          S.t += dt;
          const u = clamp(S.t / 0.9, 0, 1);
          f.root.position.y = -u * u * 0.35 * f.height;
          f.setOpacity(1 - u);
          if (u >= 1) {
            S.state = 'gone';
            f.root.visible = false;
          }
        } else if (S.state === 'pop') {
          S.t += dt;
          if (S.t >= 0) {
            const u = clamp(S.t / 0.38, 0, 1);
            const sc = this.slots[f.squadIndex].scale * (u < 1 ? EASE.b(u) : 1);
            f.root.scale.setScalar(Math.max(0.001, sc));
            f.root.position.y = Math.sin(u * PI) * 0.12 * f.height;
            if (u >= 1) {
              S.state = 'alive';
              f.root.position.y = 0;
            }
          }
        }
        f.update(dt);
      }
    }
    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      for (const f of this.figures) f.dispose();
      this.queue = [];
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Props: catapult, banner, fort
  // ---------------------------------------------------------------------------------------------
  function flagTexture(hex) {
    const c = canvas(128, 192);
    if (!c) return null;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 192);
    g.fillStyle = hex;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(128, 0);
    g.lineTo(128, 192);
    g.lineTo(64, 156);
    g.lineTo(0, 192);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,250,243,0.9)';
    g.fillRect(0, 10, 128, 6);
    // panda emblem
    g.fillStyle = '#fffaf3';
    g.beginPath();
    g.arc(64, 84, 36, 0, TAU);
    g.fill();
    g.fillStyle = '#1c1b17';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.arc(64 + sd * 27, 56, 12, 0, TAU);
      g.fill();
      g.save();
      g.translate(64 + sd * 13, 82);
      g.rotate(sd * -0.5);
      g.beginPath();
      g.ellipse(0, 0, 8, 11, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.ellipse(64, 98, 7, 5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#fffaf3';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.arc(64 + sd * 12, 79, 2.6, 0, TAU);
      g.fill();
    }
    return finishTex(c);
  }
  function buildProp(name, opts = {}) {
    const style = STYLES.includes(opts.style) ? opts.style : 'toy';
    const K = kit(style);
    let teamHex = opts.teamColor || '#d64a2b';
    const group = new THREE.Group();
    group.name = 'prop:' + name;
    const mats = new Map();
    const ol = style === 'toon' ? outlineMaterial() : null;
    const matFor = (key) => {
      let m = mats.get(key);
      if (!m) {
        m = makeMaterial(style, key, teamHex);
        mats.set(key, m);
      }
      return m;
    };
    const bones = { root: group };
    const place = (b) => {
      const T = finalize(b, style === 'toon');
      for (const M of T.meshes) {
        const mesh = new THREE.Mesh(M.geo, matFor(M.mat));
        mesh.castShadow = true;
        mesh.receiveShadow = style !== 'toon';
        bones[M.bone].add(mesh);
        if (ol && M.ol) bones[M.bone].add(new THREE.Mesh(M.geo, ol));
      }
    };
    const updaters = [];
    if (name === 'catapult') {
      const arm = new THREE.Group();
      arm.position.set(0, 0.27, 0.08);
      group.add(arm);
      bones.arm = arm;
      const b = new Builder(K, { root: [0, 0, 0], arm: [0, 0.27, 0.08] });
      for (const sd of [1, -1]) {
        b.rbox('root', 'wood', [0.24 * sd, 0.17, 0], [0.045, 0.045, 0.56], { e: 0.3 });
        for (const z of [0.36, -0.36]) {
          b.cyl('root', 'woodDark', [0.31 * sd, 0.15, z], 0.15, 0.05, { r: [0, 0, HALF] });
          b.cyl('root', 'iron', [0.34 * sd, 0.15, z], 0.045, 0.03, { r: [0, 0, HALF] });
          b.ring('root', 'iron', [0.31 * sd, 0.15, z], 0.15, 0.15, 0.012, { tilt: HALF, yaw: HALF });
        }
        b.seg('root', 'wood', [0.22 * sd, 0.2, 0.2], [0.13 * sd, 0.66, 0.08], 0.034, 0.03);
        b.seg('root', 'wood', [0.22 * sd, 0.2, -0.06], [0.13 * sd, 0.66, 0.08], 0.034, 0.03);
      }
      for (const z of [0.46, -0.46, 0.08]) b.rbox('root', 'wood', [0, 0.17, z], [0.27, 0.035, 0.04], { e: 0.3 });
      b.rbox('root', 'woodDark', [0, 0.66, 0.08], [0.2, 0.035, 0.035], { e: 0.3 });
      b.cyl('root', 'rope', [0, 0.27, 0.08], 0.06, 0.34, { r: [0, 0, HALF] });
      b.seg('arm', 'wood', [0, 0.27, 0.08], [0, 0.42, -0.62], 0.032, 0.028);
      b.add('arm', K.hemi('mid'), 'woodDark', { p: [0, 0.46, -0.66], s: [0.09, 0.07, 0.09], r: [PI, 0, 0] });
      b.ring('arm', 'iron', [0, 0.46, -0.66], 0.09, 0.09, 0.01);
      b.add('arm', K.rock(11), 'stone', { p: [0, 0.48, -0.66], s: 0.07 });
      b.rbox('root', 'team', [0, 0.2, 0.5], [0.12, 0.05, 0.012], { e: 0.3 });
      place(b);
      let fireT = -1;
      const rest = 0;
      updaters.push((dt) => {
        if (fireT < 0) return;
        fireT += dt;
        const u = fireT;
        const a = u < 0.18 ? EASE.s(u / 0.18) * 1.35 : u < 0.4 ? 1.35 : 1.35 * (1 - EASE.io(clamp((u - 0.4) / 1.0, 0, 1)));
        arm.rotation.x = rest + a;
        if (u > 1.4) fireT = -1;
      });
      group.userData.fire = () => {
        fireT = 0;
        return { duration: 1.4, impact: 0.18 };
      };
    } else if (name === 'banner') {
      const b = new Builder(K, { root: [0, 0, 0] });
      b.rbox('root', 'stone', [0, 0.05, 0], [0.13, 0.05, 0.13], { e: 0.4 });
      b.seg('root', 'woodDark', [0, 0.08, 0], [0, 1.72, 0], 0.024, 0.02);
      b.seg('root', 'woodDark', [-0.3, 1.58, 0.045], [0.3, 1.58, 0.045], 0.016, 0.016);
      b.seg('root', 'woodDark', [0, 1.58, 0.0], [0, 1.58, 0.045], 0.012, 0.012);
      for (const sd of [1, -1]) b.sph('root', 'gold', [0.31 * sd, 1.58, 0.045], 0.024);
      b.seg('root', 'gold', [0, 1.72, 0], [0, 1.85, 0], 0.03, 0.0, { capA: false });
      b.sph('root', 'gold', [0, 1.72, 0], 0.032);
      place(b);
      // flag: a subdivided plane that waves
      const geo = new THREE.PlaneGeometry(0.56, 0.84, 8, 12);
      geo.translate(0, -0.42, 0);
      const base = geo.attributes.position.array.slice();
      let tex = flagTexture(teamHex);
      const fm = style === 'toy'
        ? new THREE.MeshPhysicalMaterial({ map: tex, color: tex ? '#ffffff' : teamHex, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#ffffff') })
        : style === 'lowpoly'
          ? new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : teamHex, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.9, flatShading: true })
          : new THREE.MeshToonMaterial({ map: tex, color: tex ? '#ffffff' : teamHex, side: THREE.DoubleSide, alphaTest: 0.5, gradientMap: toonRamp() });
      const flag = new THREE.Mesh(geo, fm);
      flag.position.set(0, 1.565, 0.085);
      flag.castShadow = true;
      group.add(flag);
      let t = Math.random() * 10;
      updaters.push((dt) => {
        t += dt;
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1];
          const k = -y / 0.84;
          p.setZ(i, Math.sin(x * 7 + t * 3.1 + y * 3) * 0.03 * k + (0.5 + 0.5 * Math.sin(t * 1.3)) * 0.05 * k * k);
        }
        p.needsUpdate = true;
        geo.computeVertexNormals();
      });
      group.userData.setTeamColor = (hex) => {
        teamHex = hex;
        const nt = flagTexture(hex);
        if (nt) {
          if (fm.map) fm.map.dispose();
          fm.map = nt;
          fm.needsUpdate = true;
        } else fm.color.set(hex);
      };
      mats.set('__flag', fm);
    } else {
      // fort: four stone walls with crenellations, corner towers with team roofs, a gate
      const b = new Builder(K, { root: [0, 0, 0] });
      const S = 0.8, Hw = 0.34;
      const wall = (x, z, len, rotY) => {
        b.rbox('root', 'stone', [x, Hw / 2, z], rotY ? [0.07, Hw / 2, len] : [len, Hw / 2, 0.07], { e: 0.25 });
        const n = Math.round(len / 0.09);
        for (let i = 0; i < n; i += 2) {
          const u = -len + (i + 0.5) * ((2 * len) / n);
          b.rbox('root', 'stone', rotY ? [x, Hw + 0.035, z + u] : [x + u, Hw + 0.035, z], [0.045, 0.035, 0.075], { e: 0.3 });
        }
      };
      wall(0, -S, S, false);
      wall(-S, 0, S, true);
      wall(S, 0, S, true);
      wall(-0.52, S, 0.28, false);
      wall(0.52, S, 0.28, false);
      for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
        b.cyl('root', 'stone', [x, 0.3, z], 0.15, 0.6, { ratio: 0.9 });
        b.ring('root', 'stoneDark', [x, 0.6, z], 0.15, 0.15, 0.03);
        b.seg('root', 'roof', [x, 0.6, z], [x, 0.92, z], 0.19, 0.0, { capA: false, closed: true });
        b.seg('root', 'woodDark', [x, 0.92, z], [x, 1.02, z], 0.008, 0.008);
      }
      for (const sd of [1, -1]) {
        b.cyl('root', 'stone', [0.22 * sd, 0.26, S], 0.1, 0.52, { ratio: 0.92 });
        b.seg('root', 'roof', [0.22 * sd, 0.52, S], [0.22 * sd, 0.72, S], 0.13, 0.0, { capA: false, closed: true });
      }
      b.rbox('root', 'woodDark', [0, 0.16, S + 0.01], [0.12, 0.16, 0.03], { e: 0.3 });
      b.cyl('root', 'woodDark', [0, 0.32, S + 0.01], 0.12, 0.06, { r: [HALF, 0, 0] });
      b.rbox('root', 'stone', [0, 0.4, S], [0.16, 0.05, 0.075], { e: 0.3 });
      const rnd = mulberry32(99);
      for (let i = 0; i < 26; i++) {
        const side = i % 4, u = (rnd() - 0.5) * 1.3, y = 0.05 + rnd() * 0.24;
        const p = side === 0 ? [u, y, -S - 0.07] : side === 1 ? [-S - 0.07, y, u] : side === 2 ? [S + 0.07, y, u] : [u < 0 ? -0.55 + u * 0.2 : 0.55 + u * 0.2, y, S + 0.07];
        b.rbox('root', 'stoneDark', p, [0.035, 0.022, 0.012], { e: 0.3, r: [0, side === 1 || side === 2 ? HALF : 0, 0], ol: false });
      }
      b.cyl('root', 'stoneDark', [0, 0.012, 0], 0.78, 0.024, { d: 'hi' });
      place(b);
      group.userData.setTeamColor = (hex) => {
        teamHex = hex;
        for (const [key, m] of mats) if (MAT[key] && MAT[key].team) m.color.copy(teamShade(key, hex));
      };
    }
    if (!group.userData.setTeamColor) {
      group.userData.setTeamColor = (hex) => {
        teamHex = hex;
        for (const [key, m] of mats) if (MAT[key] && MAT[key].team) m.color.copy(teamShade(key, hex));
      };
    }
    group.userData.update = (dt) => { for (const u of updaters) u(dt); };
    group.userData.dispose = () => {
      if (group.parent) group.parent.remove(group);
      for (const m of mats.values()) { if (m.map && m.map !== texCache.fan && m.map !== texCache.cards) m.map.dispose(); m.dispose(); }
      if (ol) ol.dispose();
    };
    return group;
  }

  // ---------------------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------------------
  function buildFigure(kind, opts = {}) {
    return new Figure(kind, opts);
  }
  function buildSquad(kind, count, opts = {}) {
    return new Squad(kind, count, opts);
  }
  function buildProjectile(kind, opts = {}) {
    const style = STYLES.includes(opts.style) ? opts.style : 'toy';
    return buildProjectileGroup(kind, style, opts.teamColor || '#d64a2b', opts.scale || 1, null);
  }
  function weaponsFor(kind, slot) {
    return Object.keys(WEAPONS).filter((id) => WEAPONS[id].fits.includes(kind) && (!slot || WEAPONS[id].slot === slot));
  }
  function clearCache(style) {
    for (const [key, T] of templates) {
      if (style && !key.endsWith('|' + style)) continue;
      for (const M of T.meshes) M.geo.dispose();
      templates.delete(key);
    }
    for (const s of style ? [style] : Object.keys(kits)) {
      const K = kits[s];
      if (!K) continue;
      for (const g of K.cache.values()) g.dispose();
      delete kits[s];
    }
  }
  return {
    KINDS, STYLES, WEAPONS, HEROES, INFO, ANIMS,
    buildFigure, buildSquad, buildProp, buildProjectile, weaponsFor, clearCache,
  };
})();
