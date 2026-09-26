"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createGameAction, deleteGameAction, endGameAction, joinByCodeAction, leaveGameAction, type LobbyState } from "@/app/game/actions";
import { BOT_LEVELS, type BotLevel } from "@/game/engine";
import { Avatar } from "../Avatar";

type GameSummary = {
  id: number;
  name: string;
  code: string;
  host: boolean;
  round: number;
  goal: number | null;
  winnerName: string | null;
  status: "active" | "complete";
  players: { id: string; name: string; color: string; avatar: string; bot: BotLevel | null }[];
  activeName: string;
  myTurn: boolean;
  updatedAt: string;
  endedAt: string | null;
};

type Seat = { kind: "human" } | { kind: "computer"; level: BotLevel };
const LEVEL_LABEL: Record<BotLevel, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const MAX_PLAYERS = 8;

export function Lobby({ games }: { games: GameSummary[] }) {
  const [createState, create, creating] = useActionState<LobbyState, FormData>(createGameAction, {});
  const [joinState, join, joining] = useActionState<LobbyState, FormData>(joinByCodeAction, {});
  const [seats, setSeats] = useState<Seat[]>([{ kind: "computer", level: "medium" }, { kind: "computer", level: "medium" }]);
  const active = games.filter((g) => g.status === "active");
  const done = games.filter((g) => g.status === "complete");
  const setSeat = (i: number, seat: Seat) => setSeats(seats.map((s, j) => (j === i ? seat : s)));

  return (
    <div className="lobby-grid">
      <section>
        <h2>In progress</h2>
        {active.length === 0 ? (
          <p className="lede">No games going. Start one: play the computer, or send the Kirds the invite link.</p>
        ) : (
          <ul className="game-list">
            {active.map((g) => (
              <GameRow key={g.id} g={g} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <>
            <h2 className="lobby-sub">Complete</h2>
            <ul className="game-list">
              {done.map((g) => (
                <GameRow key={g.id} g={g} />
              ))}
            </ul>
          </>
        )}
        <p className="muted small">Every move is saved as you make it, so you can close the tab and pick up any game later.</p>
      </section>
      <section className="lobby-forms">
        <form action={create} className="panda-form">
          <fieldset>
            <legend>Start a new world</legend>
            <label className="wide">
              Name it
              <input name="name" maxLength={60} placeholder="The Kirds' World" />
            </label>
            <label className="wide">
              How long?
              <select name="goal" defaultValue="25">
                <option value="25">Standard: hold 25 regions to win (about 40 rounds)</option>
                <option value="30">Long: hold 30 regions to win (45+ rounds)</option>
                <option value="35">Epic: hold 35 regions to win (a war that can run 100+ rounds)</option>
                <option value="endless">Endless: it never ends (the Kirds&rsquo; classic)</option>
              </select>
              <span className="hint">To win, you must still hold the goal when your next turn starts, so everyone gets one last chance to stop you.</span>
            </label>
            <div className="wide seat-list" role="group" aria-label="Players">
              <p className="seat-head">Players</p>
              <div className="seat">
                <span className="seat-name">1. You</span>
                <span className="seat-kind">🙋 Human</span>
              </div>
              {seats.map((seat, i) => (
                <div className="seat" key={i}>
                  <span className="seat-name">{i + 2}.</span>
                  <select
                    aria-label={`Player ${i + 2}`}
                    value={seat.kind}
                    onChange={(e) => setSeat(i, e.target.value === "human" ? { kind: "human" } : { kind: "computer", level: "medium" })}
                  >
                    <option value="human">🙋 Human</option>
                    <option value="computer">🤖 Computer</option>
                  </select>
                  {seat.kind === "computer" ? (
                    <select aria-label={`Player ${i + 2} difficulty`} value={seat.level} onChange={(e) => setSeat(i, { kind: "computer", level: e.target.value as BotLevel })}>
                      {BOT_LEVELS.map((l) => (
                        <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="muted small">Invite them with the link</span>
                  )}
                  <input type="hidden" name="seat" value={seat.kind === "computer" ? seat.level : "human"} />
                  <button type="button" className="seat-remove" aria-label={`Remove player ${i + 2}`} onClick={() => setSeats(seats.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
              {seats.length + 1 < MAX_PLAYERS && (
                <button type="button" className="btn ghost small" onClick={() => setSeats([...seats, { kind: "computer", level: "medium" }])}>
                  + Add a player
                </button>
              )}
              <p className="muted small">
                Computer players take their turns as soon as yours ends. Human players join later with the invite link.
              </p>
            </div>
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

function GameRow({ g }: { g: GameSummary }) {
  const complete = g.status === "complete";
  const people = g.players.filter((p) => !p.bot).length;
  const action = complete ? (g.host ? deleteGameAction : leaveGameAction) : g.host ? endGameAction : leaveGameAction;
  const label = complete ? (g.host ? "Delete" : "Remove") : g.host ? "End game" : "Leave";
  const warning = complete
    ? `Delete "${g.name}" for good? Its history will be gone.`
    : g.host
      ? `End "${g.name}" for everyone? It will move to Complete, and nobody can make moves any more.`
      : `Leave "${g.name}"? Your land goes back to the wild pandas.`;
  return (
    <li className="game-row">
      <Link href={`/game/${g.id}`} className={`game-card${g.myTurn ? " my-turn" : ""}${complete ? " complete" : ""}`}>
        <span className="game-name">
          {g.name} <span className={`status-pill${complete ? " done" : ""}`}>{complete ? "Complete" : "In progress"}</span>
        </span>
        <span className="game-meta">
          Round {g.round} · {g.goal ? `🏁 ${g.goal}` : "♾️"} ·{" "}
          {complete ? (
            <>
              {g.winnerName ? `🏆 ${g.winnerName} won · ` : ""}Ended {g.endedAt ? new Date(g.endedAt).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
            </>
          ) : g.myTurn ? (
            <strong>Your turn!</strong>
          ) : (
            <>Waiting on {g.activeName}</>
          )}
        </span>
        <span className="game-players">
          {g.players.map((p) => (
            <span key={p.id} className="avatar-ring" style={{ borderColor: p.color }} title={p.bot ? `${p.name} (computer, ${p.bot})` : p.name}>
              <Avatar value={p.avatar} userId={p.id} size={26} />
            </span>
          ))}
          {people === 1 && <span className="muted small"> {g.players.length > 1 ? "vs computer" : "solo"}</span>}
        </span>
      </Link>
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm(warning)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={g.id} />
        <button className="game-end">{label}</button>
      </form>
    </li>
  );
}
