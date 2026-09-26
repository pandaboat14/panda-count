"use client";

import { useMemo, useState } from "react";
import { restedIn } from "@/game/army";
import { emptyUnits, unitTotal, type BattleData, type GameView, type Units } from "@/game/engine";
import { attackOdds } from "@/game/odds";
import { NEIGHBORS, lineId } from "@/game/regions";
import { UNITS, UNIT_TYPES } from "@/game/rules";
import { CostChips, Stepper } from "./bits";
import { DoButton, NATIVE_LABEL, OddsLine, inPact, playerName, regionName, regionView, usableLine, type Ctx } from "./panels";

// Moving troops, one clear step at a time: pick where from, pick where to, pick who goes, send.
// The bar says which step you're on, the map rings every choice, and "Stop moving" always gets you out.

const unitLine = (u: Units) =>
  UNIT_TYPES.filter((t) => u[t] > 0)
    .map((t) => `${u[t]} ${UNITS[t].icon}`)
    .join(" ");

// Your regions that can send troops right now: someone is rested, and there's a gondola line to ride.
export function moveSources(view: GameView) {
  return view.regions.filter(
    (r) => r.owner === view.me && unitTotal(restedIn(r)) > 0 && (NEIGHBORS.get(r.id) ?? []).some((n) => usableLine(view, r.id, n)),
  );
}

// Where troops in `from` can ride now, and where a new gondola line would let them go.
export function moveOptions(view: GameView, from: string) {
  const strike = view.modifiers.some((m) => m.kind === "gondolaStrike");
  const around = NEIGHBORS.get(from) ?? [];
  const lines = around.filter((n) => usableLine(view, from, n));
  const build = strike
    ? []
    : around.filter((n) => {
        const r = regionView(view, n);
        return r.owner !== view.me && !view.lines.some((l) => l.id === lineId(from, n)) && !(r.owner && inPact(view, r.owner));
      });
  return { lines, build, strike };
}

type Pick = (from: string | null, to: string | null) => void;

export function MoveBar({
  ctx,
  from,
  to,
  note,
  pick,
  setNote,
  onStop,
}: {
  ctx: Ctx;
  from: string | null;
  to: string | null;
  note: string | null;
  pick: Pick;
  setNote: (note: string | null) => void;
  onStop: () => void;
}) {
  const step = !from ? 1 : !to ? 2 : 3;
  const go: Pick = (f, t) => {
    setNote(null);
    pick(f, t);
  };
  return (
    <section className="move-bar" aria-label="Moving troops">
      <header className="move-head">
        <strong className="move-title">🚡 Moving troops</strong>
        <ol className="move-steps">
          {["From", "To", "Who goes"].map((label, i) => (
            <li key={label} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined}>
              <span className="move-step-n" aria-hidden="true">{step > i + 1 ? "✓" : i + 1}</span> {label}
            </li>
          ))}
        </ol>
        <button type="button" className="btn small move-stop" onClick={onStop}>
          ✕ Stop moving
        </button>
      </header>
      {note && (
        <p className="move-note" role="status">
          {note}
        </p>
      )}
      <div className="move-body">
        {step === 1 && <PickFrom ctx={ctx} go={go} />}
        {step === 2 && <PickTo ctx={ctx} from={from!} go={go} />}
        {step === 3 && <PickWho key={`${from}>${to}`} ctx={ctx} from={from!} to={to!} pick={pick} go={go} setNote={setNote} />}
      </div>
    </section>
  );
}

function PickFrom({ ctx, go }: { ctx: Ctx; go: Pick }) {
  const { view } = ctx;
  const sources = moveSources(view);
  const anyoneRested = view.regions.some((r) => r.owner === view.me && unitTotal(restedIn(r)) > 0);
  return (
    <>
      <p>
        <strong>Tap one of your regions</strong> (they fly your flag) to move troops out of it.
        {sources.length > 0 && (
          <>
            {" "}
            <span className="ring-key source" aria-hidden="true" /> Gold rings have troops ready to go.
          </>
        )}
      </p>
      {sources.length > 0 ? (
        <div className="dest-list">
          {sources.map((r) => (
            <button key={r.id} type="button" className="chip" onClick={() => go(r.id, null)}>
              {regionName(view, r.id)} · {unitTotal(restedIn(r))} ready
            </button>
          ))}
        </div>
      ) : (
        <p className="muted small">
          {anyoneRested
            ? "None of your regions has a gondola line yet, and gondolas are the only way to move troops. Tap a region to build one."
            : "Nobody can move right now: troops that moved or were just recruited rest until your next turn."}
        </p>
      )}
    </>
  );
}

function PickTo({ ctx, from, go }: { ctx: Ctx; from: string; go: Pick }) {
  const { view } = ctx;
  const { avail, ready, lines, build, strike, odds } = useMemo(() => {
    const avail = restedIn(regionView(view, from));
    const ready = unitTotal(avail);
    const options = moveOptions(view, from);
    const enemies = options.lines.filter((n) => regionView(view, n).owner !== view.me);
    return { avail, ready, ...options, odds: new Map(enemies.map((n) => [n, ready ? attackOdds(view, from, n, avail, 120) : null])) };
  }, [view, from]);
  return (
    <>
      <p>
        From <strong>{regionName(view, from)}</strong>: {ready ? `${ready} ready (${unitLine(avail)})` : "nobody here is ready"}.
      </p>
      {!ready ? (
        <p className="muted small">They moved or were just recruited this turn, and can go again next turn. Pick another of your regions.</p>
      ) : lines.length ? (
        <>
          <p>
            <strong>Tap where to send them.</strong> <span className="ring-key move" aria-hidden="true" /> Blue is your own land;{" "}
            <span className="ring-key attack" aria-hidden="true" /> red means invading.
          </p>
          <div className="dest-list">
            {lines.map((n) => {
              const enemy = regionView(view, n).owner !== view.me;
              const o = odds.get(n);
              return (
                <button key={n} type="button" className={`chip${enemy ? " enemy" : ""}`} onClick={() => go(from, n)}>
                  {enemy ? "⚔️" : "➡️"} {regionName(view, n)}
                  {o ? ` · ${Math.round(o.win * 100)}%` : ""}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p>No gondola lines from {regionName(view, from)} yet, and troops only travel by gondola.</p>
      )}
      {build.length > 0 && (
        <>
          <p className="muted small">
            <span className="ring-key build" aria-hidden="true" /> {lines.length ? "Somewhere else? " : ""}Dashed rings need a gondola line first: tap one to build it.
          </p>
          <div className="dest-list">
            {build.map((n) => (
              <button key={n} type="button" className="chip" onClick={() => go(from, n)}>
                🚡 {regionName(view, n)}
              </button>
            ))}
          </div>
        </>
      )}
      {strike && <p className="muted small">⚠️ Gondola strike: no new lines can be built this round.</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost small" onClick={() => go(null, null)}>
          ↩ Pick a different region
        </button>
      </div>
    </>
  );
}

function PickWho({ ctx, from, to, pick, go, setNote }: { ctx: Ctx; from: string; to: string; pick: Pick; go: Pick; setNote: (note: string | null) => void }) {
  const { view, busy, act } = ctx;
  const source = regionView(view, from);
  const target = regionView(view, to);
  const avail = restedIn(source);
  const [units, setUnits] = useState<Units>(avail);
  const n = unitTotal(units);
  const reinforce = target.owner === view.me;
  const odds = useMemo(() => (!reinforce && n ? attackOdds(view, from, to, units) : null), [reinforce, n, view, from, to, units]);
  const fromName = regionName(view, from);
  const toName = regionName(view, to);
  const back = (
    <button type="button" className="btn ghost small" onClick={() => go(from, null)}>
      ↩ Back
    </button>
  );

  if (!usableLine(view, from, to)) {
    const line = view.lines.find((l) => l.id === lineId(from, to));
    if (line) {
      return (
        <>
          <p>
            The gondola between {fromName} and {toName} belongs to {playerName(view, line.owner)}, so only they can ride it.
          </p>
          <div className="form-actions">{back}</div>
        </>
      );
    }
    const strike = view.modifiers.some((m) => m.kind === "gondolaStrike");
    return (
      <>
        <p>
          There&rsquo;s no gondola line from <strong>{fromName}</strong> to <strong>{toName}</strong> yet, and troops only travel by gondola.
        </p>
        <div className="form-actions">
          <DoButton
            ctx={ctx}
            cost={view.prices.gondola}
            action={{ type: "gondola", from, to }}
            disabled={strike}
            onDone={() => setNote(`🚡 Line built. Now choose who rides it to ${toName}.`)}
          >
            🚡 Build the line <CostChips cost={view.prices.gondola} />
          </DoButton>
          {back}
        </div>
        {strike && <p className="muted small">⚠️ Gondola strike: no new lines can be built this round.</p>}
      </>
    );
  }
  if (target.owner && !reinforce && inPact(view, target.owner)) {
    return (
      <>
        <p>You have a pact with {playerName(view, target.owner)}. Break it in the 🤝 Kirds tab first if you really mean to invade.</p>
        <div className="form-actions">{back}</div>
      </>
    );
  }
  if (!unitTotal(avail)) {
    return (
      <>
        <p>Everyone in {fromName} is resting until your next turn.</p>
        <div className="form-actions">
          <button type="button" className="btn ghost small" onClick={() => go(null, null)}>
            ↩ Pick another region
          </button>
        </div>
      </>
    );
  }

  const send = async () => {
    const evs = await act({ type: "move", from, to, units });
    if (!evs) return;
    const fight = evs.find((e) => e.type === "battle")?.data as BattleData | undefined;
    setNote(
      reinforce
        ? `✓ Sent ${unitLine(units)} to ${toName}. They rest there until your next turn.`
        : fight && !fight.won
          ? `⚔️ ${toName} held, and your attackers fell.`
          : `🚩 ${toName} is yours!`,
    );
    // Anyone left behind can still go somewhere else; otherwise pick a new region.
    pick(UNIT_TYPES.some((t) => avail[t] > units[t]) ? from : null, null);
  };

  return (
    <>
      <p className="move-route">
        <strong>{fromName}</strong> <span aria-hidden="true">→</span> {reinforce ? "➡️" : "⚔️"} <strong>{toName}</strong>{" "}
        <span className="muted small">
          {reinforce ? "(yours)" : target.owner ? `(${playerName(view, target.owner)})` : target.native ? `(${NATIVE_LABEL[target.native]})` : "(empty)"}
        </span>
      </p>
      {!reinforce && (
        <p className="small">
          Defending: {target.units && unitTotal(target.units) ? unitLine(target.units) : "nobody"}
          {target.buildings?.includes("fort") && " · 🏰 fort (+1)"}
        </p>
      )}
      <p className="small">
        <strong>Who goes?</strong>
      </p>
      <div className="unit-pick">
        {UNIT_TYPES.filter((t) => avail[t] > 0).map((t) => (
          <label key={t}>
            <span>
              {UNITS[t].icon} {UNITS[t].plural} <span className="muted">({avail[t]} ready)</span>
            </span>
            <Stepper value={units[t]} max={avail[t]} onChange={(v) => setUnits({ ...units, [t]: v })} label={UNITS[t].plural} />
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost small" disabled={n === unitTotal(avail)} onClick={() => setUnits(avail)}>
          Everyone ready ({unitTotal(avail)})
        </button>
        <button type="button" className="btn ghost small" disabled={!n} onClick={() => setUnits(emptyUnits())}>
          Nobody
        </button>
      </div>
      {!reinforce && n > 0 && <OddsLine odds={odds} />}
      {n > 0 && source.units && n === unitTotal(source.units) && <p className="small move-warn">⚠️ That leaves {fromName} empty: anyone could walk in.</p>}
      <p className="muted small">
        {view.heroes.piecer.owner === view.me && view.heroes.piecer.region === from
          ? "The Piecer Captain is here: troops can ride on again after they arrive."
          : "Troops that move rest until your next turn."}
      </p>
      {/* Pinned to the bottom of the bar, so the button that sends them is always in reach. */}
      <div className="form-actions move-actions">
        <button type="button" className={`btn${reinforce ? "" : " danger"}`} disabled={busy || !n} onClick={send}>
          {reinforce ? `➡️ Send ${n} to ${toName}` : `⚔️ Invade ${toName} with ${n}`}
        </button>
        {back}
      </div>
    </>
  );
}
