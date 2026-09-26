"use client";

// The turn menu: "What do you want to do?", then each action one step at a time, then what happened.

import { useEffect, useMemo, useRef, useState } from "react";
import { advise, type Suggestion } from "@/game/advisor";
import { unitTotal, type Action, type BattleData, type GameEvent } from "@/game/engine";
import { describeOutcome, goodsDelta } from "@/game/outcomes";
import { sunTzuOpening, sunTzuSays } from "@/game/sunTzu";
import { attackNext, type Page, type PageOf } from "@/game/turnFlow";
import { ballotsDue } from "@/game/tribunal";
import {
  afford,
  atPeace,
  attackBar,
  attackTargets,
  barred,
  buildOptions,
  heroOptions,
  lineSources,
  linesClosed,
  meIn,
  moveSources,
  recruitLimit,
  regionIn,
  unitsOf,
  type Afford,
} from "@/game/turnOptions";
import { CostChips } from "../bits";
import { RenameForm } from "../panels";
import { Race } from "../Race";
import { AttackFrom, AttackLine, AttackReview, AttackTarget, AttackTroops } from "./attack";
import { Bank, BuyCount, BuyReview, BuyWhat, ExchangePick, ExchangeReview, SwapGet, SwapGive, SwapReview } from "./bank";
import { BuildReview, BuildWhat, BuildWhere, LineFrom, LineReviewPage, LineTo } from "./build";
import { BreakReview, Diplomacy, KirdPage, LoanDeal, LoanReview, OfferPage, PactReview, TradeDeal, TradeReview } from "./diplomacy";
import { EndTurn } from "./end";
import { HeroReview, HeroTo, Heroes, HireReview, HireWhere, PickpocketReview, PickpocketWho, ThunderReview, ThunderTarget } from "./heroes";
import { Badge, Choice, Delta, Group, Hub, TurnProvider, useTurn, type BadgeKind, type Turn } from "./kit";
import { MoveFrom, MoveLine, MoveReview, MoveTo, MoveTroops } from "./move";
import { RecruitCount, RecruitReview, RecruitWhat, RecruitWhere } from "./recruit";
import { RegionPage } from "./RegionPage";

export function TurnMenu({ turn, pageKey }: { turn: Turn; pageKey: number }) {
  return (
    <TurnProvider value={turn}>
      {/* A fresh page (and fresh choices) every time you move through the menu. */}
      <PageView key={pageKey} page={turn.stack.at(-1)!} />
    </TurnProvider>
  );
}

function PageView({ page }: { page: Page }) {
  switch (page.step) {
    case "home":
      return <Home />;
    case "ideas":
      return <Ideas />;
    case "region":
      return <RegionPage id={page.id} />;
    case "attackTarget":
      return <AttackTarget page={page} />;
    case "attackFrom":
      return <AttackFrom page={page} />;
    case "attackLine":
      return <AttackLine page={page} />;
    case "attackTroops":
      return <AttackTroops page={page} />;
    case "attackReview":
      return <AttackReview page={page} />;
    case "moveFrom":
      return <MoveFrom page={page} />;
    case "moveTo":
      return <MoveTo page={page} />;
    case "moveLine":
      return <MoveLine page={page} />;
    case "moveTroops":
      return <MoveTroops page={page} />;
    case "moveReview":
      return <MoveReview page={page} />;
    case "buildWhat":
      return <BuildWhat page={page} />;
    case "buildWhere":
      return <BuildWhere page={page} />;
    case "buildReview":
      return <BuildReview page={page} />;
    case "lineFrom":
      return <LineFrom page={page} />;
    case "lineTo":
      return <LineTo page={page} />;
    case "lineReview":
      return <LineReviewPage page={page} />;
    case "recruitWhat":
      return <RecruitWhat page={page} />;
    case "recruitWhere":
      return <RecruitWhere page={page} />;
    case "recruitCount":
      return <RecruitCount page={page} />;
    case "recruitReview":
      return <RecruitReview page={page} />;
    case "heroes":
      return <Heroes />;
    case "hireWhere":
      return <HireWhere page={page} />;
    case "hireReview":
      return <HireReview page={page} />;
    case "heroTo":
      return <HeroTo page={page} />;
    case "heroReview":
      return <HeroReview page={page} />;
    case "thunderTarget":
      return <ThunderTarget page={page} />;
    case "thunderReview":
      return <ThunderReview page={page} />;
    case "pickpocketWho":
      return <PickpocketWho page={page} />;
    case "pickpocketReview":
      return <PickpocketReview page={page} />;
    case "diplomacy":
      return <Diplomacy />;
    case "offer":
      return <OfferPage page={page} />;
    case "kird":
      return <KirdPage page={page} />;
    case "pactReview":
      return <PactReview page={page} />;
    case "breakReview":
      return <BreakReview page={page} />;
    case "tradeDeal":
      return <TradeDeal page={page} />;
    case "tradeReview":
      return <TradeReview page={page} />;
    case "loanDeal":
      return <LoanDeal page={page} />;
    case "loanReview":
      return <LoanReview page={page} />;
    case "bank":
      return <Bank />;
    case "buyWhat":
      return <BuyWhat page={page} />;
    case "buyCount":
      return <BuyCount page={page} />;
    case "buyReview":
      return <BuyReview page={page} />;
    case "swapGive":
      return <SwapGive page={page} />;
    case "swapGet":
      return <SwapGet page={page} />;
    case "swapReview":
      return <SwapReview page={page} />;
    case "exchangePick":
      return <ExchangePick page={page} />;
    case "exchangeReview":
      return <ExchangeReview page={page} />;
    case "end":
      return <EndTurn />;
    case "done":
      return <Done page={page} />;
  }
}

// ---------------------------------------------------------------- the menu

type Tile = { key: string; icon: string; title: string; sub: string; page: Page; status: [BadgeKind, string] };

const canPay = (a: Afford) => a.status !== "no";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The eight things you can do, each saying what's possible right now.
function tiles(t: Turn): Tile[] {
  const { view } = t;
  const targets = attackTargets(view, { odds: false });
  const ready = targets.filter((x) => x.status === "ready").length;
  const needLine = targets.filter((x) => x.status === "needLine").length;
  const moves = moveSources(view);
  const movers = moves.filter((s) => s.status === "ready").reduce((n, s) => n + unitTotal(s.rested), 0);
  const builds =
    buildOptions(view).filter((o) => o.where.length && canPay(o.afford)).length +
    (!linesClosed(view) && lineSources(view).length && canPay(afford(view, view.prices.gondola)) ? 1 : 0);
  const pandas = recruitLimit(view, "panda");
  const ogres = recruitLimit(view, "nacam");
  const heroes = heroOptions(view);
  const mine = heroes.filter((h) => h.owner === view.me).length;
  const hire = heroes.filter((h) => !h.owner && canPay(h.afford)).length;
  const offers = view.offers.filter((o) => o.to === view.me).length;
  const votes = ballotsDue(view).length;
  const pacts = view.players.filter((p) => p.id !== view.me && atPeace(view, p.id)).length;
  const ceasefire = targets.some((x) => x.status === "ceasefire");
  return [
    {
      key: "attack",
      icon: "⚔️",
      title: "Attack",
      sub: "Invade a neighbour and take their land",
      page: { step: "attackTarget" },
      status: ready
        ? ["ok", `${plural(ready, "target")} ready`]
        : needLine && !linesClosed(view)
          ? ["warn", "Build a gondola line first"]
          : ceasefire
            ? ["off", "🕊️ Ceasefire: natives only"]
            : ["off", "Nothing to attack now"],
    },
    {
      key: "move",
      icon: "🚡",
      title: "Move troops",
      sub: "Send troops between your regions",
      page: { step: "moveFrom" },
      status: movers
        ? ["ok", `${plural(movers, "troop")} can move`]
        : moves.some((s) => s.status === "needLine")
          ? ["warn", "Join your regions with a line"]
          : ["off", moves.length ? "Everyone is resting" : "No routes yet"],
    },
    {
      key: "build",
      icon: "🏗️",
      title: "Build",
      sub: "Buildings and gondola lines",
      page: { step: "buildWhat" },
      status: builds ? ["ok", `${plural(builds, "thing")} you can afford`] : ["off", "Can't afford anything yet"],
    },
    {
      key: "recruit",
      icon: "🪖",
      title: "Recruit",
      sub: "Train new troops",
      page: { step: "recruitWhat" },
      status: barred(view, "arms")
        ? ["off", "🚫 Arms embargo"]
        : pandas
          ? ["ok", `Up to ${plural(pandas, "panda")}`]
          : ogres
            ? ["ok", `Up to ${plural(ogres, "ogre")}`]
            : ["off", "Can't afford troops yet"],
    },
    {
      key: "heroes",
      icon: "🦸",
      title: "Heroes",
      sub: "Hire a hero or use one",
      page: { step: "heroes" },
      status: barred(view, "heroes")
        ? ["off", "🪧 Heroes on strike"]
        : hire
          ? ["ok", `${plural(hire, "hero", "heroes")} you can hire`]
          : mine
            ? ["info", `${plural(mine, "hero", "heroes")} of yours`]
            : ["off", "None affordable yet"],
    },
    {
      key: "deal",
      icon: "🤝",
      title: "Diplomacy",
      sub: "Pacts, trades and panda loans",
      page: { step: "diplomacy" },
      status: votes
        ? ["warn", `⚖️ ${plural(votes, "vote")} for you to cast`]
        : offers
          ? ["warn", `📨 ${plural(offers, "offer")} waiting`]
          : pacts
            ? ["info", `${plural(pacts, "pact")}`]
            : ["info", "Talk to the Kirds"],
    },
    {
      key: "bank",
      icon: "🏦",
      title: "Bank",
      sub: "Buy, swap and exchange goods",
      page: { step: "bank" },
      status: barred(view, "trade") ? ["off", "🏦 Closed to you"] : ["info", `Resources ${view.prices.buyPrice} 🪙 each`],
    },
    { key: "end", icon: "⏭", title: "End turn", sub: "Finish and pass the turn on", page: { step: "end" }, status: ["info", "When you're done"] },
  ];
}

// Where one of Sun Tzu's suggestions starts in the menu.
export function ideaPage(tip: Suggestion, t: Turn): Page | null {
  if (tip.plan) return attackNext(t.view, tip.plan.to, tip.plan.from);
  const a = tip.action;
  if (a?.type === "gondola") return { step: "lineReview", from: a.from, to: a.to };
  if (a?.type === "recruit") return { step: "recruitReview", unit: a.unit, region: a.region, count: a.count };
  if (a?.type === "build") return { step: "buildReview", building: a.building, region: a.region };
  if (a?.type === "endTurn") return { step: "end" };
  if (tip.tab) return { step: tip.tab };
  return null;
}

function Home() {
  const t = useTurn();
  const { view } = t;
  const me = meIn(view);
  const list = useMemo(() => tiles(t), [t]);
  const tips = useMemo(() => (t.myTurn ? advise(view) : []), [view, t.myTurn]);
  const tip = tips.find((x) => ideaPage(x, t));
  const firstTurn = view.round === 1 && me.regions === 1;
  if (t.over) {
    return (
      <Hub icon="🏁" title="The game is over" sub="You can still look around the map and read the log." tone="end">
        <Race ctx={t} />
      </Hub>
    );
  }
  return (
    <div className="panel-body menu-home">
      <header className="home-head">
        <p className="eyebrow">{t.myTurn ? `Your turn · Round ${view.round}` : `Round ${view.round}`}</p>
        <h2>{t.myTurn ? "What do you want to do?" : `It's ${t.activeName}'s turn`}</h2>
        <p className="home-sub">
          {t.myTurn
            ? "Pick an action. Each one walks you through it, step by step, and shows you what happened."
            : "Your moves open on your turn. Meanwhile, tap any region to learn about it, or open an action to plan ahead."}
        </p>
      </header>
      {me.autopilot && (
        <p className="autopilot-pill">
          🤖 Autopilot is playing your turns.{" "}
          <button type="button" onClick={() => t.setAutopilot(false)} disabled={t.busy}>
            Take back command
          </button>
        </p>
      )}
      {firstTurn && t.myTurn && (
        <p className="first-hint">
          🌱 <strong>Your first turn.</strong> Troops only travel by 🚡 gondola, so start by building a line to a weak neighbour (Build → Gondola line),
          then attack it. Every region you hold pays you each turn.
        </p>
      )}
      {tip && (
        <section className="sun-card">
          <SunTzuPortrait />
          <div>
            <p className="sun-card-head">💡 Sun Tzu suggests</p>
            <p className="sun-tzu-quote small">&ldquo;{sunTzuSays(tip, view.turn, 0)}&rdquo;</p>
            <strong>
              {tip.icon} {tip.title}
            </strong>
            {tip.detail && <p className="small muted">{tip.detail}</p>}
            {tip.warCrime && <p className="small thirst-note warn">⚖️ This attack would put you on trial for war crimes.</p>}
            <div className="form-actions">
              <button type="button" className="btn small" onClick={() => t.go(ideaPage(tip, t)!)}>
                {tip.button ?? "Show me how"} →
              </button>
              {tips.length > 1 && (
                <button type="button" className="btn ghost small" onClick={() => t.go({ step: "ideas" })}>
                  More ideas ({tips.length})
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      <nav className="action-grid" aria-label="Actions">
        {list.map((x) => (
          <button key={x.key} type="button" className={`tile tone-${x.key}`} onClick={() => t.go(x.page)}>
            <span className="tile-icon" aria-hidden="true">
              {x.icon}
            </span>
            <span className="tile-title">{x.title}</span>
            <span className="tile-sub">{x.sub}</span>
            <span className={`tile-status ${x.status[0]}`}>{x.status[1]}</span>
          </button>
        ))}
      </nav>
      <Race ctx={t} />
    </div>
  );
}

function Ideas() {
  const t = useTurn();
  const me = meIn(t.view);
  const tips = useMemo(() => advise(t.view), [t.view]);
  return (
    <Hub icon="💡" title="Sun Tzu's ideas" sub={`“${sunTzuOpening(t.view.turn, t.view.round === 1 && me.regions === 1, t.myTurn)}”`} tone="end">
      <div className="choice-list">
        {tips.map((tip, i) => {
          const page = ideaPage(tip, t);
          return (
            <Choice
              key={tip.id}
              icon={tip.icon}
              title={tip.title}
              sub={tip.detail}
              badge={tip.warCrime ? <Badge kind="bad">⚖️ trial</Badge> : null}
              disabled={!page}
              onClick={() => page && t.go(page)}
            >
              <span className="choice-note sun-tzu-quote">&ldquo;{sunTzuSays(tip, t.view.turn, i)}&rdquo;</span>
            </Choice>
          );
        })}
      </div>
      <p className="muted small">Sun Tzu only knows what you can see. Some of his sayings are real; the panda ones, probably not.</p>
    </Hub>
  );
}

// ---------------------------------------------------------------- what happened

type Next = { icon: string; title: string; page: Page };

// Sensible follow-ups to what you just did.
function nextSteps(t: Turn, a: Action): Next[] {
  const v = t.view;
  const out: Next[] = [];
  switch (a.type) {
    case "gondola": {
      const end = regionIn(v, a.to);
      if (end && end.owner !== v.me && !attackBar(v, a.to)) out.push({ icon: "⚔️", title: `Attack ${t.name(a.to)} now`, page: attackNext(v, a.to, a.from) });
      if (end?.owner === v.me) out.push({ icon: "🚡", title: `Move troops to ${t.name(a.to)}`, page: { step: "moveTroops", from: a.from, to: a.to } });
      out.push({ icon: "🏗️", title: "Build something else", page: { step: "buildWhat" } });
      break;
    }
    case "build":
      out.push({ icon: "🏗️", title: "Build something else", page: { step: "buildWhat" } });
      break;
    case "recruit":
    case "arm":
      out.push({ icon: "🪖", title: "Recruit more", page: { step: "recruitWhat" } });
      break;
    case "move":
      if (regionIn(v, a.to)?.owner === v.me) out.push({ icon: "📍", title: `See ${t.name(a.to)}`, page: { step: "region", id: a.to } });
      out.push({ icon: "⚔️", title: "Attack somewhere", page: { step: "attackTarget" } }, { icon: "🚡", title: "Move troops", page: { step: "moveFrom" } });
      break;
    case "recruitHero":
    case "moveHero":
    case "thunder":
    case "pickpocket":
      out.push({ icon: "🦸", title: "Back to the heroes", page: { step: "heroes" } });
      break;
    case "offerTrade":
    case "offerPact":
    case "offerLoan":
    case "respond":
    case "cancelOffer":
    case "breakPact":
      out.push({ icon: "🤝", title: "Back to diplomacy", page: { step: "diplomacy" } });
      break;
    case "buy":
    case "bankTrade":
    case "exchange":
      out.push({ icon: "🏦", title: "Back to the bank", page: { step: "bank" } });
      break;
  }
  out.push({ icon: "⏭", title: "End my turn", page: { step: "end" } });
  return out;
}

const some = (c: object) => Object.keys(c).length > 0;

// The region a move of yours just took, if it took one.
function captured(events: GameEvent[], me: string) {
  const e = events.find((x) => x.actor === me && (x.type === "capture" || (x.type === "battle" && (x.data as Partial<BattleData> | undefined)?.won)));
  return e ? ((e.data as Partial<BattleData> | undefined)?.to ?? e.regions.at(-1) ?? null) : null;
}

// Conquerors name what they take: offered on the result of a capture.
function NameIt({ id }: { id: string }) {
  const t = useTurn();
  const [done, setDone] = useState<"renamed" | "kept" | null>(null);
  if (done === "kept") return null;
  if (done === "renamed") return <p className="done-line">🚩 It&rsquo;s called {t.name(id)} on everyone&rsquo;s map now.</p>;
  if (!regionIn(t.view, id)?.renamable || !t.myTurn) return null;
  return (
    <section className="done-rename" aria-label={`Rename ${t.name(id)}`}>
      <p className="rename-title">🚩 Name what you conquered</p>
      <p className="small">Give {t.name(id)} a new name, or keep this one. Everyone in this world will see it.</p>
      <RenameForm ctx={t} id={id} onDone={() => setDone("renamed")} onCancel={() => setDone("kept")} cancelLabel="Keep the name" />
    </section>
  );
}

function Done({ page }: { page: PageOf<"done"> }) {
  const t = useTurn();
  const took = useMemo(() => captured(page.events, t.view.me), [page.events, t.view.me]);
  const o = useMemo(() => describeOutcome(page.action, page.before, t.view, page.events), [page, t.view]);
  const delta = useMemo(() => goodsDelta(page.before, t.view), [page.before, t.view]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  // Menu pages already in the stack are reopened rather than stacked twice.
  const open = (p: Page) => {
    const i = t.stack.findIndex((x) => x.step === p.step && x.step !== "done" && JSON.stringify(x) === JSON.stringify(p));
    if (i >= 0) t.popTo(i);
    else t.go(p);
  };
  const changed = [...new Set(o.regions)].filter((id) => {
    const was = page.before.regions.find((r) => r.id === id);
    const now = regionIn(t.view, id);
    return was?.owner !== now?.owner || JSON.stringify(unitsOf(was)) !== JSON.stringify(unitsOf(now));
  });
  return (
    <div className={`panel-body done tone-${o.tone}`}>
      <div className="done-hero">
        <span className="done-icon" aria-hidden="true">
          {o.icon}
        </span>
        <h2 ref={heading} tabIndex={-1} role="status">
          {o.title}
        </h2>
      </div>
      {o.lines.map((l) => (
        <p key={l} className="done-line">
          {l}
        </p>
      ))}
      {took && <NameIt id={took} />}
      {(some(delta.spent) || some(delta.gained)) && (
        <div className="done-goods">
          {some(delta.spent) && (
            <p>
              <span className="done-k">Spent</span> <CostChips cost={delta.spent} />
            </p>
          )}
          {some(delta.gained) && (
            <p>
              <span className="done-k">Got</span> <CostChips cost={delta.gained} />
            </p>
          )}
        </div>
      )}
      {changed.length > 0 && (
        <div className="deltas">
          {changed.map((id) => {
            const was = page.before.regions.find((r) => r.id === id);
            const now = regionIn(t.view, id);
            return (
              <div key={id} className="delta-wrap">
                <Delta id={id} before={was?.units} after={now?.units} />
                {was?.owner !== t.view.me && now?.owner === t.view.me && <Badge kind="ok">now yours!</Badge>}
              </div>
            );
          })}
        </div>
      )}
      <Group title="What next?">
        {nextSteps(t, page.action).map((n) => (
          <Choice key={n.title} icon={n.icon} title={n.title} onClick={() => open(n.page)} />
        ))}
      </Group>
      <div className="flow-foot">
        <button type="button" className="btn ghost small" onClick={t.back}>
          ← Back
        </button>
        <button type="button" className="btn ghost small" onClick={() => t.popTo(0)}>
          🧭 Menu
        </button>
      </div>
    </div>
  );
}

// The old master himself: topknot, beard, scroll.
export function SunTzuPortrait() {
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
