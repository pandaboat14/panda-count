// Painted canvas textures for the dice tables: wood grain, puffs of fog and emoji tokens.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { mulberry32 } from "./tray";

export function canvasTex(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  { repeat = null, srgb = true }: { repeat?: [number, number] | null; srgb?: boolean } = {},
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Fine noise, so flat paint reads as a real surface.
export function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const img = g.getImageData(0, 0, w, h), d = img.data, rng = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

export function woodTexture({ base = "#7b4b2a", seed = 3, w = 512, h = 128, repeat = [1, 1] as [number, number] } = {}) {
  return canvasTex(
    w,
    h,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      const rng = mulberry32(seed);
      for (let i = 0; i < 90; i++) {
        const y = rng() * h, amp = 1.5 + rng() * 5, f = 0.006 + rng() * 0.02, ph = rng() * 6;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const yy = y + Math.sin(x * f + ph) * amp;
          if (x) g.lineTo(x, yy);
          else g.moveTo(x, yy);
        }
        g.strokeStyle = rng() > 0.8 ? `rgba(255, 210, 160, ${0.05 + rng() * 0.08})` : `rgba(40, 18, 6, ${0.08 + rng() * 0.2})`;
        g.lineWidth = 0.6 + rng() * 2.4;
        g.stroke();
      }
      grain(g, w, h, 14, seed);
    },
    { repeat },
  );
}

// A small soft cloud, for puffs of fog.
export function cloudTexture() {
  return canvasTex(256, 128, (g) => {
    const blob = (x: number, y: number, r: number, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(244,246,247,${a})`);
      gr.addColorStop(1, "rgba(244,246,247,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    blob(128, 78, 58, 0.95);
    blob(82, 86, 42, 0.85);
    blob(176, 86, 44, 0.85);
    blob(106, 58, 38, 0.8);
    blob(154, 56, 40, 0.8);
  });
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// An emoji (or any short text), optionally on a disc with a coloured ring.
export function emojiTexture(ch: string, { size = 128, bg = null, ring = null, font = EMOJI_FONT, color = "#1c1b17" }: { size?: number; bg?: string | null; ring?: string | null; font?: string; color?: string } = {}) {
  return canvasTex(size, size, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      g.fill();
      if (ring) {
        g.lineWidth = size * 0.07;
        g.strokeStyle = ring;
        g.stroke();
      }
    }
    g.font = `${Math.round(size * 0.56)}px ${font}`;
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ch, size / 2, size / 2 + size * 0.04);
  });
}
