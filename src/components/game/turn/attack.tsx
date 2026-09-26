"use client";

// ⚔️ Attack, step by step: pick a target, where to attack from, who goes, then check the odds and attack.

import { useMemo, useState } from "react";
import { restedIn } from "@/game/army";
import { unitTotal, type Units } from "@/game/engine";
import { attackOdds, viewHeroBonus } from "@/game/odds";
import { REGION_BY_ID } from "@/game/regions";
import { GOOD_INFO, HEROES, HERO_IDS, UNIT_TYPES } from "@/game/rules";
import { pick, type PageOf } from "@/game/turnFlow";
import { attackCostText } from "@/game/tribunal";
import {
  afford,
  atPeace,
  attackBar,
  attackSources,
  attackTargets,
  barred,
  canChoose,
  keepOneHome,
  lineState,
  linesClosed,
  meIn,
  onStrike,
  regionIn,
  thirstFor,
  unitsOf,
  type AttackTarget,
  type TargetStatus,
} from "@/game/turnOptions";
import type { RegionView } from "@/game/engine";
import { SanctionNote } from "../panels";
import { Badge, Choice, Empty, Frame, Group, OddsMeter, Review, Stale, TroopPicker, UnitsLine, ownerColor, ownerLabel, useTurn } from "./kit";

const pctTone = (p: number) => (p >= 75 ? "good" : p >= 45 ? "fair" : "bad");

const GROUPS: [TargetStatus, string, string?][] = [
  ["ready", "⚔️ Ready to attack now"],
  ["needLine", "🚡 Build a gondola line first", "Troops only travel by gondola. Pick one of these and building the line is the next step."],
  ["resting", "💤 Your troops next to these are resting", "Troops that moved or were just recruited rest until your next turn."],
  ["pact", "🤝 You're at peace with these", "You have a pact with the owner. Break it in Diplomacy first (and become an Oathbreaker)."],
  ["ceasefire", "🕊️ Off-limits: you're under a Ceasefire", "A war crimes sentence keeps you out of other Kirds' land until it ends. The natives are still fair game."],
  ["blocked", "🔒 Blocked", "Another Kird's gondola line already runs there, and you can't ride it."],
];

export function AttackTarget({ page }: { page: PageOf<"attackTarget"> }) {
  const t = useTurn();
  const list = useMemo(() => attackTargets(t.view, { from: page.from }), [t.view, page.from]);
  const strike = linesClosed(t.view);
  return (
    <Frame
      page={page}
      question={page.from ? `Attack from ${t.name(page.from)}: which target?` : "Who do you want to attack?"}
      help="Tap a glowing region on the globe, or pick one below. Best odds first."
    >
      {!list.length && <Empty>You hold every region around {page.from ? t.name(page.from) : "you"}. Attack from the edge of your land.</Empty>}
      {GROUPS.map(([status, title, note]) => {
        const items = list.filter((x) => x.status === status);
        if (!items.length) return null;
        return (
          <Group key={status} title={`${title} (${items.length})`} note={status === "needLine" && strike ? <NoNewLines /> : note}>
            {items.map((x) => (
              <TargetChoice key={x.id} x={x} strike={strike} onPick={() => pickAndGo(t, page, x.id)} />
            ))}
          </Group>
        );
      })}
    </Frame>
  );
}

// Why no new gondola line can be built right now, in a sentence (it sits inside other text).
export function NoNewLines() {
  const t = useTurn();
  if (onStrike(t.view)) return <>The gondola workers are on strike this round: no new lines until next round.</>;
  const left = meIn(t.view).sentence?.turnsLeft ?? 0;
  return (
    <>
      🚧 Gondola ban: war criminals can&rsquo;t build gondola lines (your old lines still run). Your sentence has {left} turn{left === 1 ? "" : "s"} left.
    </>
  );
}

// What an attack would do to your Bloodthirst, and whether it puts you on trial.
export function ThirstNote({ target }: { target: string }) {
  const t = useTurn();
  const cost = thirstFor(t.view, target);
  if (!cost) return null;
  return <p className={`small thirst-note${cost.trial ? " warn" : ""}`}>{attackCostText(cost)}</p>;
}

function pickAndGo(t: ReturnType<typeof useTurn>, page: Parameters<typeof pick>[0], id: string) {
  const next = pick(page, id, t.view);
  if (next) t.go(next);
}

function TargetChoice({ x, strike, onPick }: { x: AttackTarget; strike: boolean; onPick: () => void }) {
  const t = useTurn();
  const r = x.region;
  const pct = x.best?.odds ? Math.round(x.best.odds.win * 100) : null;
  const from = x.best ? t.name(x.best.from) : "";
  const thirst = canChoose(x.status, strike) ? thirstFor(t.view, r.id) : null;
  return (
    <Choice
      swatch={ownerColor(t, r)}
      icon={GOOD_INFO[REGION_BY_ID.get(r.id)!.resource].icon}
      title={t.name(r.id)}
      sub={<Defenders r={r} />}
      side={pct !== null && x.status === "ready" ? <span className={`odds-chip ${pctTone(pct)}`}>{pct}%</span> : null}
      badge={
        !canChoose(x.status, strike) ? (
          <Badge kind="off">{x.status === "needLine" ? (onStrike(t.view) ? "strike" : "🚧 gondola ban") : x.status === "ceasefire" ? "🕊️ ceasefire" : x.status}</Badge>
        ) : thirst?.trial ? (
          <Badge kind="bad">⚖️ trial</Badge>
        ) : null
      }
      onClick={onPick}
      disabled={!canChoose(x.status, strike)}
    >
      <span className="choice-note">
        {x.status === "ready"
          ? `From ${from}, with ${unitTotal(x.best!.rested)} ready`
          : x.status === "needLine"
            ? `From ${from}, once you build a line`
            : x.status === "resting"
              ? `${from}'s troops are resting`
              : ownerLabel(t, r)}
      </span>
      {thirst && thirst.points > 0 && (
        <span className="choice-note thirst">{thirst.trial ? `⚖️ Puts you on trial for war crimes (🩸 ${thirst.after})` : `🩸 +${thirst.points} Bloodthirst`}</span>
      )}
    </Choice>
  );
}

// Who's defending a region, and anything that helps them.
function Defenders({ r }: { r: RegionView }) {
  const t = useTurn();
  return (
    <>
      {ownerLabel(t, r)} · {unitTotal(unitsOf(r)) ? <UnitsLine u={r.units} /> : "no defenders"}
      {r.buildings?.includes("fort") && " · 🏰 Fort"}
    </>
  );
}

// The target, at the top of each later step.
function TargetCard({ id, from }: { id: string; from?: string }) {
  const t = useTurn();
  const r = regionIn(t.view, id)!;
  const heroes = HERO_IDS.filter((h) => t.view.heroes[h].region === id && t.view.heroes[h].owner === r.owner && r.owner);
  const bonus = (r.buildings?.includes("fort") ? 1 : 0) + viewHeroBonus(t.view, r.owner, id);
  return (
    <div className="route-card" style={{ borderColor: ownerColor(t, r) }}>
      <p className="route-line">
        {from && (
          <>
            <strong>{t.name(from)}</strong> <span aria-label="attacks">⚔️➜</span>{" "}
          </>
        )}
        <strong>{t.name(id)}</strong>
      </p>
      <p className="small">
        <Defenders r={r} />
        {heroes.length > 0 && ` · ${heroes.map((h) => `${HEROES[h].icon} ${HEROES[h].name}`).join(", ")}`}
      </p>
      {bonus > 0 && <p className="small warn-text">🛡️ Defenders get +{bonus} on every die.</p>}
    </div>
  );
}

export function AttackFrom({ page }: { page: PageOf<"attackFrom"> }) {
  const t = useTurn();
  const target = regionIn(t.view, page.target);
  const sources = useMemo(() => attackSources(t.view, page.target), [t.view, page.target]);
  const strike = linesClosed(t.view);
  const bar = attackBar(t.view, page.target);
  if (!target || target.fog || target.owner === t.view.me) {
    return (
      <Frame page={page} question="Attack from where?">
        <Stale why={`${t.name(page.target)} can't be attacked any more.`} />
      </Frame>
    );
  }
  return (
    <Frame page={page} question={`Attack ${t.name(page.target)} from where?`} help="These are your regions next to it. More rested troops means better odds.">
      <TargetCard id={page.target} />
      {bar === "ceasefire" && <SanctionNote view={t.view} sanction="ceasefire" />}
      {bar === "pact" && <p className="warn-line">🤝 You have a pact with {ownerLabel(t, target)}. Break it in Diplomacy first.</p>}
      {!bar && <ThirstNote target={page.target} />}
      <div className="choice-list">
        {sources.map((s) => {
          const pct = s.odds ? Math.round(s.odds.win * 100) : null;
          return (
            <Choice
              key={s.from}
              icon="🏠"
              title={t.name(s.from)}
              sub={
                unitTotal(s.rested) ? (
                  <>
                    Ready to go: <UnitsLine u={s.rested} />
                  </>
                ) : (
                  "Everyone here is resting this turn"
                )
              }
              badge={
                s.status === "ready" ? (
                  <Badge kind="ok">🚡 line ready</Badge>
                ) : s.status === "needLine" ? (
                  <Badge kind="warn">🚡 needs a line</Badge>
                ) : s.status === "blocked" ? (
                  <Badge kind="off">🔒 their line</Badge>
                ) : (
                  <Badge kind="off">💤 resting</Badge>
                )
              }
              side={pct !== null && !bar && canChoose(s.status, strike) ? <span className={`odds-chip ${pctTone(pct)}`}>{pct}%</span> : null}
              disabled={Boolean(bar) || !canChoose(s.status, strike)}
              onClick={() => pickAndGo(t, page, s.from)}
            />
          );
        })}
      </div>
    </Frame>
  );
}

export function AttackLine({ page }: { page: PageOf<"attackLine"> }) {
  const t = useTurn();
  return (
    <Frame
      page={page}
      question="First, build a gondola line"
      help={`Troops only travel by urban gondola, and there's no line from ${t.name(page.from)} to ${t.name(page.target)} yet. Build it now, then pick who attacks.`}
    >
      <TargetCard id={page.target} from={page.from} />
      <LineReview from={page.from} to={page.target} then={{ step: "attackTroops", target: page.target, from: page.from }} />
    </Frame>
  );
}

// Build a gondola line: the last step of "Build a line", and the detour when an attack or move needs one.
export function LineReview({ from, to, then }: { from: string; to: string; then?: PageOf<"attackTroops"> | PageOf<"moveTroops"> }) {
  const t = useTurn();
  const cost = t.view.prices.gondola;
  const a = afford(t.view, cost);
  const why =
    regionIn(t.view, from)?.owner !== t.view.me
      ? `${t.name(from)} isn't yours any more.`
      : lineState(t.view, from, to) !== "none"
        ? "There's already a line there."
        : onStrike(t.view)
          ? "The gondola workers are on strike this round. Try again next round."
          : barred(t.view, "gondolas")
            ? "🚧 Gondola ban: war criminals can't build gondola lines until their sentence ends."
            : null;
  return (
    <Review
      title={
        <>
          🚡 Build a gondola line <strong>{t.name(from)}</strong> ⇄ <strong>{t.name(to)}</strong>
        </>
      }
      cost={cost}
      afford={a}
      blocked={why}
      label={then ? "🚡 Build the line, then pick troops" : "🚡 Build the line"}
      onGo={() => t.run({ type: "gondola", from, to }, { cost, then })}
    >
      <p className="small">Your troops can ride it both ways, starting right away (and your heroes too, between regions of yours).</p>
    </Review>
  );
}

export function AttackTroops({ page }: { page: PageOf<"attackTroops"> }) {
  const t = useTurn();
  const from = regionIn(t.view, page.from);
  const avail = from ? restedIn(from) : unitsOf();
  const [send, setSend] = useState<Units>(() => page.units ?? keepOneHome(from, avail));
  const odds = useMemo(() => (unitTotal(send) ? attackOdds(t.view, page.from, page.target, send) : null), [t.view, page.from, page.target, send]);
  const stale = staleAttack(t, page.from, page.target);
  if (stale) {
    return (
      <Frame page={page} question="Who goes into battle?">
        <Stale why={stale} />
      </Frame>
    );
  }
  const staying = unitTotal(unitsOf(from)) - unitTotal(send);
  return (
    <Frame page={page} question="Who goes into battle?" help="Pick how many of each unit to send. Your odds update as you go.">
      <TargetCard id={page.target} from={page.from} />
      <TroopPicker region={from} avail={avail} value={send} onChange={setSend} />
      {unitTotal(send) > 0 ? <OddsMeter odds={odds} /> : <p className="flow-help">Pick at least one unit to send.</p>}
      {unitTotal(send) > 0 && <ThirstNote target={page.target} />}
      {unitTotal(send) > 0 && staying === 0 && <p className="warn-line">⚠️ {t.name(page.from)} would be left empty: anyone next to it could walk in.</p>}
      <button type="button" className="btn next" disabled={!unitTotal(send)} onClick={() => t.go({ step: "attackReview", target: page.target, from: page.from, units: send }, { ...page, units: send })}>
        Next: check the plan →
      </button>
    </Frame>
  );
}

// Why an attack plan no longer works, if it doesn't.
function staleAttack(t: ReturnType<typeof useTurn>, from: string, target: string, units?: Units) {
  const src = regionIn(t.view, from);
  const tgt = regionIn(t.view, target);
  if (src?.owner !== t.view.me) return `${t.name(from)} isn't yours any more.`;
  if (!tgt || tgt.owner === t.view.me) return `${t.name(target)} is already yours.`;
  const bar = attackBar(t.view, target);
  if (bar === "pact") return `You have a pact with ${ownerLabel(t, tgt)}. Break it in Diplomacy first.`;
  if (bar === "ceasefire") return "🕊️ Ceasefire: your war crimes sentence keeps you out of other Kirds' land for now.";
  if (lineState(t.view, from, target) !== "ours") return `There's no gondola line of yours from ${t.name(from)} to ${t.name(target)}.`;
  const rested = restedIn(src);
  if (!unitTotal(rested)) return `Everyone in ${t.name(from)} is resting now.`;
  if (units && UNIT_TYPES.some((u) => (units[u] ?? 0) > rested[u])) return `${t.name(from)} doesn't have those troops ready any more.`;
  return null;
}

export function AttackReview({ page }: { page: PageOf<"attackReview"> }) {
  const t = useTurn();
  const target = regionIn(t.view, page.target);
  const odds = useMemo(() => attackOdds(t.view, page.from, page.target, page.units), [t.view, page.from, page.target, page.units]);
  const stale = staleAttack(t, page.from, page.target, page.units);
  if (stale || !target) {
    return (
      <Frame page={page} question="Ready to attack?">
        <Stale why={stale ?? "That region is gone."} />
      </Frame>
    );
  }
  const staying = unitsOf(regionIn(t.view, page.from));
  for (const u of UNIT_TYPES) staying[u] -= page.units[u] ?? 0;
  const atk = viewHeroBonus(t.view, t.view.me, page.from);
  const empty = !unitTotal(unitsOf(target));
  const pact = atPeace(t.view, target.owner);
  const thirst = thirstFor(t.view, page.target);
  return (
    <Frame page={page} question="Ready to attack?" help="Check the plan. The battle plays out on screen as soon as you attack.">
      <Review
        title={
          <>
            ⚔️ Attack <strong>{t.name(page.target)}</strong> from {t.name(page.from)} with <UnitsLine u={page.units} />
          </>
        }
        danger
        blocked={pact ? `You have a pact with ${ownerLabel(t, target)}. Break it first.` : null}
        label={`${empty ? `🏳️ Walk into ${t.name(page.target)}` : `⚔️ Attack ${t.name(page.target)}!`}${thirst?.trial ? " ⚖️" : ""}`}
        onGo={() => t.run({ type: "move", from: page.from, to: page.target, units: page.units })}
      >
        <dl className="review-facts">
          <div>
            <dt>Defenders</dt>
            <dd>
              <Defenders r={target} />
            </dd>
          </div>
          {atk > 0 && (
            <div>
              <dt>Your heroes</dt>
              <dd>+{atk} on every attacking die</dd>
            </div>
          )}
          <div>
            <dt>Staying in {t.name(page.from)}</dt>
            <dd>
              <UnitsLine u={staying} none="nobody ⚠️" />
            </dd>
          </div>
        </dl>
        {empty ? <p className="afford ok">🏳️ Nobody is defending it: you&rsquo;ll walk straight in.</p> : <OddsMeter odds={odds} />}
        <ThirstNote target={page.target} />
        <p className="small">Win, and your survivors move in and rest until your next turn. Lose, and every attacker falls.</p>
      </Review>
    </Frame>
  );
}
