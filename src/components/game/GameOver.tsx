"use client";

import { useState } from "react";
import type { GameView } from "@/game/engine";
import { HEROES } from "@/game/rules";
import { Avatar } from "../Avatar";

// Final standings for a finished game: most regions first, then resource cards as the tie-break.
export function GameOver({ view, avatars, endedAt }: { view: GameView; avatars: Record<string, string>; endedAt: string | null }) {
  const [open, setOpen] = useState(true);
  const ranked = [...view.players].sort((a, b) => b.regions - a.regions || b.cards - a.cards);
  if (!open) {
    return (
      <button className="btn small game-over-reopen" onClick={() => setOpen(true)}>
        🏁 Final standings
      </button>
    );
  }
  return (
    <section className="game-over" aria-label="Final standings">
      <p className="eyebrow">🏁 Game over{endedAt ? ` · ${new Date(endedAt).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}</p>
      <ol>
        {ranked.map((p, i) => (
          <li key={p.id}>
            <span className="place">{i === 0 ? "🏆" : `${i + 1}.`}</span>
            <span className="avatar-ring" style={{ borderColor: p.color }}>
              <Avatar value={avatars[p.id]} userId={p.id} size={24} />
            </span>
            <strong>{p.id === view.me ? `${p.name} (you)` : p.name}</strong>
            {p.bot && <span className="badge">🤖 {p.bot}</span>}
            <span className="muted small">
              {p.regions} region{p.regions === 1 ? "" : "s"}
              {p.heroes.length > 0 && ` · ${p.heroes.map((h) => HEROES[h].icon).join("")}`}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small">You can still look around the map and read the log.</p>
      <button className="btn ghost small" onClick={() => setOpen(false)}>Hide</button>
    </section>
  );
}
