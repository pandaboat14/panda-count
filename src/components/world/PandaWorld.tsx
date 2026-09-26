"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Panda } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { useReducedMotion } from "@/lib/hooks";
import { SceneBoundary } from "../SceneBoundary";
import { SiteFooter } from "../SiteFooter";
import { TradingCardDialog } from "../TradingCard";

const Scene = dynamic(() => import("./Scene"), { ssr: false, loading: () => null });

type Props = { pandas: Panda[]; lastUpdated: string; canEdit: boolean; topBar: React.ReactNode };

// Shown while the scene loads, and in place of it when WebGL isn't available.
function Fallback({ count }: { count: number }) {
  return (
    <div className="world-fallback" aria-hidden="true">
      <p className="eyebrow">Giant pandas in America</p>
      <div className="count">{count}</div>
    </div>
  );
}

export function PandaWorld({ pandas, lastUpdated, canEdit, topBar }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const still = useReducedMotion();

  const residents = pandas.filter((p) => p.status === "resident");
  const incoming = pandas.filter((p) => p.status === "incoming");
  const zooCount = new Set(residents.map((p) => p.zoo)).size;
  const panda = pandas.find((p) => p.id === selected) ?? null;

  return (
    <main className="world">
      <h1 className="sr-only">{residents.length} giant pandas in America</h1>
      {!ready && <Fallback count={residents.length} />}
      <SceneBoundary fallback={<Fallback count={residents.length} />}>
        <Scene
          pandas={pandas}
          count={residents.length}
          still={still}
          onSelect={setSelected}
          onReady={() => setReady(true)}
        />
      </SceneBoundary>

      <div className="world-overlay">
        {topBar}
        <div className="hud">
          <p className="hud-sub">
            living at <strong>{zooCount} zoo{zooCount === 1 ? "" : "s"}</strong> across the United States
            {incoming.length > 0 && <>, with <strong>{incoming.length} more</strong> on the way</>}.
          </p>
          <ul className="chips" aria-label="Open a panda's trading card">
            {pandas.map((p) => (
              <li key={p.id}>
                <button
                  className={`chip${p.status === "incoming" ? " soon" : ""}`}
                  onClick={() => setSelected(p.id)}
                  aria-haspopup="dialog"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="hud-meta">
            Last checked <time dateTime={lastUpdated}>{fmtDate(lastUpdated)}</time> · Drag to look around, tap a panda
            for its card · Every US giant panda is on loan from China through conservation partnerships.
          </p>
          <SiteFooter className="in-hud" />
        </div>
      </div>

      <TradingCardDialog
        panda={panda}
        index={panda ? pandas.indexOf(panda) : 0}
        residents={residents}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
