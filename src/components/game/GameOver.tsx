"use client";

import { useState } from "react";
import type { GameView } from "@/game/engine";
import { HEROES } from "@/game/rules";
import { Avatar } from "../Avatar";

// Final standings for a finished game: most regions first, then resource cards as the tie-break.
export function GameOver({ view, avatars, endedAt }: { view: GameView; avatars: Record<string, string>; endedAt: string | null }) {
  const [open, setOpen] = useState(true);
  // The winner (if the game had a goal) comes first; then most regions, with resource cards as the tie-break.
  const ranked = [...view.players].sort((a, b) => Number(b.id === view.winner) - Number(a.id === view.winner) || b.regions - a.regions || b.cards - a.cards);
  const champ = view.players.find((p) => p.id === view.winner);
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
      {champ && (
        <h2 className="game-over-title">
          {champ.id === view.me ? "🏆 You won the world!" : `🏆 ${champ.name} won the world`}
          {view.goal ? <span className="muted small"> · held {view.goal} regions for a full round</span> : null}
        </h2>
      )}
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
              {p.convictions > 0 && ` · ☠️ ${p.convictions} war crimes conviction${p.convictions === 1 ? "" : "s"}`}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small">You can still look around the map and read the log.</p>
      <button className="btn ghost small" onClick={() => setOpen(false)}>Hide</button>
    </section>
  );
}
