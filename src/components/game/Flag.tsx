// A Kird's flag, drawn the same way on the board (as a canvas texture) and in the panels (as an SVG):
// their colour on a waving cloth, with a star on your own flags and their initial on everyone else's.

const SIZE = 128;
export const FLAG_SIZE = SIZE;
export const FLAG_POLE_X = 18; // where the pole stands, so the board can plant it on the spot
const CLOTH = { left: 21, right: 122, top: 16, bottom: 80 };
const STAR = { x: 72, y: 48, outer: 22, inner: 9 };
const INK = "#fffaf3";
const GOLD = "#e8b64a";

export function initialOf(name: string) {
  return ([...name.trim()][0] ?? "?").toUpperCase();
}

// Dark or light text, whichever reads better on a Kird's colour (gold and teal need dark ink).
export function inkOn(hex: string) {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5) > 0.2 ? "#1c1b17" : "#fffaf3";
}

// The cloth's outline: top edge left to right, bottom edge back again, with a gentle wave.
function clothOutline(): [number, number][] {
  const wave = (x: number) => Math.sin((x - CLOTH.left) / 16) * 4;
  const xs: number[] = [];
  for (let x = CLOTH.left; x < CLOTH.right; x += 4) xs.push(x);
  xs.push(CLOTH.right);
  return [...xs.map((x): [number, number] => [x, CLOTH.top + wave(x)]), ...[...xs].reverse().map((x): [number, number] => [x, CLOTH.bottom + wave(x)])];
}

function starOutline(): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? STAR.inner : STAR.outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [STAR.x + r * Math.cos(a), STAR.y + r * Math.sin(a)];
  });
}

const points = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export function FlagIcon({ color, mine, initial = "", size = 18, title }: { color: string; mine: boolean; initial?: string; size?: number; title?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      className="flag-icon"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x={FLAG_POLE_X - 4} y={12} width={8} height={SIZE - 12} rx={3} fill={mine ? GOLD : "#3a3a3a"} />
      <circle cx={FLAG_POLE_X} cy={12} r={mine ? 11 : 7} fill={mine ? GOLD : "#3a3a3a"} />
      <polygon points={points(clothOutline())} fill={color} stroke={mine ? INK : "none"} strokeWidth={8} strokeLinejoin="round" />
      {mine ? (
        <polygon points={points(starOutline())} fill={INK} />
      ) : (
        <text x={STAR.x} y={STAR.y + 2} fontSize={46} fontWeight={800} textAnchor="middle" dominantBaseline="central" fill={INK} stroke="rgba(0,0,0,.35)" strokeWidth={6} paintOrder="stroke" fontFamily="system-ui, sans-serif">
          {initial}
        </text>
      )}
    </svg>
  );
}

// The same flag on a canvas, for the board's flag sprites.
export function drawFlag(color: string, mine: boolean, initial: string) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  const trace = (p: [number, number][]) => {
    g.beginPath();
    p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  g.fillStyle = mine ? GOLD : "#3a3a3a";
  g.fillRect(FLAG_POLE_X - 4, 12, 8, SIZE - 12);
  g.beginPath();
  g.arc(FLAG_POLE_X, 12, mine ? 11 : 7, 0, Math.PI * 2);
  g.fill();
  trace(clothOutline());
  g.fillStyle = color;
  g.fill();
  if (mine) {
    g.lineWidth = 8;
    g.lineJoin = "round";
    g.strokeStyle = INK;
    g.stroke();
    trace(starOutline());
    g.fillStyle = INK;
    g.fill();
  } else {
    g.font = "800 46px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(0,0,0,.35)";
    g.strokeText(initial, STAR.x, STAR.y + 2);
    g.fillStyle = INK;
    g.fillText(initial, STAR.x, STAR.y + 2);
  }
  return canvas;
}
