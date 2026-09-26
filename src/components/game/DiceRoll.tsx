"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameView } from "@/game/engine";
import { payouts as payoutsFor, type RollShow } from "@/game/rollReport";
import { SceneBoundary } from "../SceneBoundary";
import { inkOn } from "./colors";
import type { DropPhase, MapDropStage } from "./mapDropScene";
import { RollReport } from "./RollReport";

const MapDrop = dynamic(() => import("./MapDrop"), { ssr: false, loading: () => null });

// Once the result is up the pop-up closes on its own after this long, unless the player is reading it.
const AUTO_CLOSE_MS = 12000;
const SOUND_KEY = "pd-dice-sound";

// The start-of-turn roll, thrown onto a tabletop world map. On your turn you throw the dice yourself (tap
// them, or press and drag to flick them); a replay throws itself, seeded from the roll, so everyone sees the
// same tumble land on the same numbers. Then it says exactly what you and everyone else collected.
export function DiceRoll({ show, view, live, still, onClose }: { show: RollShow; view: GameView; live: boolean; still: boolean; onClose: () => void }) {
  // The table as it stood when the pop-up opened, so news from the server doesn't reset a throw mid-air.
  const [table] = useState(view);
  const pays = useMemo(() => payoutsFor(show, table), [show, table]);
  const [phase, setPhase] = useState<DropPhase>("loading");
  const [flat, setFlat] = useState(false); // no 3D on this device: flat dice, and the result at once
  const [reported, setReported] = useState(false);
  const [held, setHeld] = useState(false); // they've touched it since the result came up, so it stays open
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const letsGo = useRef<HTMLButtonElement>(null);
  const stage = useRef<MapDropStage | null>(null);
  const skipped = useRef(false);

  const roller = table.players.find((p) => p.id === show.roller);
  const seven = show.total === 7;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // Not the sound toggle, which the dialog would pick as its first button: Skip (the table takes over once it's ready).
    letsGo.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (reported) letsGo.current?.focus({ preventScroll: true });
  }, [reported]);
  useEffect(() => {
    if (!reported || held) return;
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [reported, held, onClose]);

  const onPhase = useCallback((p: DropPhase) => {
    setPhase(p);
    if (p === "done") setReported(true);
  }, []);
  const onStage = useCallback((s: MapDropStage | null) => {
    stage.current = s;
    // Skipped before the table was even set: it lands the moment it's ready.
    if (s && skipped.current) s.skip();
  }, []);
  const onFlat = useCallback(() => {
    setFlat(true);
    setReported(true);
  }, []);
  const skip = () => {
    skipped.current = true;
    stage.current?.skip();
  };
  const reading = () => {
    if (reported && !held) setHeld(true);
  };
  const toggleSound = () => {
    setSound(!sound);
    try {
      localStorage.setItem(SOUND_KEY, sound ? "off" : "on");
    } catch {
      /* private mode */
    }
  };

  return (
    <dialog
      ref={dialog}
      className="dice-dialog"
      aria-labelledby="dice-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dice-card" onPointerDown={reading} onKeyDown={reading} onWheel={reading} onTouchStart={reading}>
        <header className="dice-head">
          <div>
            <p className="eyebrow">
              🎲 Round {show.round} · {live ? "your turn" : "replay"}
            </p>
            <h2 id="dice-title">{live ? "Throw for your turn" : show.roller === table.me ? "Your roll" : roller ? `${roller.name}'s roll` : "The last roll"}</h2>
          </div>
          <button type="button" className="btn ghost small" aria-pressed={sound} aria-label="Dice sounds" title={sound ? "Dice sounds on" : "Dice sounds off"} onClick={toggleSound}>
            {sound ? "🔊" : "🔇"}
          </button>
        </header>

        <div className="dice-stage" data-phase={flat ? "flat" : phase}>
          <SceneBoundary fallback={<FlatDice show={show} color={roller?.color ?? "#d64a2b"} onShown={onFlat} />}>
            <MapDrop
              view={table}
              show={show}
              payouts={pays}
              live={live}
              still={still}
              sound={sound}
              label="Throw the dice onto the map: tap them, or press and drag to flick them. Space or Enter throws them too."
              onPhase={onPhase}
              onStage={onStage}
            />
          </SceneBoundary>
          {!flat && live && phase === "waiting" && <p className="dice-hint">Tap or flick the dice onto the map</p>}
          {!flat && !live && phase !== "done" && phase !== "loading" && (
            <p className="dice-tag">
              <span className="rec" aria-hidden="true" />
              Replay: the throw everyone sees
            </p>
          )}
          {(phase === "landed" || phase === "done" || flat) && (
            <div className={`dice-total${seven ? " seven" : ""}`}>
              <small>{seven ? "Ogre raid" : "Rolled"}</small>
              <b>{show.total}</b>
            </div>
          )}
        </div>

        <div className={`dice-report-wrap${reported ? " open" : ""}`} aria-live="polite">
          <div>{reported && <RollReport show={show} view={table} payouts={pays} />}</div>
        </div>

        <footer className="dice-foot">
          {reported && !held && !still && <span className="feed-timer" style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }} />}
          <div className="form-actions">
            {reported && !flat && (
              <button type="button" className="btn ghost small" onClick={() => stage.current?.replay()}>
                ↺ Watch again
              </button>
            )}
            <button ref={letsGo} type="button" className="btn small" onClick={reported ? onClose : skip}>
              {reported ? "Let's go" : "Skip"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

// Without 3D the dice are drawn flat, and the result shows straight away.
function FlatDice({ show, color, onShown }: { show: RollShow; color: string; onShown: () => void }) {
  useEffect(() => onShown(), [onShown]);
  const die = { background: color, color: inkOn(color) };
  return (
    <p className="dice-flat">
      <span className="die-chip" style={die}>{show.roll[0]}</span>
      <span className="die-chip" style={die}>{show.roll[1]}</span>
    </p>
  );
}
