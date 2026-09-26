"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createGameAction, endGameAction, joinByCodeAction, leaveGameAction, type LobbyState } from "@/app/game/actions";
import { Avatar } from "../Avatar";

type GameSummary = {
  id: number;
  name: string;
  code: string;
  host: boolean;
  round: number;
  players: { id: string; name: string; color: string; avatar: string }[];
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
              <li key={g.id} className="game-row">
                <Link href={`/game/${g.id}`} className={`game-card${g.myTurn ? " my-turn" : ""}`}>
                  <span className="game-name">{g.name}</span>
                  <span className="game-meta">
                    Round {g.round} · {g.myTurn ? <strong>Your turn!</strong> : <>Waiting on {g.activeName}</>}
                  </span>
                  <span className="game-players">
                    {g.players.map((p) => (
                      <span key={p.id} className="avatar-ring" style={{ borderColor: p.color }} title={p.name}>
                        <Avatar value={p.avatar} userId={p.id} size={26} />
                      </span>
                    ))}
                    {g.players.length === 1 && <span className="muted small"> solo</span>}
                  </span>
                </Link>
                <form
                  action={g.host ? endGameAction : leaveGameAction}
                  onSubmit={(e) => {
                    const msg = g.host
                      ? `End "${g.name}" for everyone? The whole world and its history will be deleted.`
                      : `Leave "${g.name}"? Your land goes back to the wild pandas.`;
                    if (!confirm(msg)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={g.id} />
                  <button className="game-end">{g.host ? "End game" : "Leave"}</button>
                </form>
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
