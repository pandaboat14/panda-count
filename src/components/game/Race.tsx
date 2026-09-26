"use client";

import type { GameView } from "@/game/engine";
import { FlagIcon, initialOf } from "./Flag";

// How close everyone is to the goal (or, in an endless world, who holds the most).
export function Race({ ctx }: { ctx: { view: GameView } }) {
  const { view } = ctx;
  const ranked = [...view.players].sort((a, b) => b.regions - a.regions);
  const top = Math.max(view.goal ?? 0, ranked[0]?.regions ?? 1, 1);
  return (
    <div className="race" aria-label={view.goal ? `Race to ${view.goal} regions` : "Regions held"}>
      <p className="race-head">{view.goal ? `🏁 Hold ${view.goal} regions for a full round to win` : "♾️ Endless world: most regions leads"}</p>
      <ul>
        {ranked.map((p) => (
          <li key={p.id} className={`${p.id === view.me ? "me" : ""}${p.id === view.threat ? " threat" : ""}`}>
            <span className="race-name">
              <FlagIcon color={p.color} mine={p.id === view.me} initial={initialOf(p.name)} size={16} />
              {p.bot ? "🤖 " : ""}
              {p.id === view.me ? "You" : p.name}
            </span>
            <span className="race-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (p.regions / top) * 100)}%`, background: p.color }} />
            </span>
            <span className="race-n">
              {p.regions}
              {view.goal ? `/${view.goal}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
