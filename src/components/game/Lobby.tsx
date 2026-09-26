"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createGameAction, joinByCodeAction, type LobbyState } from "@/app/game/actions";

type GameSummary = {
  id: number;
  name: string;
  code: string;
  round: number;
  players: { name: string; color: string }[];
  activeName: string;
  myTurn: boolean;
};

export function Lobby({ games }: { games: GameSummary[] }) {
  const [createState, create, creating] = useActionState<LobbyState, FormData>(createGameAction, {});
  const [joinState, join, joining] = useActionState<LobbyState, FormData>(joinByCodeAction, {});
  return (
    <div className="lobby-grid">
      <section>
        <h2>Your worlds</h2>
        {games.length === 0 ? (
          <p className="lede">No games yet. Start one and send the Kirds the invite link.</p>
        ) : (
          <ul className="game-list">
            {games.map((g) => (
              <li key={g.id}>
                <Link href={`/game/${g.id}`} className={`game-card${g.myTurn ? " my-turn" : ""}`}>
                  <span className="game-name">{g.name}</span>
                  <span className="game-meta">
                    Round {g.round} · {g.myTurn ? <strong>Your turn!</strong> : <>Waiting on {g.activeName}</>}
                  </span>
                  <span className="game-players">
                    {g.players.map((p) => (
                      <span key={p.name} className="player-dot" style={{ background: p.color }} title={p.name} />
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="lobby-forms">
        <form action={create} className="panda-form">
          <fieldset>
            <legend>Start a new world</legend>
            <label className="wide">
              Name it
              <input name="name" maxLength={60} placeholder="The Kirds' World" />
            </label>
            {createState.error && <p className="notice error wide">{createState.error}</p>}
            <div className="form-actions wide">
              <button className="btn" disabled={creating}>{creating ? "Forging the world…" : "Create game"}</button>
            </div>
          </fieldset>
        </form>
        <form action={join} className="panda-form">
          <fieldset>
            <legend>Got an invite code?</legend>
            <label className="wide">
              Code
              <input name="code" maxLength={6} placeholder="ABC123" autoCapitalize="characters" style={{ textTransform: "uppercase", letterSpacing: ".2em" }} />
            </label>
            {joinState.error && <p className="notice error wide">{joinState.error}</p>}
            <div className="form-actions wide">
              <button className="btn ghost" disabled={joining}>Join</button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
