"use client";

import { useMemo } from "react";
import { advise, type Suggestion } from "@/game/advisor";
import { DoButton, meOf, type Ctx } from "./panels";
import { Race } from "./Race";

// "What should I do?": the advisor's next moves, each one tap away, plus how the race to the goal stands.
export function PlanPanel({
  ctx,
  planAttack,
  openTab,
  endTurn,
}: {
  ctx: Ctx;
  planAttack: (from: string, to: string) => void;
  openTab: (tab: "diplomacy" | "bank") => void;
  endTurn: () => void;
}) {
  const { view, myTurn } = ctx;
  const tips = useMemo(() => advise(view), [view]);
  const me = meOf(view);
  const firstTurn = view.round === 1 && me.regions === 1;

  return (
    <div className="panel-body">
      <h2>{firstTurn && myTurn ? "Welcome, Kird!" : "Your next moves"}</h2>
      <Race ctx={ctx} />
      {firstTurn && myTurn && (
        <p className="small">
          Grow by conquering neighbours. Troops only travel by 🚡 gondola, and you already have one line: use it. Every region you hold pays
          you its resource and 2 🪙 each turn.
        </p>
      )}
      {!myTurn ? (
        <p className="muted">Suggestions appear here on your turn.</p>
      ) : (
        <ol className="plan-list">
          {tips.map((t) => (
            <li key={t.id}>
              <span className="plan-icon" aria-hidden="true">{t.icon}</span>
              <div>
                <strong>{t.title}</strong>
                {t.detail && <p className="muted small">{t.detail}</p>}
                <TipButton tip={t} ctx={ctx} planAttack={planAttack} openTab={openTab} endTurn={endTurn} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Suggestions only use what you can see. You can always do something else.</p>
    </div>
  );
}

function TipButton({
  tip,
  ctx,
  planAttack,
  openTab,
  endTurn,
}: {
  tip: Suggestion;
  ctx: Ctx;
  planAttack: (from: string, to: string) => void;
  openTab: (tab: "diplomacy" | "bank") => void;
  endTurn: () => void;
}) {
  if (tip.plan) {
    return (
      <button className="btn small danger" onClick={() => planAttack(tip.plan!.from, tip.plan!.to)}>
        Plan this attack
      </button>
    );
  }
  if (tip.action?.type === "endTurn") {
    return (
      <button className="btn small" disabled={ctx.busy} onClick={endTurn}>
        End turn ⏭
      </button>
    );
  }
  if (tip.action) {
    return (
      <DoButton ctx={ctx} cost={tip.cost ?? {}} action={tip.action}>
        Do it
      </DoButton>
    );
  }
  if (tip.tab) {
    return (
      <button className="btn ghost small" onClick={() => openTab(tip.tab!)}>
        {tip.tab === "bank" ? "Open the Bank" : "See the offers"}
      </button>
    );
  }
  return null;
}
