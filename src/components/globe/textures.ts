import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { CanvasTexture, SRGBColorSpace } from "three";
import land110 from "world-atlas/land-110m.json";
import countries110 from "world-atlas/countries-110m.json";
import type { WildRange } from "@/lib/types";

const W = 4096;
const H = 2048;

const px = (lng: number) => ((lng + 180) / 360) * W;
const py = (lat: number) => ((90 - lat) / 180) * H;

function canvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

// Ocean, land, borders and a faint graticule, drawn once into an equirectangular texture.
export function makeEarthTexture() {
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const projection = geoEquirectangular().fitSize([W, H], { type: "Sphere" });
  const path = geoPath(projection, ctx);

  ctx.fillStyle = "#6fa592";
  ctx.fillRect(0, 0, W, H);

  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = "rgba(255,250,243,0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const landTopo = land110 as unknown as Topology<{ land: GeometryCollection }>;
  ctx.beginPath();
  path(feature(landTopo, landTopo.objects.land));
  ctx.fillStyle = "#f3e6c8";
  ctx.fill();
  ctx.strokeStyle = "#b3955c";
  ctx.lineWidth = 2;
  ctx.stroke();

  const countryTopo = countries110 as unknown as Topology<{ countries: GeometryCollection }>;
  ctx.beginPath();
  path(mesh(countryTopo, countryTopo.objects.countries, (a, b) => a !== b));
  ctx.strokeStyle = "rgba(179,149,92,0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Soft glow over each wild mountain range, brighter where the survey counted more pandas.
export function makeHeatTexture(ranges: WildRange[]) {
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const max = Math.max(1, ...ranges.map((r) => r.estimate));
  const blob = (r: WildRange, reach: number, minSpan: number, stops: [number, string][]) => {
    ctx.save();
    ctx.translate(px(r.lng), py(r.lat));
    ctx.rotate((-r.angle * Math.PI) / 180);
    ctx.scale((Math.max(r.spanLng, minSpan) / 360) * W, (Math.max(r.spanLat, minSpan) / 180) * H);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  ctx.globalCompositeOperation = "lighter";
  for (const r of ranges) {
    const k = 0.45 + 0.55 * Math.sqrt(r.estimate / max);
    // A broad, faint halo so the whole range reads at globe scale…
    blob(r, 7, 0.8, [
      [0, `rgba(233,110,60,${0.7 * k})`],
      [0.55, `rgba(236,150,110,${0.3 * k})`],
      [1, "rgba(233,184,168,0)"],
    ]);
    // …and a hot core where the pandas actually are.
    blob(r, 2, 0.4, [
      [0, `rgba(214,52,24,${k})`],
      [0.5, `rgba(230,96,48,${0.75 * k})`],
      [1, "rgba(233,150,110,0)"],
    ]);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
