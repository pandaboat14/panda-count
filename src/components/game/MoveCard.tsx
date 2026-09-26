"use client";

import { useEffect, useState } from "react";
import { emptyUnits, unitTotal, type Units } from "@/game/engine";
import { attackOdds } from "@/game/odds";
import { UNITS, UNIT_TYPES } from "@/game/rules";
import { Stepper } from "./bits";
import { NATIVE_LABEL, OddsLine, inPact, playerName, regionName, regionView, rested, unitLine, type Ctx } from "./panels";

// Where your troops go when you drop them on a region: everyone who's rested is picked to start with,
// and an invasion shows your odds before anyone sets off.
export function MoveCard({ ctx, from, to, onClose }: { ctx: Ctx; from: string; to: string; onClose: () => void }) {
  const { view, busy, act } = ctx;
  const source = regionView(view, from);
  const target = regionView(view, to);
  const avail = rested(source);
  const [pick, setPick] = useState<Units>(() => ({ ...avail }));
  const total = unitTotal(pick);
  const invading = target.owner !== view.me;
  const blocked = Boolean(target.owner && target.owner !== view.me && inPact(view, target.owner));
  const leavesEmpty = total > 0 && unitTotal(source.units ?? emptyUnits()) === total;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div className="move-card" role="dialog" aria-label={invading ? `Invade ${regionName(to)}` : `Move troops to ${regionName(to)}`}>
      <p className="kicker">
        {invading ? "Invade" : "Move troops"} · from {regionName(from)}
      </p>
      <h3>
        {invading ? "⚔️" : "➡️"} {regionName(to)}
      </h3>
      {invading && (
        <p className="small">
          Defending: {target.fog ? "unknown" : unitLine(target.units)}
          {target.buildings?.includes("fort") && " · 🏰 fort (+1)"}
          {target.owner ? ` · ${playerName(view, target.owner)}` : target.native ? ` · ${NATIVE_LABEL[target.native]}` : ""}
        </p>
      )}
      <div className="unit-pick">
        {UNIT_TYPES.filter((t) => avail[t] > 0).map((t) => (
          <label key={t}>
            <span>
              {UNITS[t].icon} {UNITS[t].plural} <span className="muted">({avail[t]})</span>
            </span>
            <Stepper value={pick[t]} max={avail[t]} onChange={(n) => setPick({ ...pick, [t]: n })} label={UNITS[t].plural} />
          </label>
        ))}
      </div>
      {invading && total > 0 && <OddsLine odds={attackOdds(view, from, to, pick)} />}
      {leavesEmpty && <p className="muted small">Everyone&rsquo;s going: {regionName(from)} will be left empty.</p>}
      <div className="form-actions">
        <button
          type="button"
          className={`btn${invading ? " danger" : ""}`}
          disabled={busy || !total || blocked}
          onClick={async () => {
            if (await act({ type: "move", from, to, units: pick })) onClose();
          }}
        >
          {blocked ? "You have a pact 🤝" : invading ? `Invade with ${total}` : `Send ${total}`}
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
