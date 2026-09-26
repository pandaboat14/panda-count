"use client";

// Building blocks for the turn menu: the step-by-step header, option cards, the troop picker, the odds meter
// and the "You're about to…" review card that every action ends with.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { emptyUnits, unitTotal, type Action, type RegionView, type Units } from "@/game/engine";
import type { Odds } from "@/game/odds";
import { GOODS, GOOD_INFO, UNITS, UNIT_TYPES, type Cost } from "@/game/rules";
import { FLOWS, isHub, placeOf, stepIndexInStack, type Page } from "@/game/turnFlow";
import { keepOneHome, meIn, type Afford } from "@/game/turnOptions";
import { CostChips, Stepper } from "../bits";
import { NATIVE_COLORS } from "../colors";
import { NATIVE_LABEL, type Ctx } from "../panels";

export type Turn = Ctx & {
  stack: Page[];
  // Opens a page. `current` updates the page you're leaving (to remember choices for when you come Back).
  go: (p: Page, current?: Page) => void;
  back: () => void;
  popTo: (i: number) => void;
  // Opens a region's page; `fly` also turns the globe to it (for picks made in the panel, not on the globe).
  showRegion: (id: string, fly?: boolean) => void;
  // Does an action (buying any missing resources first) and shows its result, or moves on to `then`.
  run: (action: Action, opts?: { cost?: Cost; then?: Page }) => Promise<boolean>;
  endTurn: () => Promise<void>;
  setAutopilot: (on: boolean, level?: "medium" | "hard") => void;
  openChat: (with_: string) => void;
  // What a region is called now (a conqueror may have renamed it).
  name: (id: string) => string;
  activeName: string;
};

const TurnContext = createContext<Turn | null>(null);
export const TurnProvider = TurnContext.Provider;

export function useTurn() {
  const t = useContext(TurnContext);
  if (!t) throw new Error("useTurn needs the turn menu around it");
  return t;
}

// "Yours", another Kird's name, the natives, or nobody.
export function ownerLabel(t: Pick<Turn, "view">, r?: RegionView) {
  if (!r || r.fog) return "Hidden in the fog";
  if (r.owner === t.view.me) return "Yours";
  if (r.owner) return t.view.players.find((p) => p.id === r.owner)?.name ?? "Another Kird";
  if (r.native) return `Held by ${NATIVE_LABEL[r.native]}`;
  return "Nobody: it's empty";
}

export const ownerColor = (t: Pick<Turn, "view">, r?: RegionView) =>
  r?.owner ? t.view.players.find((p) => p.id === r.owner)?.color ?? "#888" : r?.native ? NATIVE_COLORS[r.native] : "#d9d2bf";

// ---------------------------------------------------------------- page frame

// Every step of an action: which action, which step, the question, then the choices.
export function Frame({ page, question, help, children }: { page: Page; question: ReactNode; help?: ReactNode; children: ReactNode }) {
  const t = useTurn();
  const place = placeOf(page);
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to the new question so each step is announced; keep the braces (focus must not return anything).
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <div className={`panel-body flow tone-${place ? FLOWS[place.flow].tone : "info"}`}>
      {place && <FlowHeader page={page} />}
      <h2 className="flow-q" ref={heading} tabIndex={-1}>
        {question}
      </h2>
      {help && <p className="flow-help">{help}</p>}
      {!t.myTurn && !t.over && (
        <p className="flow-wait">👀 It&rsquo;s {t.activeName}&rsquo;s turn. Look around and plan: your moves open on your turn.</p>
      )}
      {children}
      {t.stack.length > 1 && (
        <div className="flow-foot">
          <button type="button" className="btn ghost small" onClick={t.back}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

function FlowHeader({ page }: { page: Page }) {
  const t = useTurn();
  const place = placeOf(page)!;
  const flow = FLOWS[place.flow];
  const hub = t.stack.reduce((at, p, i) => (isHub(p) ? i : at), 0);
  return (
    <header className="flow-head">
      <div className="flow-title">
        <span className="flow-icon" aria-hidden="true">
          {flow.icon}
        </span>
        <strong>{flow.title}</strong>
        <span className="flow-count">
          Step {place.index + 1} of {flow.steps.length}
        </span>
        <button type="button" className="flow-close" onClick={() => t.popTo(hub)} aria-label={`Cancel: ${flow.title}`} title="Cancel">
          ✕
        </button>
      </div>
      <ol className="steps">
        {flow.steps.map((label, i) => {
          const state = i < place.index ? "done" : i === place.index ? "now" : "todo";
          const at = state === "done" ? stepIndexInStack(t.stack, place.flow, i) : -1;
          const body = (
            <>
              <span className="step-dot">{state === "done" ? "✓" : i + 1}</span>
              <span className="step-label">{label}</span>
            </>
          );
          return (
            <li key={label} className={state} aria-current={state === "now" ? "step" : undefined}>
              {at >= 0 ? (
                <button type="button" onClick={() => t.popTo(at)} title={`Back to: ${label}`}>
                  {body}
                </button>
              ) : (
                <span>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

// A menu page that isn't a step of one action (the menu itself, Heroes, Diplomacy, the Bank, a region).
export function Hub({ icon, title, sub, tone, children }: { icon: ReactNode; title: ReactNode; sub?: ReactNode; tone: string; children: ReactNode }) {
  const t = useTurn();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (t.stack.length > 1) heading.current?.focus({ preventScroll: true });
  }, [t.stack.length]);
  return (
    <div className={`panel-body hub tone-${tone}`}>
      {t.stack.length > 1 && (
        <button type="button" className="hub-back" onClick={t.back}>
          ← Back
        </button>
      )}
      <header className="hub-head">
        <span className="hub-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {sub && <p className="hub-sub">{sub}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- choices

export type BadgeKind = "ok" | "warn" | "off" | "bad" | "info";

export function Badge({ kind, children }: { kind: BadgeKind; children: ReactNode }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

// A big tappable option: icon (or a picture), name, what it means, and whether it's available.
export function Choice({
  icon,
  pic,
  title,
  sub,
  badge,
  side,
  onClick,
  disabled,
  swatch,
  children,
}: {
  icon?: ReactNode;
  pic?: boolean; // the icon is a picture: give it more room
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  side?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  swatch?: string;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="choice" onClick={onClick} disabled={disabled} style={swatch ? { borderLeftColor: swatch } : undefined}>
      {icon !== undefined && (
        <span className={`choice-icon${pic ? " pic" : ""}`} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="choice-body">
        <span className="choice-title">
          {title} {badge}
        </span>
        {sub && <span className="choice-sub">{sub}</span>}
        {children}
      </span>
      {side && <span className="choice-side">{side}</span>}
      {!disabled && (
        <span className="choice-go" aria-hidden="true">
          ›
        </span>
      )}
    </button>
  );
}

export function Group({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="choice-group">
      <h3>{title}</h3>
      {note && <p className="small muted">{note}</p>}
      <div className="choice-list">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flow-empty">{children}</div>;
}

// ---------------------------------------------------------------- facts

export function UnitsLine({ u, none = "nobody" }: { u?: Partial<Units>; none?: string }) {
  const parts = UNIT_TYPES.filter((t) => (u?.[t] ?? 0) > 0);
  if (!parts.length) return <span className="units none">{none}</span>;
  return (
    <span className="units">
      {parts.map((t) => (
        <span key={t} title={UNITS[t].plural}>
          {u![t]}
          {UNITS[t].icon}
        </span>
      ))}
    </span>
  );
}

// A region's troops before and after, side by side.
export function Delta({ id, before, after }: { id: string; before?: Partial<Units>; after?: Partial<Units> }) {
  const t = useTurn();
  const b = unitTotal({ ...emptyUnits(), ...before });
  const a = unitTotal({ ...emptyUnits(), ...after });
  return (
    <p className="delta">
      <strong>{t.name(id)}</strong>
      <UnitsLine u={before} />
      <span className="delta-arrow" aria-label="becomes">
        →
      </span>
      <UnitsLine u={after} />
      {a !== b && <span className={`delta-n ${a > b ? "up" : "down"}`}>{a > b ? `+${a - b}` : a - b}</span>}
    </p>
  );
}

export function OddsMeter({ odds }: { odds: Odds | null }) {
  if (!odds) return <p className="small muted">Odds unknown: you can&rsquo;t see who&rsquo;s defending.</p>;
  const pct = Math.round(odds.win * 100);
  const tone = pct >= 75 ? "good" : pct >= 45 ? "fair" : "bad";
  return (
    <div className={`meter ${tone}`}>
      <p className="meter-top">
        <strong>{pct}%</strong> chance to win <span className="meter-word">{pct >= 75 ? "Strong" : pct >= 45 ? "Risky" : "Long shot"}</span>
      </p>
      <div className="meter-bar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Chance to win">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small">
        You&rsquo;d lose about {odds.attackerLoss.toFixed(1)} · they&rsquo;d lose about {odds.defenderLoss.toFixed(1)}
      </p>
    </div>
  );
}

export function AffordNote({ afford }: { afford: Afford }) {
  if (afford.status === "yes") return <p className="afford ok">✅ You can afford it.</p>;
  if (afford.status === "buy")
    return (
      <p className="afford buy">
        🛒 You&rsquo;re short, so this first buys <CostChips cost={afford.buy} /> for {afford.coin} 🪙 at the Bank.
      </p>
    );
  return (
    <p className="afford no">
      ❌ Not enough yet: you&rsquo;re short <CostChips cost={afford.short} />.
    </p>
  );
}

// ---------------------------------------------------------------- troops

export function TroopPicker({ region, avail, value, onChange }: { region?: RegionView; avail: Units; value: Units; onChange: (u: Units) => void }) {
  const types = UNIT_TYPES.filter((t) => avail[t] > 0);
  const allButOne = keepOneHome(region, avail);
  return (
    <div className="troop-pick">
      {types.map((t) => (
        <div key={t} className="troop-row">
          <span className="troop-icon" aria-hidden="true">
            {UNITS[t].icon}
          </span>
          <span className="troop-name">
            <strong>{UNITS[t].plural}</strong>
            <span className="small muted">
              {avail[t]} ready · attack +{UNITS[t].attack} · defence +{UNITS[t].defense}
            </span>
          </span>
          <Stepper value={value[t]} max={avail[t]} onChange={(n) => onChange({ ...value, [t]: n })} label={UNITS[t].plural} />
        </div>
      ))}
      <div className="troop-quick" role="group" aria-label="Quick picks">
        <button type="button" className="chip" onClick={() => onChange({ ...avail })}>
          All {unitTotal(avail)}
        </button>
        {unitTotal(allButOne) !== unitTotal(avail) && (
          <button type="button" className="chip" onClick={() => onChange(allButOne)}>
            All but one
          </button>
        )}
        <button type="button" className="chip" onClick={() => onChange(emptyUnits())}>
          None
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- review

// Amounts of goods, zeros included (CostChips hides them).
export function Amounts({ c }: { c: Cost }) {
  return (
    <span className="cost">
      {GOODS.filter((g) => c[g] !== undefined).map((g) => (
        <span key={g} title={GOOD_INFO[g].label}>
          {c[g]}
          {GOOD_INFO[g].icon}
        </span>
      ))}
    </span>
  );
}

// What you'd have left of each good the action spends (after buying anything missing).
function leftAfter(goods: Cost, cost: Cost, a: Afford): Cost {
  const out: Cost = {};
  for (const g of GOODS) {
    const spend = (cost[g] ?? 0) + (g === "coin" && a.status === "buy" ? a.coin : 0);
    const bought = a.status === "buy" ? a.buy[g] ?? 0 : 0;
    if (spend > 0) out[g] = (goods[g] ?? 0) + bought - spend;
  }
  return out;
}

// The last step of every action: exactly what will happen, what it costs, and one big button.
export function Review({
  title,
  children,
  cost,
  afford,
  label,
  danger,
  blocked,
  onGo,
}: {
  title: ReactNode;
  children?: ReactNode;
  cost?: Cost;
  afford?: Afford;
  label: string;
  danger?: boolean;
  blocked?: string | null; // why it can't be done right now
  onGo: () => Promise<unknown>;
}) {
  const t = useTurn();
  const [working, setWorking] = useState(false);
  const goods: Cost = meIn(t.view).goods ?? {};
  const why = blocked ?? (afford?.status === "no" ? "You can't afford it yet." : !t.myTurn ? "This opens on your turn." : null);
  return (
    <section className={`review${danger ? " danger" : ""}`}>
      <p className="review-eyebrow">You&rsquo;re about to</p>
      <p className="review-title">{title}</p>
      {children}
      {cost && Object.keys(cost).length > 0 && (
        <dl className="review-cost">
          <div>
            <dt>Cost</dt>
            <dd>
              <CostChips cost={cost} have={goods} />
            </dd>
          </div>
          {afford && afford.status !== "no" && (
            <div>
              <dt>You&rsquo;ll have left</dt>
              <dd>
                <Amounts c={leftAfter(goods, cost, afford)} />
              </dd>
            </div>
          )}
        </dl>
      )}
      {afford && <AffordNote afford={afford} />}
      <button
        type="button"
        className={`btn review-go${danger ? " danger" : ""}`}
        disabled={Boolean(why) || t.busy || working}
        onClick={async () => {
          setWorking(true);
          await onGo();
          setWorking(false);
        }}
      >
        {working ? "⏳ Working…" : label}
      </button>
      {why && <p className="small muted review-why">{why}</p>}
    </section>
  );
}

// A plan that no longer fits the world (a region changed hands, the troops moved…).
export function Stale({ why }: { why: string }) {
  const t = useTurn();
  return (
    <div className="flow-empty">
      <p>🔄 {why}</p>
      <button type="button" className="btn small" onClick={() => t.popTo(0)}>
        Back to the menu
      </button>
    </div>
  );
}
