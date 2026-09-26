"use client";

import { useMemo } from "react";
import { advise, type Suggestion } from "@/game/advisor";
import { sunTzuOpening, sunTzuSays } from "@/game/sunTzu";
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
      <header className="sun-tzu">
        <SunTzuPortrait />
        <div>
          <h2>Sun Tzu advises</h2>
          <p className="sun-tzu-quote">&ldquo;{sunTzuOpening(view.turn, firstTurn, myTurn)}&rdquo;</p>
        </div>
      </header>
      <Race ctx={ctx} />
      {firstTurn && myTurn && (
        <p className="small">
          Grow by conquering neighbours. Troops only travel by 🚡 gondola, so your first big decision is where to build your first line:
          pick a weak neighbour, ideally one with a resource you don&rsquo;t have. Every region you hold pays you its resource and 2 🪙 each turn.
        </p>
      )}
      {!myTurn ? (
        <p className="muted">Suggestions appear here on your turn.</p>
      ) : (
        <ol className="plan-list">
          {tips.map((t, i) => (
            <li key={t.id}>
              <span className="plan-icon" aria-hidden="true">{t.icon}</span>
              <div>
                <p className="sun-tzu-quote small">&ldquo;{sunTzuSays(t, view.turn, i)}&rdquo;</p>
                <strong>{t.title}</strong>
                {t.detail && <p className="muted small">{t.detail}</p>}
                <TipButton tip={t} ctx={ctx} planAttack={planAttack} openTab={openTab} endTurn={endTurn} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Sun Tzu only knows what you can see. Some of his sayings are real; the panda ones, probably not.</p>
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
        {tip.button ?? (tip.tab === "bank" ? "Open the Bank" : "See the offers")}
      </button>
    );
  }
  return null;
}

// The old master himself: topknot, beard, scroll.
function SunTzuPortrait() {
  return (
    <svg viewBox="0 0 100 100" width="56" height="56" className="sun-tzu-portrait" role="img" aria-label="Sun Tzu">
      <circle cx="50" cy="50" r="50" fill="#8a2f23" />
      <ellipse cx="50" cy="17" rx="9" ry="7" fill="#1c1b17" />
      <rect x="44" y="20" width="12" height="5" rx="2" fill="#d9a441" />
      <ellipse cx="50" cy="46" rx="22" ry="24" fill="#e9c39b" />
      <path d="M28 40 q22 -22 44 0 q-4 -14 -22 -16 q-18 2 -22 16 Z" fill="#1c1b17" />
      <path d="M36 44 q5 -3 10 0 M54 44 q5 -3 10 0" stroke="#1c1b17" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M38 49 h7 M55 49 h7" stroke="#1c1b17" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M40 60 q10 5 20 0" stroke="#8a4a2a" strokeWidth="2" fill="none" />
      <path d="M36 62 q14 34 28 0 q-6 8 -14 8 q-8 0 -14 -8 Z" fill="#f2ead7" />
      <path d="M30 56 q-8 10 -4 18 M70 56 q8 10 4 18" stroke="#f2ead7" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="62" y="74" width="26" height="10" rx="4" fill="#f3e3a2" stroke="#8a6d2a" strokeWidth="1.5" transform="rotate(-18 75 79)" />
    </svg>
  );
}
