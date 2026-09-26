"use client";

import { useState } from "react";
import type { GameView, TrialView } from "@/game/engine";
import { placeName } from "@/game/regions";
import { REPEAT_OFFENDER_TURNS, SANCTIONS, SANCTION_INFO, SENTENCE_TURNS, type Sanction } from "@/game/rules";
import { ballotsDue, onTrial, sanctionLabels } from "@/game/tribunal";
import type { Ctx } from "./panels";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Victims can leave the world while a trial is running; the charges still stand.
const playerName = (view: GameView, id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? "a Kird who left";
const regionName = (view: GameView, id: string) => placeName(id, view.regions.find((r) => r.id === id)?.name);

// The Kirds' Tribunal, at the top of the Kirds tab: every open war crimes trial, its charges, and your ballot.
export function Tribunal({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  if (!view.trials.length) return null;
  return (
    <section className="act tribunal" aria-label="The Kirds' Tribunal">
      <h3>⚖️ The Kirds&rsquo; Tribunal</h3>
      {view.trials.map((t) => (
        <Trial key={t.id} ctx={ctx} trial={t} />
      ))}
    </section>
  );
}

function Trial({ ctx, trial }: { ctx: Ctx; trial: TrialView }) {
  const { view } = ctx;
  const mine = trial.accused === view.me;
  const name = playerName(view, trial.accused);
  const jury = view.players.filter((p) => p.id !== trial.accused);
  const waiting = jury.filter((p) => !trial.voters.includes(p.id));
  const points = trial.charges.reduce((n, c) => n + c.points, 0);
  return (
    <article className={`trial${mine ? " mine" : ""}`}>
      <p className="trial-head">
        <strong>{mine ? "You are on trial for war crimes" : `${name} is on trial for war crimes`}</strong>
      </p>
      <p className="small">
        The charges: {plural(trial.charges.length, "attack")} on other Kirds, 🩸 {points} Bloodthirst.
      </p>
      <ul className="charges small">
        {trial.charges.map((c, i) => (
          <li key={i}>
            <span>
              {c.kind === "thunder" ? "⚡ Thunder on" : "⚔️ Invaded"} {regionName(view, c.region)} ({playerName(view, c.victim)})
            </span>
            <span className="muted">
              round {c.round} · 🩸{c.points}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        The verdict comes when {mine ? "your" : `${name}'s`} next turn starts, or as soon as the whole jury has voted. {trial.voters.length} of{" "}
        {jury.length} voted{waiting.length ? `, waiting on ${waiting.map((p) => (p.id === view.me ? "you" : p.name)).join(", ")}` : ""}. Ballots are secret.
      </p>
      {mine ? (
        <p className="small">
          You can&rsquo;t vote in your own trial. Plead your case in 💬 Chat, lean on your pact partners, or sweeten a juror with a generous trade.
          Computer jurors can be bought.
        </p>
      ) : (
        <Ballot ctx={ctx} trial={trial} name={name} />
      )}
    </article>
  );
}

function Ballot({ ctx, trial, name }: { ctx: Ctx; trial: TrialView; name: string }) {
  const { view, busy, act, over } = ctx;
  const cast = trial.myVote;
  const [guilty, setGuilty] = useState<boolean | null>(cast?.guilty ?? null);
  const [sanction, setSanction] = useState<Sanction | null>(cast?.sanction ?? null);
  const priors = view.players.find((p) => p.id === trial.accused)?.convictions ?? 0;
  const turns = SENTENCE_TURNS + REPEAT_OFFENDER_TURNS * priors;
  const ready = guilty === false || (guilty === true && sanction !== null);
  const changed = guilty !== (cast?.guilty ?? null) || (guilty === true && sanction !== (cast?.sanction ?? null));
  return (
    <div className="ballot">
      {cast && (
        <p className="small">
          Your secret vote: <strong>{cast.guilty ? `Guilty, asking for ${sanctionLabels([cast.sanction!])}` : "Not guilty"}</strong>. You can change
          it until the verdict.
        </p>
      )}
      <div className="dest-list" role="radiogroup" aria-label={`Your verdict on ${name}`}>
        <button type="button" role="radio" aria-checked={guilty === true} className={`chip enemy${guilty === true ? " on" : ""}`} onClick={() => setGuilty(true)}>
          ☠️ Guilty
        </button>
        <button type="button" role="radio" aria-checked={guilty === false} className={`chip${guilty === false ? " on" : ""}`} onClick={() => setGuilty(false)}>
          😇 Not guilty
        </button>
      </div>
      {guilty && (
        <fieldset className="sanction-pick">
          <legend className="small">
            Pick a punishment. If the verdict is guilty, every punishment the guilty jurors picked applies for {plural(turns, "turn")}
            {priors ? ` (${name} is a repeat offender)` : ""}.
          </legend>
          {SANCTIONS.map((k) => (
            <label key={k} className={`sanction${sanction === k ? " on" : ""}`}>
              <input type="radio" name={`sanction-${trial.id}`} checked={sanction === k} onChange={() => setSanction(k)} />
              <span className="sanction-icon" aria-hidden="true">
                {SANCTION_INFO[k].icon}
              </span>
              <span>
                <strong>{SANCTION_INFO[k].label}</strong> <span className="muted small">{SANCTION_INFO[k].blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-actions">
        <button
          className={`btn small${guilty ? " danger" : ""}`}
          disabled={busy || over || !ready || !changed}
          onClick={() => act({ type: "vote", trial: trial.id, guilty: guilty!, ...(guilty ? { sanction: sanction! } : {}) })}
        >
          {cast ? "Change your vote" : "Cast your secret vote"}
        </button>
      </div>
    </div>
  );
}

// Status pills under the goods bar: your own trial, votes waiting for you, and any sentence you're serving.
// Each one opens the Kirds tab, where the Tribunal sits.
export function TribunalPills({ view, onOpen }: { view: GameView; onOpen: () => void }) {
  const me = view.players.find((p) => p.id === view.me);
  const pills: { key: string; text: string; tone: string }[] = [];
  if (onTrial(view, view.me)) {
    pills.push({ key: "trial", tone: "mine", text: "⚖️ You're on trial for war crimes. The verdict comes when your next turn starts." });
  }
  for (const t of ballotsDue(view).slice(0, 2)) {
    pills.push({ key: t.id, tone: "", text: `⚖️ ${playerName(view, t.accused)} is on trial for war crimes. Cast your secret vote ›` });
  }
  if (me?.sentence) {
    pills.push({ key: "sentence", tone: "criminal", text: `☠️ War criminal, ${plural(me.sentence.turnsLeft, "turn")} left: ${sanctionLabels(me.sentence.sanctions)}` });
  }
  if (!pills.length) return null;
  return (
    <div className="tribunal-pills">
      {pills.map((p) => (
        <button key={p.key} type="button" className={`tribunal-pill ${p.tone}`} onClick={onOpen}>
          {p.text}
        </button>
      ))}
    </div>
  );
}
