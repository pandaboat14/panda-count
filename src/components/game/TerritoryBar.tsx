"use client";

// "Your land": every region you hold, how many troops are there and how many can move, what's built, and which
// ones are in danger. Tap one to fly the globe there and open it.

import { useMemo, useState } from "react";
import { regionReports, restedIn } from "@/game/army";
import { unitTotal, type GameView } from "@/game/engine";
import { BUILDINGS, HEROES } from "@/game/rules";
import { meIn, territoryOrder, unitsOf } from "@/game/turnOptions";
import { FlagIcon } from "./Flag";
import { regionName } from "./panels";

export function TerritoryBar({ view, myTurn, selected, onPick }: { view: GameView; myTurn: boolean; selected: string | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const reports = useMemo(() => new Map(regionReports(view).map((r) => [r.region.id, r])), [view]);
  const order = useMemo(() => territoryOrder(view), [view]);
  const me = meIn(view);
  const troops = order.reduce((n, id) => n + unitTotal(unitsOf(reports.get(id)?.region)), 0);
  const ready = order.reduce((n, id) => n + unitTotal(reports.get(id)?.ready ?? unitsOf()), 0);
  const risky = order.filter((id) => (reports.get(id)?.danger?.win ?? 0) >= 0.5).length;
  if (!order.length) return null;
  return (
    <section className={`territory${open ? "" : " closed"}`} aria-label="Your land">
      <button type="button" className="territory-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <FlagIcon color={me.color} mine size={20} />
        <strong>Your land</strong>
        <span className="territory-sum">
          {order.length} region{order.length === 1 ? "" : "s"} · {troops} troops{myTurn ? ` · ${ready} ready` : ""}
          {risky ? ` · ⚠️ ${risky} at risk` : ""}
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul className="territory-list">
          {order.map((id) => {
            const rep = reports.get(id);
            const r = rep?.region;
            const risk = rep?.danger?.win ?? 0;
            const n = unitTotal(unitsOf(r));
            const go = r ? unitTotal(restedIn(r)) : 0;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`territory-item${selected === id ? " on" : ""}${risk >= 0.5 ? " danger" : risk >= 0.2 ? " watch" : ""}`}
                  aria-current={selected === id ? "true" : undefined}
                  onClick={() => onPick(id)}
                  title={`${regionName(view, id)}: ${n} troop${n === 1 ? "" : "s"}${myTurn ? `, ${go} ready to move` : ""}${risk >= 0.2 ? `, ${Math.round(risk * 100)}% at risk` : ""}`}
                >
                  <span className="t-name">
                    {id === me.capital && <span aria-label="capital">👑 </span>}
                    {regionName(view, id)}
                  </span>
                  <span className={`t-troops${n ? "" : " empty"}`}>
                    🪖 {n}
                    {myTurn && n > 0 && <span className={`t-ready${go ? "" : " none"}`}>{go ? `${go} ready` : "resting"}</span>}
                  </span>
                  <span className="t-icons" aria-hidden="true">
                    {r?.buildings?.map((b) => BUILDINGS[b].icon).join("")}
                    {rep?.heroes.map((h) => HEROES[h].icon).join("")}
                  </span>
                  {risk >= 0.2 && <span className="t-risk">⚠️ {Math.round(risk * 100)}%</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
