"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { GameView } from "@/game/engine";
import type { Payout, RollShow } from "@/game/rollReport";
import { createMapDrop, type DropPhase, type MapDropStage } from "./mapDropScene";

type Props = {
  view: GameView;
  show: RollShow;
  payouts: Payout[];
  live: boolean;
  still: boolean;
  sound: boolean;
  label: string;
  onPhase: (phase: DropPhase) => void;
  onStage: (stage: MapDropStage | null) => void;
};

// The 3D table for the dice pop-up. Loaded only in the browser: it's three.js plus a physics engine.
export default function MapDrop({ view, show, payouts, live, still, sound, label, onPhase, onStage }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<MapDropStage | null>(null);
  const phaseChanged = useEffectEvent((phase: DropPhase) => onPhase(phase));
  const stageChanged = useEffectEvent((s: MapDropStage | null) => onStage(s));
  const soundOn = useEffectEvent(() => sound);

  useEffect(() => {
    // Throws without WebGL, which hands over to the SceneBoundary's flat dice.
    const el = host.current!;
    const s = createMapDrop({
      host: el,
      view,
      show,
      payouts,
      live,
      still,
      sound: soundOn(),
      onPhase: (p) => {
        // Ready to throw: Space or Enter throws from here.
        if (p === "waiting") el.focus({ preventScroll: true });
        phaseChanged(p);
      },
    });
    stage.current = s;
    stageChanged(s);
    return () => {
      stageChanged(null);
      stage.current = null;
      s.dispose();
    };
  }, [view, show, payouts, live, still]);

  useEffect(() => {
    stage.current?.setSound(sound);
  }, [sound]);

  return <div ref={host} className="dice-gl" tabIndex={live ? 0 : -1} role={live ? "button" : undefined} aria-label={live ? label : undefined} />;
}
