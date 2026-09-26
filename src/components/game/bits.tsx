"use client";

import { GOODS, GOOD_INFO, type Cost, type Good } from "@/game/rules";

export function CostChips({ cost, have }: { cost: Cost; have?: Partial<Record<Good, number>> }) {
  const parts = GOODS.filter((g) => (cost[g] ?? 0) > 0);
  if (!parts.length) return <span className="cost free">free</span>;
  return (
    <span className="cost">
      {parts.map((g) => (
        <span key={g} className={have && (have[g] ?? 0) < (cost[g] ?? 0) ? "short" : ""} title={GOOD_INFO[g].label}>
          {cost[g]}
          {GOOD_INFO[g].icon}
        </span>
      ))}
    </span>
  );
}

export function affordable(cost: Cost, have?: Partial<Record<Good, number>>) {
  if (!have) return false;
  return GOODS.every((g) => (have[g] ?? 0) >= (cost[g] ?? 0));
}

export function times(cost: Cost, n: number): Cost {
  return Object.fromEntries(Object.entries(cost).map(([g, v]) => [g, (v ?? 0) * n])) as Cost;
}

export function Stepper({ value, min = 0, max, onChange, label }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
        −
      </button>
      <output>{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </span>
  );
}

export function GoodsBar({ goods }: { goods?: Partial<Record<Good, number>> }) {
  return (
    <ul className="goods-bar" aria-label="Your goods">
      {GOODS.map((g) => (
        <li key={g} title={GOOD_INFO[g].label} className={g === "coin" || g === "pandaCoin" || g === "camCoin" ? "currency" : ""}>
          <span aria-hidden="true">{GOOD_INFO[g].icon}</span>
          <strong>{goods?.[g] ?? 0}</strong>
          <span className="sr-only">{GOOD_INFO[g].label}</span>
        </li>
      ))}
    </ul>
  );
}
