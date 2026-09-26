// Development stand-in for shared/models.js (same API, simple shapes).
const Models = (() => {
  const KINDS = ["panda", "armedPanda", "nacam", "cam", "casey", "ping", "cockpenis", "piecer", "josserkid"];
  const STYLES = ["toy", "lowpoly", "toon"];
  const WEAPONS = {};
  const COL = { panda: "#f7f4ec", armedPanda: "#dfe3e8", nacam: "#6f8a3a", cam: "#e8b64a", casey: "#f0d27a", ping: "#3f8f6b", cockpenis: "#56702c", piecer: "#f0a030", josserkid: "#8a3fd1" };
  const H = { panda: 1, armedPanda: 1.05, nacam: 1.3, cam: 1.4, casey: 1.8, ping: 1.05, cockpenis: 1.6, piecer: 1.3, josserkid: 1.2 };
  function buildFigure(kind, opts = {}) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const h = H[kind] || 1;
    const mat = new THREE.MeshStandardMaterial({ color: COL[kind] || "#ccc", roughness: 0.6 });
    const team = new THREE.MeshStandardMaterial({ color: opts.teamColor || "#d64a2b", roughness: 0.5 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * h, 0.35 * h, 6, 12), mat);
    torso.position.y = 0.42 * h;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * h, 16, 12), mat);
    head.position.y = 0.88 * h;
    head.castShadow = true;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17 * h, 0.05 * h, 8, 16), team);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.7 * h;
    body.add(torso, head, scarf);
    let t = 0;
    let anim = "idle";
    let at = 0;
    let dur = 0;
    const phase = Math.random() * 6;
    const fig = {
      kind,
      root,
      height: h,
      play(name) {
        anim = name;
        at = 0;
        dur = { attack: 0.7, throw: 0.7, cast: 0.9, guard: 0.6, hit: 0.4, faint: 0.8, cheer: 1, walk: 0 }[name] ?? 0;
        return { duration: dur, impact: ["attack", "throw", "cast"].includes(name) ? dur * 0.45 : 0 };
      },
      update(dt) {
        t += dt;
        at += dt;
        body.position.set(0, 0, 0);
        body.rotation.set(0, 0, 0);
        const k = dur ? Math.min(1, at / dur) : 0;
        if (anim === "idle" || anim === "walk") body.position.y = Math.sin(t * 3 + phase) * 0.02;
        else if (anim === "attack") body.position.z = Math.sin(k * Math.PI) * 0.35;
        else if (anim === "throw" || anim === "cast") body.rotation.x = -Math.sin(k * Math.PI) * 0.4;
        else if (anim === "hit") body.position.z = -Math.sin(k * Math.PI) * 0.2;
        else if (anim === "cheer") body.position.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.25;
        else if (anim === "guard") body.rotation.x = Math.sin(k * Math.PI) * 0.2;
        if (anim === "faint") {
          body.rotation.z = Math.min(1, k * 1.4) * (Math.PI / 2);
          return;
        }
        if (dur && at >= dur) anim = "idle";
      },
      flash(hex = "#ffffff", seconds = 0.25) {
        mat.emissive.set(hex);
        setTimeout(() => mat.emissive.set("#000000"), seconds * 1000);
      },
      setTeamColor(hex) {
        team.color.set(hex);
      },
      setWeapon() {},
      setGear() {},
      getAnchor(name) {
        return name === "head" ? head : torso;
      },
      dispose() {},
    };
    return fig;
  }
  function buildSquad(kind, count, opts = {}) {
    const root = new THREE.Group();
    const max = opts.maxVisible || 9;
    const figures = [];
    for (let i = 0; i < Math.min(count, max); i++) {
      const f = buildFigure(kind, opts);
      const row = Math.floor((i + 1) / 3);
      const col = i === 0 ? 0 : ((i - 1) % 3) - 1;
      f.root.position.set(col * 0.55 + (row % 2 ? 0.25 : 0), 0, -row * 0.6);
      root.add(f.root);
      figures.push(f);
    }
    const squad = {
      root,
      figures,
      leader: figures[0],
      count,
      setCount(n) {
        squad.count = n;
        figures.forEach((f, i) => {
          if (i >= n) {
            if (!f._down) {
              f._down = true;
              f.play("faint");
            }
          } else if (f._down) {
            f._down = false;
            f.play("idle");
          }
        });
      },
      play(name) {
        let out = { duration: 0, impact: 0 };
        figures.forEach((f) => {
          if (!f._down) out = f.play(name);
        });
        return out;
      },
      update(dt) {
        figures.forEach((f) => f.update(dt));
      },
      flash(hex) {
        figures.forEach((f) => f.flash(hex));
      },
      setGear() {},
      dispose() {},
    };
    squad.setCount(count);
    return squad;
  }
  function buildProp() {
    return new THREE.Group();
  }
  return { KINDS, STYLES, WEAPONS, buildFigure, buildSquad, buildProp };
})();
