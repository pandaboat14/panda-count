"use client";

import { useMemo, useState } from "react";
import { NAME_MAX, checkRegionName, type Action, type GameEvent, type GameView } from "@/game/engine";
import { placeName } from "@/game/regions";
import { SANCTION_INFO, type Sanction } from "@/game/rules";
import { canReplay } from "@/game/battleScript";
import type { Odds } from "@/game/odds";

export type Ctx = {
  view: GameView;
  myTurn: boolean;
  busy: boolean;
  act: (a: Action) => Promise<GameEvent[] | false>;
  avatars: Record<string, string>;
  over?: boolean; // the game has ended: look, don't touch
};

// What a region is called now: a conqueror may have renamed it.
export const regionName = (view: GameView, id: string) => placeName(id, view.regions.find((r) => r.id === id)?.name);
export const NATIVE_LABEL = { pandas: "the Panda Nation 🐼", nacams: "the NACAM Ogre Nation 👹", cams: "the CAM Nation 💪", wild: "wild pandas" } as const;

export function meOf(view: GameView) {
  return view.players.find((p) => p.id === view.me)!;
}
export function playerName(view: GameView, id: string | null | undefined) {
  return view.players.find((p) => p.id === id)?.name ?? "someone";
}

// Why a button is greyed out for a convicted war criminal, and for how long.
export function SanctionNote({ view, sanction, children }: { view: GameView; sanction: Sanction; children?: React.ReactNode }) {
  const sentence = meOf(view).sentence;
  if (!sentence?.sanctions.includes(sanction)) return null;
  const info = SANCTION_INFO[sanction];
  return (
    <p className="small sanction-note">
      {info.icon} <strong>{info.label}</strong>: {children ?? `war criminals can't ${info.rule}`}.{" "}
      {`Your sentence has ${sentence.turnsLeft} turn${sentence.turnsLeft === 1 ? "" : "s"} left.`}
    </p>
  );
}

export function OddsLine({ odds }: { odds: Odds | null }) {
  if (!odds) return <p className="small muted">Odds unknown: you can&rsquo;t see who&rsquo;s defending.</p>;
  const pct = Math.round(odds.win * 100);
  const tone = pct >= 75 ? "good" : pct >= 45 ? "fair" : "bad";
  return (
    <p className={`odds ${tone}`}>
      <strong>{pct}% chance to win</strong>
      <span className="small">
        {" "}
        · you&rsquo;d lose about {odds.attackerLoss.toFixed(1)}, they&rsquo;d lose about {odds.defenderLoss.toFixed(1)}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- names

// A new name for land you conquered. It runs the rules' own check as you type, so what it accepts, the game accepts.
export function RenameForm({
  ctx,
  id,
  onDone,
  onCancel,
  cancelLabel = "Cancel",
  autoFocus,
}: {
  ctx: Ctx;
  id: string;
  onDone: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  autoFocus?: boolean;
}) {
  const { view, busy, act, myTurn } = ctx;
  const [draft, setDraft] = useState("");
  const check = useMemo(() => checkRegionName(id, draft, (x) => regionName(view, x)), [id, draft, view]);
  const current = regionName(view, id);
  return (
    <form
      className="rename-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (check.name && (await act({ type: "rename", region: id, name: check.name }))) onDone();
      }}
    >
      <div className="rename-row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancel) {
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder="New name"
          aria-label={`New name for ${current}`}
          maxLength={NAME_MAX * 2}
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={autoFocus}
        />
        <button className="btn small" disabled={busy || !myTurn || !check.name}>
          🚩 Rename
        </button>
        {onCancel && (
          <button type="button" className="btn ghost small" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
      <p className="rename-hint small" aria-live="polite">
        {draft.trim() ? (check.problem ?? `It'll be ${check.name} on everyone's map.`) : `Up to ${NAME_MAX} characters. Everyone in this world will see it.`}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------- log

const LOG_FILTERS: Record<string, { label: string; types?: string[]; mine?: boolean }> = {
  all: { label: "All" },
  battles: { label: "⚔️ Battles", types: ["battle", "capture", "thunder", "heroCaptured", "heroFled", "asylum"] },
  diplomacy: { label: "🤝 Diplomacy", types: ["offer", "pact", "loan", "betrayal", "trade", "decline", "pickpocket"] },
  tribunal: { label: "⚖️ Tribunal", types: ["trial", "vote", "verdict", "pardon"] },
  world: { label: "🌍 World", types: ["world", "roll", "raid", "join", "leave", "skip", "rename"] },
  mine: { label: "🙋 Mine", mine: true },
};

export function LogPanel({
  events,
  me,
  onPick,
  onWatch,
  loadOlder,
  olderDone,
}: {
  events: GameEvent[];
  me: string;
  onPick: (e: GameEvent) => void;
  onWatch: (e: GameEvent) => void;
  loadOlder: () => Promise<void>;
  olderDone: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const f = LOG_FILTERS[filter];
  const list = useMemo(() => {
    const kept = [...events]
      .reverse()
      .filter((e) => e.type !== "endTurn")
      .filter((e) => (f.types ? f.types.includes(e.type) : true) && (f.mine ? e.actor === me : true));
    return kept.map((e, i) => ({ e, header: i === 0 || kept[i - 1].round !== e.round }));
  }, [events, f, me]);
  return (
    <div className="panel-body">
      <h2>Everything that happened</h2>
      <div className="dest-list" role="group" aria-label="Filter">
        {Object.entries(LOG_FILTERS).map(([k, v]) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{v.label}</button>
        ))}
      </div>
      <ol className="log">
        {list.map(({ e, header }) => {
          return (
            <li key={e.seq} className={`log-${e.type}`}>
              {header && <p className="log-round">Round {e.round}</p>}
              <div className="log-row">
                <button type="button" onClick={() => onPick(e)} disabled={!e.regions.length}>{e.text}</button>
                {canReplay(e) && (
                  <button type="button" className="chip" onClick={() => onWatch(e)}>▶ Watch</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!olderDone ? (
        <button
          className="btn ghost small"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await loadOlder();
            setLoading(false);
          }}
        >
          {loading ? "Loading…" : "Load older events"}
        </button>
      ) : (
        <p className="muted small">That&rsquo;s everything since the world began.</p>
      )}
    </div>
  );
}
