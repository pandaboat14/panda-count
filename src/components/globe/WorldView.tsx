"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { World } from "@/lib/types";
import { fmtAsOf } from "@/lib/format";
import { useReducedMotion } from "@/lib/hooks";
import { SceneBoundary } from "../SceneBoundary";
import { COLORS, placeColor, type Selection } from "./GlobeScene";

const GlobeScene = dynamic(() => import("./GlobeScene"), { ssr: false, loading: () => null });

type Props = World & { canEdit: boolean; topBar: React.ReactNode };

const nf = new Intl.NumberFormat("en-US");

export function WorldView({ places, wild, captive, canEdit, topBar }: Props) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  // Picking from the list also spins the globe there, so the card has context behind it.
  const pick = (s: Selection) => {
    const spot = s.type === "place" ? places.find((p) => p.id === s.id) : wild.find((r) => r.id === s.id);
    if (spot) setFocus({ lat: spot.lat, lng: spot.lng });
    setSelected(s);
  };
  const [ready, setReady] = useState(false);
  const head = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const frame = useFrame(head, hud);
  const still = useReducedMotion();

  const wildTotal = wild.reduce((n, r) => n + r.estimate, 0);
  const total = wildTotal + captive.count;
  const outsideChina = places.filter((p) => p.country !== "China" && p.count > 0);
  const outsideCount = outsideChina.reduce((n, p) => n + p.count, 0);
  const countries = new Set(outsideChina.map((p) => p.country)).size;
  const sorted = [...places].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const place = selected?.type === "place" ? places.find((p) => p.id === selected.id) : undefined;
  const range = selected?.type === "wild" ? wild.find((r) => r.id === selected.id) : undefined;

  return (
    <main className="world globe">
      <h1 className="sr-only">About {nf.format(total)} giant pandas in the world</h1>
      {!ready && (
        <div className="world-fallback" aria-hidden="true">
          <p className="eyebrow">Giant pandas on Earth</p>
          <div className="count">~{nf.format(total)}</div>
        </div>
      )}
      <div className="globe-stage">
        <SceneBoundary fallback={null}>
          <GlobeScene
            places={places}
            wild={wild}
            still={still}
            focus={focus}
            frame={frame}
            onSelect={setSelected}
            onReady={() => setReady(true)}
          />
        </SceneBoundary>
      </div>

      <div className="world-overlay">
        {topBar}
        <div className="globe-head" ref={head}>
          <p className="eyebrow">Giant pandas on Earth</p>
          <div className="globe-count">~{nf.format(total)}</div>
          <p className="hud-sub">
            <strong>{nf.format(wildTotal)}</strong> in the wild · <strong>{nf.format(captive.count)}</strong> in human care ·{" "}
            <strong>{outsideCount}</strong> outside China in {countries} countries and regions
          </p>
        </div>
        <div className="hud" ref={hud}>
          <ul className="legend" aria-label="Map key">
            <li><i style={{ background: COLORS.china }} />China&rsquo;s breeding centres</li>
            <li><i style={{ background: COLORS.abroad }} />Zoos abroad</li>
            <li><i style={{ background: COLORS.us }} />US zoos</li>
            <li><i className="heat" />Wild range</li>
          </ul>
          <ul className="chips" aria-label="Open a place">
            {sorted.map((p) => (
              <li key={p.id}>
                <button className="chip" onClick={() => pick({ type: "place", id: p.id })} aria-haspopup="dialog">
                  <i style={{ background: placeColor(p) }} />
                  {p.country === "China" ? p.name.replace(/ of Giant Panda.*| for the Giant Panda/, "") : p.city}
                  <span className="n">{p.count || `+${p.incoming}`}</span>
                </button>
              </li>
            ))}
            {wild.map((r) => (
              <li key={`w${r.id}`}>
                <button className="chip wild" onClick={() => pick({ type: "wild", id: r.id })} aria-haspopup="dialog">
                  <i className="heat" />
                  {r.name} (wild)
                  <span className="n">~{r.estimate}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hud-meta">
            Drag to spin, pinch or scroll to zoom · Wild numbers are from China&rsquo;s {wild[0]?.survey ?? "national survey"} · In
            human care: {nf.format(captive.count)} as of {fmtAsOf(captive.asOf)} (
            <a href={captive.sourceUrl} target="_blank" rel="noopener noreferrer">source</a>), including about{" "}
            {Math.max(0, captive.count - places.reduce((n, p) => n + p.count, 0))} at other zoos in China that aren&rsquo;t mapped
            one by one.
          </p>
        </div>
      </div>

      <InfoCard open={Boolean(place || range)} onClose={() => setSelected(null)}>
        {place && (
          <>
            <p className="info-kind" style={{ color: placeColor(place) }}>
              {place.us ? "US zoo" : place.kind === "breeding_center" ? "Breeding centre" : "Zoo"} · {place.city}, {place.country}
            </p>
            <h2>{place.name}</h2>
            <div className="info-count">
              {place.count}
              <span>{place.count === 1 ? "giant panda" : "giant pandas"}</span>
            </div>
            {place.incoming > 0 && <p className="info-soon">+{place.incoming} on the way</p>}
            {place.names && <p className="info-names">{place.names}</p>}
            {place.note && <p className="fact">{place.note}</p>}
            <p className="info-meta">
              As of {fmtAsOf(place.asOf)}
              {place.sourceUrl && (
                <> · <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer">{place.us ? "Zoo page" : "Source"} ↗</a></>
              )}
            </p>
            <div className="form-actions">
              {place.us && <Link className="btn" href="/">See their trading cards</Link>}
              {canEdit && !place.us && <Link className="btn ghost" href={`/world/places/${place.id}/edit`}>Update this place</Link>}
            </div>
          </>
        )}
        {range && (
          <>
            <p className="info-kind" style={{ color: COLORS.china }}>Wild range · {range.province}, China</p>
            <h2>{range.name} Mountains</h2>
            <div className="info-count">
              ~{range.estimate}
              <span>wild giant pandas</span>
            </div>
            <p className="info-meta">
              {range.survey}
              {range.sourceUrl && (
                <> · <a href={range.sourceUrl} target="_blank" rel="noopener noreferrer">Source ↗</a></>
              )}
            </p>
            {canEdit && (
              <div className="form-actions">
                <Link className="btn ghost" href={`/world/wild/${range.id}/edit`}>Update this estimate</Link>
              </div>
            )}
          </>
        )}
      </InfoCard>
    </main>
  );
}

// How much of the screen the headline (top) and the list (bottom) cover, kept current on resize.
function useFrame(head: React.RefObject<HTMLElement | null>, hud: React.RefObject<HTMLElement | null>) {
  const [frame, setFrame] = useState({ top: 0, bottom: 0 });
  useEffect(() => {
    const measure = () => {
      const h = head.current?.getBoundingClientRect();
      const b = hud.current?.getBoundingClientRect();
      if (!h || !b) return;
      // The list's fade overlaps the globe a little on purpose.
      setFrame({ top: Math.round(h.bottom + 8), bottom: Math.round(window.innerHeight - b.top - 40) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (head.current) ro.observe(head.current);
    if (hud.current) ro.observe(hud.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [head, hud]);
  return frame;
}

function InfoCard({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="card-dialog info-dialog"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {open && (
        <>
          <button className="close" aria-label="Close" onClick={onClose}>&times;</button>
          <article className="info-card">{children}</article>
        </>
      )}
    </dialog>
  );
}
