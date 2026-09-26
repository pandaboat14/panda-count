"use client";

// 🚡 Move troops between your own regions, step by step: from where, to where, who goes, then confirm.

import { useState } from "react";
import { restedIn } from "@/game/army";
import { unitTotal, type Units } from "@/game/engine";
import { UNIT_TYPES } from "@/game/rules";
import { pick, type PageOf } from "@/game/turnFlow";
import { attackTargets, canChoose, keepOneHome, lineState, linesClosed, moveRoutes, moveSources, regionIn, unitsOf } from "@/game/turnOptions";
import { LineReview } from "./attack";
import { Badge, Choice, Delta, Empty, Frame, Review, Stale, TroopPicker, UnitsLine, useTurn } from "./kit";

export function MoveFrom({ page }: { page: PageOf<"moveFrom"> }) {
  const t = useTurn();
  const sources = moveSources(t.view);
  return (
    <Frame page={page} question="Move troops from where?" help="Tap one of your glowing regions, or pick one below. Only regions next to another of yours are listed.">
      {!sources.length && (
        <Empty>
          None of your regions touch each other yet, so there&rsquo;s nowhere to move troops within your land. To go into new land, use ⚔️ Attack.
        </Empty>
      )}
      <div className="choice-list">
        {sources.map((s) => (
          <Choice
            key={s.id}
            icon="🏠"
            title={t.name(s.id)}
            sub={
              unitTotal(s.rested) ? (
                <>
                  Ready to move: <UnitsLine u={s.rested} />
                </>
              ) : (
                "Everyone here is resting this turn"
              )
            }
            badge={
              s.status === "ready" ? (
                <Badge kind="ok">{s.routes.filter((r) => r.line === "ours").length} route{s.routes.filter((r) => r.line === "ours").length === 1 ? "" : "s"}</Badge>
              ) : s.status === "needLine" ? (
                <Badge kind="warn">🚡 needs a line</Badge>
              ) : (
                <Badge kind="off">💤 resting</Badge>
              )
            }
            disabled={!canChoose(s.status, linesClosed(t.view))}
            onClick={() => {
              const next = pick(page, s.id, t.view);
              if (next) t.go(next);
            }}
          />
        ))}
      </div>
      <AttackInstead />
    </Frame>
  );
}

export function MoveTo({ page }: { page: PageOf<"moveTo"> }) {
  const t = useTurn();
  const routes = moveRoutes(t.view, page.from);
  const from = regionIn(t.view, page.from);
  if (from?.owner !== t.view.me) {
    return (
      <Frame page={page} question="Where to?">
        <Stale why={`${t.name(page.from)} isn't yours any more.`} />
      </Frame>
    );
  }
  return (
    <Frame page={page} question={`Send troops from ${t.name(page.from)} to where?`} help="Your neighbouring regions. Troops ride gondolas, so a line has to join the two.">
      <p className="route-line small">
        Ready in {t.name(page.from)}: <UnitsLine u={restedIn(from)} none="nobody (all resting)" />
      </p>
      <div className="choice-list">
        {routes.map((r) => (
          <Choice
            key={r.to}
            icon="🏠"
            title={t.name(r.to)}
            sub={
              <>
                Has <UnitsLine u={r.units} />
              </>
            }
            badge={r.line === "ours" ? <Badge kind="ok">🚡 line ready</Badge> : <Badge kind="warn">🚡 needs a line</Badge>}
            disabled={r.line !== "ours" && linesClosed(t.view)}
            onClick={() => {
              const next = pick(page, r.to, t.view);
              if (next) t.go(next);
            }}
          />
        ))}
      </div>
      <AttackInstead from={page.from} />
    </Frame>
  );
}

// Moving only goes between your own regions; invading is an attack. Say so, one tap away.
function AttackInstead({ from }: { from?: string }) {
  const t = useTurn();
  const targets = attackTargets(t.view, { from, odds: false }).filter((x) => canChoose(x.status, linesClosed(t.view)));
  if (!targets.length) return null;
  return (
    <p className="flow-aside small">
      Want to go into land that isn&rsquo;t yours?{" "}
      <button type="button" className="linkish" onClick={() => t.go({ step: "attackTarget", from })}>
        ⚔️ Attack{from ? ` from ${t.name(from)}` : ""} instead
      </button>
    </p>
  );
}

export function MoveLine({ page }: { page: PageOf<"moveLine"> }) {
  const t = useTurn();
  return (
    <Frame
      page={page}
      question="First, build a gondola line"
      help={`Troops only travel by urban gondola, and there's no line between ${t.name(page.from)} and ${t.name(page.to)} yet.`}
    >
      <LineReview from={page.from} to={page.to} then={{ step: "moveTroops", from: page.from, to: page.to }} />
    </Frame>
  );
}

function staleMove(t: ReturnType<typeof useTurn>, from: string, to: string, units?: Units) {
  const src = regionIn(t.view, from);
  if (src?.owner !== t.view.me) return `${t.name(from)} isn't yours any more.`;
  if (regionIn(t.view, to)?.owner !== t.view.me) return `${t.name(to)} isn't yours any more.`;
  if (lineState(t.view, from, to) !== "ours") return `There's no gondola line between ${t.name(from)} and ${t.name(to)}.`;
  const rested = restedIn(src);
  if (!unitTotal(rested)) return `Everyone in ${t.name(from)} is resting now.`;
  if (units && UNIT_TYPES.some((u) => (units[u] ?? 0) > rested[u])) return `${t.name(from)} doesn't have those troops ready any more.`;
  return null;
}

// Both regions' troops if these units moved.
function after(t: ReturnType<typeof useTurn>, from: string, to: string, send: Units) {
  const a = unitsOf(regionIn(t.view, from));
  const b = unitsOf(regionIn(t.view, to));
  for (const u of UNIT_TYPES) {
    a[u] -= send[u] ?? 0;
    b[u] += send[u] ?? 0;
  }
  return [a, b] as const;
}

export function MoveTroops({ page }: { page: PageOf<"moveTroops"> }) {
  const t = useTurn();
  const from = regionIn(t.view, page.from);
  const avail = from ? restedIn(from) : unitsOf();
  const [send, setSend] = useState<Units>(() => page.units ?? keepOneHome(from, avail));
  const stale = staleMove(t, page.from, page.to);
  if (stale) {
    return (
      <Frame page={page} question="Who goes?">
        <Stale why={stale} />
      </Frame>
    );
  }
  const [a, b] = after(t, page.from, page.to, send);
  return (
    <Frame page={page} question="Who goes?" help={`Pick how many of each unit ride from ${t.name(page.from)} to ${t.name(page.to)}.`}>
      <TroopPicker region={from} avail={avail} value={send} onChange={setSend} />
      <div className="deltas">
        <Delta id={page.from} before={from?.units} after={a} />
        <Delta id={page.to} before={regionIn(t.view, page.to)?.units} after={b} />
      </div>
      {unitTotal(send) > 0 && !unitTotal(a) && <p className="warn-line">⚠️ {t.name(page.from)} would be left empty: anyone next to it could walk in.</p>}
      <button type="button" className="btn next" disabled={!unitTotal(send)} onClick={() => t.go({ step: "moveReview", from: page.from, to: page.to, units: send }, { ...page, units: send })}>
        Next: check the move →
      </button>
    </Frame>
  );
}

export function MoveReview({ page }: { page: PageOf<"moveReview"> }) {
  const t = useTurn();
  const stale = staleMove(t, page.from, page.to, page.units);
  if (stale) {
    return (
      <Frame page={page} question="Ready to send them?">
        <Stale why={stale} />
      </Frame>
    );
  }
  const [a, b] = after(t, page.from, page.to, page.units);
  const piecer = t.view.heroes.piecer.owner === t.view.me && t.view.heroes.piecer.region === page.from;
  return (
    <Frame page={page} question="Ready to send them?" help="Check the move, then send them off.">
      <Review
        title={
          <>
            🚡 Send <UnitsLine u={page.units} /> from <strong>{t.name(page.from)}</strong> to <strong>{t.name(page.to)}</strong>
          </>
        }
        label="🚡 Send them"
        onGo={() => t.run({ type: "move", from: page.from, to: page.to, units: page.units })}
      >
        <div className="deltas">
          <Delta id={page.from} before={regionIn(t.view, page.from)?.units} after={a} />
          <Delta id={page.to} before={regionIn(t.view, page.to)?.units} after={b} />
        </div>
        <p className="small">
          {piecer
            ? "The Piecer Captain is here: they can ride one more line this turn after they arrive."
            : `They'll rest in ${t.name(page.to)} until your next turn.`}
        </p>
      </Review>
    </Frame>
  );
}
