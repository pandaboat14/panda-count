(() => {
  const residents = PANDAS.filter((p) => p.status === "resident");
  const incoming = PANDAS.filter((p) => p.status === "incoming");
  const backdrops = ["#e7d7b4", "#cfe0cf", "#ecd3c4", "#d6dcc0", "#e2d5e6", "#d4e2e4"];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const fmtDate = (iso) => {
    if (!iso) return "—";
    if (/^\d{4}$/.test(iso)) return iso;
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const age = (iso) => {
    const [y, m = 1, d = 1] = iso.split("-").map(Number);
    const now = new Date();
    let a = now.getFullYear() - y;
    if (now < new Date(now.getFullYear(), m - 1, d)) a--;
    return a;
  };

  // Small illustrated panda face; each panda gets slight variations so the cards differ.
  function pandaSVG(i) {
    const tilt = [18, 24, 14, 28, 20, 16][i % 6];
    const ear = [15, 17, 14, 16, 18, 15][i % 6];
    const smile = [4, 6, 3, 5, 6, 4][i % 6];
    return `
      <svg viewBox="0 0 200 170" aria-hidden="true">
        <circle cx="52" cy="42" r="${ear + 9}" fill="#1c1b17"/>
        <circle cx="148" cy="42" r="${ear + 9}" fill="#1c1b17"/>
        <ellipse cx="100" cy="96" rx="74" ry="66" fill="#fdf8ef" stroke="#1c1b17" stroke-width="3"/>
        <ellipse cx="70" cy="90" rx="17" ry="24" fill="#1c1b17" transform="rotate(${tilt} 70 90)"/>
        <ellipse cx="130" cy="90" rx="17" ry="24" fill="#1c1b17" transform="rotate(${-tilt} 130 90)"/>
        <circle cx="73" cy="88" r="6" fill="#fdf8ef"/><circle cx="74" cy="87" r="3" fill="#1c1b17"/>
        <circle cx="127" cy="88" r="6" fill="#fdf8ef"/><circle cx="126" cy="87" r="3" fill="#1c1b17"/>
        <ellipse cx="100" cy="118" rx="10" ry="7" fill="#1c1b17"/>
        <path d="M100 125 v6 M100 131 q-9 ${smile} -16 0 M100 131 q9 ${smile} 16 0" stroke="#1c1b17" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="58" cy="122" rx="9" ry="5" fill="#e9b8a8" opacity=".7"/>
        <ellipse cx="142" cy="122" rx="9" ry="5" fill="#e9b8a8" opacity=".7"/>
      </svg>`;
  }

  const portrait = (i) => `<div class="portrait" style="background:${backdrops[i % backdrops.length]}">${pandaSVG(i)}</div>`;

  function miniCard(p, i) {
    const tag = p.status === "incoming" ? "Arriving soon" : `${p.sex} · age ${age(p.born)}`;
    return `
      <button class="mini" data-i="${i}" aria-haspopup="dialog" aria-label="Open ${esc(p.name)}'s trading card">
        ${portrait(i)}
        <div class="mini-body">
          <div class="mini-name">${esc(p.name)}</div>
          <div class="mini-zoo">${esc(p.zoo)}</div>
          <span class="mini-tag">${tag}</span>
        </div>
      </button>`;
  }

  function tradingCard(p, i) {
    const isRes = p.status === "resident";
    const number = isRes ? `No. ${String(residents.indexOf(p) + 1).padStart(2, "0")} / ${String(residents.length).padStart(2, "0")}` : "Incoming";
    const rows = [
      ["Origin", `${p.origin}, China<br><small>${esc(p.birthplace)}</small>`],
      ["Zoo", esc(p.zoo)],
      ["Location", esc(p.location)],
      ["Born", fmtDate(p.born)],
      ["Arrived", isRes ? fmtDate(p.arrived) : "Coming soon"],
    ];
    return `
      <article class="tcard" id="tcard">
        <div class="tcard-inner">
          <div class="tcard-top">
            <div class="tcard-name">${esc(p.name)}<span class="tcard-cn">${esc(p.chinese)}</span></div>
            <div class="tcard-no">${number}</div>
          </div>
          ${portrait(i)}
          <div class="tcard-type">Giant Panda · ${esc(p.sex)}</div>
          <ul class="stats">${rows.map(([k, v]) => `<li><span class="k">${k}</span><span>${v}</span></li>`).join("")}</ul>
          <p class="fact">${esc(p.fact)}</p>
        </div>
        <div class="tcard-foot"><span>Panda Count.net</span><span>Ailuropoda melanoleuca</span></div>
      </article>`;
  }

  // ---- Hero count ----
  const n = residents.length;
  const zooCount = new Set(residents.map((p) => p.zoo)).size;
  $("hero-sub").innerHTML = `living at <strong>${zooCount} zoo${zooCount === 1 ? "" : "s"}</strong> across the United States${
    incoming.length ? `, with <strong>${incoming.length} more</strong> on the way` : ""
  }.`;
  $("updated").textContent = fmtDate(LAST_UPDATED);
  $("updated").dateTime = LAST_UPDATED;

  const countEl = $("count");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) countEl.textContent = n;
  else {
    const start = performance.now(), dur = 1200;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      countEl.textContent = Math.round(n * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---- Grids ----
  $("grid").innerHTML = residents.map((p) => miniCard(p, PANDAS.indexOf(p))).join("");
  if (incoming.length) {
    $("incoming-wrap").hidden = false;
    $("incoming").innerHTML = incoming.map((p) => miniCard(p, PANDAS.indexOf(p))).join("");
  }

  // ---- Zoos ----
  const zoos = new Map();
  PANDAS.forEach((p) => {
    if (!zoos.has(p.zoo)) zoos.set(p.zoo, { location: p.location, res: [], inc: [] });
    zoos.get(p.zoo)[p.status === "resident" ? "res" : "inc"].push(p.name);
  });
  $("zoo-list").innerHTML = [...zoos].map(([zoo, z]) => `
    <li>
      <span class="big ${z.res.length ? "" : "soon"}">${z.res.length || z.inc.length}</span>
      <h3>${esc(zoo)}</h3>
      <div class="city">${esc(z.location)}</div>
      <div class="who ${z.res.length ? "" : "soon"}">${esc((z.res.length ? z.res : z.inc).join(" & "))}${z.res.length ? "" : " (arriving soon)"}</div>
    </li>`).join("");

  // ---- Trading card pop-out ----
  const dialog = $("card-dialog");
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".mini");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    $("card-slot").innerHTML = tradingCard(PANDAS[i], i);
    dialog.showModal();
  });
  $("close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  // Tilt + holo sheen following the pointer.
  dialog.addEventListener("pointermove", (e) => {
    const card = $("tcard");
    if (!card || reduce) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
    card.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 10}deg)`;
  });
  dialog.addEventListener("pointerleave", () => { const c = $("tcard"); if (c) c.style.transform = ""; });
})();
