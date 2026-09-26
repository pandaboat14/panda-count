"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SceneBoundary } from "../SceneBoundary";

const ChanceCubes = dynamic(() => import("./ChanceCube"), { ssr: false, loading: () => null });

// The start-of-turn roll: two chance cubes tumble onto the numbers the server rolled, then we say what they did.
export function DiceRoll({
  roll,
  lines,
  still,
  onClose,
}: {
  roll: [number, number];
  lines: string[];
  still: boolean;
  onClose: () => void;
}) {
  const [landed, setLanded] = useState(still);
  const total = roll[0] + roll[1];

  // Close with Escape, and on its own a while after the result has had time to be read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [landed, onClose]);

  return (
    <div className="dice-overlay" role="dialog" aria-modal="true" aria-label={`Dice roll: ${total}`} onClick={onClose}>
      <div className="dice-card" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">🎲 The chance cubes</p>
        <div className="dice-stage">
          <SceneBoundary fallback={<p className="dice-fallback">{roll[0]} + {roll[1]}</p>}>
            <ChanceCubes roll={roll} still={still} onLanded={() => setLanded(true)} />
          </SceneBoundary>
        </div>
        <div className={`dice-result${landed ? " shown" : ""}`} aria-live="polite">
          {landed && (
            <>
              <h2>
                {roll[0]} + {roll[1]} = {total}
                {total === 7 && <span className="raid"> Ogre raid! 👹</span>}
              </h2>
              {lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <p className="muted small">Blue, it&rsquo;s odd. Red, it&rsquo;s even.</p>
            </>
          )}
        </div>
        <div className="form-actions">
          <button className="btn small" onClick={onClose} autoFocus>
            {landed ? "Let's go" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
