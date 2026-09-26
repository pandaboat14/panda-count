"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleData, GameEvent, GameView } from "@/game/engine";
import { battleScript } from "@/game/battleScript";
import { placeName } from "@/game/regions";
import { UNITS, UNIT_TYPES } from "@/game/rules";
import { SceneBoundary } from "../SceneBoundary";
import { NATIVE_COLORS } from "./colors";

const BattleScene = dynamic(() => import("./BattleScene"), { ssr: false, loading: () => null });

const STEP_MS = 1700;

const lineup = (u: Partial<Record<string, number>>) =>
  UNIT_TYPES.filter((t) => (u[t] ?? 0) > 0)
    .map((t) => `${u[t]} ${UNITS[t].icon}`)
    .join("  ") || "none";

export function BattleView({ event, view, still, onClose }: { event: GameEvent; view: GameView; still: boolean; onClose: () => void }) {
  const data = event.data as unknown as BattleData;
  const { soldiers, steps } = useMemo(() => battleScript(data), [data]);
  const [step, setStep] = useState(still ? steps.length : 0);
  const dialog = useRef<HTMLDialogElement>(null);
  const done = step >= steps.length;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setStep((n) => n + 1), step === 0 ? 900 : STEP_MS);
    return () => clearTimeout(t);
  }, [step, done]);

  const attacker = view.players.find((p) => p.id === event.actor);
  const defender = view.players.find((p) => p.id === data.defender);
  const atkColor = attacker?.color ?? "#888";
  const defColor = defender?.color ?? NATIVE_COLORS[(data.defender ?? "wild") as keyof typeof NATIVE_COLORS] ?? "#bbb";
  const current = step > 0 ? steps[step - 1] : null;
  const meWon = (event.actor === view.me && data.won) || (data.defender === view.me && !data.won);
  const meInvolved = event.actor === view.me || data.defender === view.me;
  const place = data.place ?? placeName(data.to, view.regions.find((r) => r.id === data.to)?.name);

  return (
    <dialog ref={dialog} className="battle-dialog" onClose={onClose} aria-label={`Battle for ${place}`}>
      <div className="battle-stage">
        <SceneBoundary fallback={null}>
          <BattleScene soldiers={soldiers} step={step} atkColor={atkColor} defColor={defColor} still={still} />
        </SceneBoundary>
        <div className="battle-top">
          <div className="battle-side" style={{ borderColor: atkColor }}>
            <strong>⚔️ {attacker?.name ?? "Attacker"}</strong>
            <span>{lineup(data.attacker)}</span>
            {data.atkBonus > 0 && <span className="small">+{data.atkBonus} hero bonus</span>}
          </div>
          <div className="battle-title">
            <span className="eyebrow">Battle for</span>
            <strong>{place}</strong>
          </div>
          <div className="battle-side right" style={{ borderColor: defColor }}>
            <strong>🛡️ {defender?.name ?? data.defenderName}</strong>
            <span>{lineup(data.defenderStart)}</span>
            {data.defBonus > 0 && <span className="small">+{data.defBonus} fort/hero</span>}
          </div>
        </div>
        {current && !done && (
          <div className="battle-dice" aria-live="polite">
            {current.summary ? (
              <p>{current.summary}</p>
            ) : (
              <>
                <span className="dice atk">{current.a.map((n, i) => <b key={i}>{n}</b>)}</span>
                <span className="vs">Round {step}</span>
                <span className="dice def">{current.d.map((n, i) => <b key={i}>{n}</b>)}</span>
              </>
            )}
          </div>
        )}
        {done && (
          <div className={`battle-result${meInvolved ? (meWon ? " win" : " loss") : ""}`}>
            <h2>{data.won ? `${attacker?.name ?? "The attacker"} takes ${place}!` : `${defender?.name ?? data.defenderName} holds ${place}!`}</h2>
            <p>
              Attackers lost {lineup(data.attackerLost)} · Defenders lost {lineup(data.defenderLost)}
            </p>
            <div className="form-actions">
              <button className="btn ghost small" onClick={() => setStep(0)}>↺ Watch again</button>
              <button className="btn small" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
        {!done && (
          <button className="btn ghost small battle-skip" onClick={() => setStep(steps.length)}>
            Skip ⏭
          </button>
        )}
      </div>
    </dialog>
  );
}
