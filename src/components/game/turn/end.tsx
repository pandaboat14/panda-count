"use client";

// ⏭ Ending your turn: what you'd leave unused, and what's coming at the start of your next turn.

import { useMemo, useState } from "react";
import type { Page } from "@/game/turnFlow";
import { incomePreview, turnLeftovers } from "@/game/turnOptions";
import { CostChips } from "../bits";
import { Group, Hub, useTurn } from "./kit";

export function EndTurn() {
  const t = useTurn();
  const left = useMemo(() => turnLeftovers(t.view), [t.view]);
  const income = useMemo(() => incomePreview(t.view), [t.view]);
  const [working, setWorking] = useState(false);
  const best = left.attacks[0];
  const todo: { icon: string; text: string; label: string; page: Page }[] = [];
  if (left.offers) todo.push({ icon: "📨", text: `${left.offers} offer${left.offers === 1 ? "" : "s"} waiting for your answer`, label: "Answer", page: { step: "diplomacy" } });
  if (left.votes) todo.push({ icon: "⚖️", text: `${left.votes} war crimes trial${left.votes === 1 ? "" : "s"} waiting for your secret vote`, label: "Vote", page: { step: "diplomacy" } });
  if (best) {
    const pct = best.best?.odds ? ` (best: ${t.name(best.id)}, ${Math.round(best.best.odds.win * 100)}% to win)` : "";
    todo.push({ icon: "⚔️", text: `${left.attacks.length} attack${left.attacks.length === 1 ? "" : "s"} you could make now${pct}`, label: "Attack", page: { step: "attackTarget" } });
  }
  if (left.readyTroops) {
    todo.push({
      icon: "🚡",
      text: `${left.readyTroops} troop${left.readyTroops === 1 ? "" : "s"} rested and ready in ${left.readyRegions} region${left.readyRegions === 1 ? "" : "s"}`,
      label: "Move",
      page: { step: "moveFrom" },
    });
  }
  if (left.raid) todo.push({ icon: "🎲", text: `You hold ${left.cards} resource cards. If anyone rolls a 7, ogres take half.`, label: "Spend", page: { step: "buildWhat" } });
  return (
    <Hub icon="⏭" title="End your turn?" sub="Check what's left, then pass the turn to the next Kird." tone="end">
      {todo.length ? (
        <Group title="Before you go, you still have:">
          <ul className="todo">
            {todo.map((x) => (
              <li key={x.icon}>
                <span aria-hidden="true">{x.icon}</span>
                <span>{x.text}</span>
                <button type="button" className="btn ghost small" onClick={() => t.go(x.page)}>
                  {x.label}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      ) : (
        <p className="afford ok">✅ Nothing left undone. Well played.</p>
      )}
      <Group title="📥 At the start of your next turn" note="Plus whatever the dice roll and the next world event bring.">
        <p className="income-line">
          <CostChips cost={income.harvest} /> <span className={income.coin < 0 ? "warn-text" : ""}>{income.coin >= 0 ? "+" : ""}{income.coin} 🪙</span> · +{income.pandaCoin} 🐼 · +
          {income.camCoin} 💪
        </p>
        {income.upkeep > 0 && <p className="small muted">After {income.upkeep} 🪙 of ogre wages.</p>}
        {income.deserters > 0 && (
          <p className="warn-line">
            👹 You can&rsquo;t pay every ogre: {income.deserters} will desert at the start of your next turn unless you have more 🪙 by then.
          </p>
        )}
      </Group>
      <button
        type="button"
        className="btn review-go end"
        disabled={!t.myTurn || t.busy || working}
        onClick={async () => {
          setWorking(true);
          await t.endTurn();
          setWorking(false);
        }}
      >
        {working ? "⏳ Ending…" : "⏭ End my turn"}
      </button>
      {!t.myTurn && <p className="small muted">It&rsquo;s not your turn.</p>}
    </Hub>
  );
}
