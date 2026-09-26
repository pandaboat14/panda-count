"use client";

import { useState } from "react";
import type { Resource } from "@/game/regions";
import {
  BUILDINGS,
  BUILDING_TYPES,
  BUY_PRICE,
  BUY_PRICE_MARKET,
  GONDOLA_COST,
  GOODS,
  GOOD_INFO,
  GOOD_SOURCE,
  HEROES,
  HERO_IDS,
  RESOURCES,
  UNITS,
  UNIT_TYPES,
  type Cost,
  type Good,
} from "@/game/rules";

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

// Everything a good can be spent on, straight from the price tables.
function usesOf(g: Good) {
  const out: string[] = [];
  if ((GONDOLA_COST[g] ?? 0) > 0) out.push("🚡 gondolas");
  for (const t of UNIT_TYPES) if ((UNITS[t].cost[g] ?? 0) > 0) out.push(`${UNITS[t].icon} ${UNITS[t].plural}`);
  for (const b of BUILDING_TYPES) if ((BUILDINGS[b].cost[g] ?? 0) > 0) out.push(`${BUILDINGS[b].icon} ${BUILDINGS[b].label}`);
  for (const h of HERO_IDS) if ((HEROES[h].cost[g] ?? 0) > 0) out.push(`${HEROES[h].icon} ${HEROES[h].name}`);
  return out;
}

// A pop-down key to the goods bar: hidden until asked for.
export function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glossary">
      <button type="button" className="glossary-toggle" aria-expanded={open} aria-controls="goods-glossary" onClick={() => setOpen(!open)}>
        {open ? "▴ Hide the key" : "▾ What are these?"}
      </button>
      {open && (
        <dl id="goods-glossary" className="glossary-list">
          {GOODS.map((g) => (
            <div key={g}>
              <dt>
                <span aria-hidden="true">{GOOD_INFO[g].icon}</span> {GOOD_INFO[g].label}
                {(g === "coin" || g === "pandaCoin" || g === "camCoin") && <span className="muted small"> · currency</span>}
              </dt>
              <dd>
                <p>{GOOD_SOURCE[g]}</p>
                {RESOURCES.includes(g as Resource) && (
                  <p className="small">Short? Buy it at the Bank for {BUY_PRICE} 🪙 ({BUY_PRICE_MARKET} with a Market), or trade 4 of another resource for it (3 with a Market, 2 with Ping).</p>
                )}
                <p className="muted small">Used for: {usesOf(g).join(", ") || "trading"}</p>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
