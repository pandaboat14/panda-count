"use client";

// 🤝 Diplomacy: answer offers, and pick a Kird to offer a pact, trade, loan pandas or break a pact, step by step.

import { useState } from "react";
import { restedIn } from "@/game/army";
import type { Offer } from "@/game/engine";
import { BLOODTHIRST_ROUNDS, GOODS, GOOD_INFO, HEROES, TRIAL_AT, type Cost } from "@/game/rules";
import { onTrial, sanctionIcons, sanctionLabels, sanctionedIn, tribunalSits } from "@/game/tribunal";
import type { PageOf } from "@/game/turnFlow";
import { atPeace, frontFirst, meIn, myRegions, regionIn } from "@/game/turnOptions";
import { Avatar } from "../../Avatar";
import { CostChips, Stepper, affordable } from "../bits";
import { Race } from "../Race";
import { Tribunal } from "../Tribunal";
import { Badge, Choice, Empty, Frame, Group, Hub, Review, Stale, useTurn } from "./kit";

const nameOf = (t: ReturnType<typeof useTurn>, id: string) => t.view.players.find((p) => p.id === id)?.name ?? "a Kird who left";

// Why you can't trade with `other` right now, if you can't: Trade sanctions on either of you.
function tradeBar(t: ReturnType<typeof useTurn>, other: string) {
  if (sanctionedIn(t.view, t.view.me, "trade")) return "🏦 Trade sanctions: war criminals can't trade with other Kirds.";
  if (sanctionedIn(t.view, other, "trade")) return `🏦 Trade sanctions: nobody can trade with ${nameOf(t, other)}, a convicted war criminal.`;
  return null;
}

// Where a Kird stands with the Tribunal: on trial, a convicted war criminal, and their Bloodthirst.
function Standing({ id }: { id: string }) {
  const t = useTurn();
  const p = t.view.players.find((x) => x.id === id);
  if (!p) return null;
  return (
    <>
      {onTrial(t.view, id) && <Badge kind="warn">⚖️ on trial</Badge>}
      {p.sentence && (
        <Badge kind="bad">
          ☠️ war criminal {sanctionIcons(p.sentence.sanctions)}
        </Badge>
      )}
    </>
  );
}

function thirstText(t: ReturnType<typeof useTurn>, id: string) {
  const p = t.view.players.find((x) => x.id === id);
  if (!p || !tribunalSits(t.view)) return "";
  return ` · 🩸 ${p.bloodthirst}/${TRIAL_AT}${p.convictions ? ` · ☠️ convicted ${p.convictions === 1 ? "once" : `${p.convictions} times`}` : ""}`;
}

function OfferSummary({ o }: { o: Offer }) {
  const t = useTurn();
  if (o.kind === "pact") return <>a non-aggression pact 🤝</>;
  if (o.kind === "loan") return <>a loan of {o.count} panda{o.count === 1 ? "" : "s"} 🐼</>;
  const mine = o.from === t.view.me;
  return (
    <>
      {mine ? "your" : "their"} <CostChips cost={o.give} /> for {mine ? "their" : "your"} <CostChips cost={o.get} />
    </>
  );
}

export function Diplomacy() {
  const t = useTurn();
  const incoming = t.view.offers.filter((o) => o.to === t.view.me);
  const outgoing = t.view.offers.filter((o) => o.from === t.view.me);
  const others = t.view.players.filter((p) => p.id !== t.view.me);
  return (
    <Hub icon="🤝" title="Diplomacy" sub="Make friends, trade, loan pandas, or break a promise." tone="deal">
      <Tribunal ctx={t} />
      {incoming.length > 0 && (
        <Group title={`📨 Waiting for your answer (${incoming.length})`}>
          {incoming.map((o) => (
            <Choice
              key={o.id}
              icon="📨"
              swatch={t.view.players.find((p) => p.id === o.from)?.color}
              title={`${nameOf(t, o.from)} offers you…`}
              sub={<OfferSummary o={o} />}
              badge={<Badge kind="warn">answer</Badge>}
              onClick={() => t.go({ step: "offer", offerId: o.id })}
            />
          ))}
        </Group>
      )}
      <Group title="🌍 The Kirds" note={others.length ? "Pick one to see what you can do with them." : undefined}>
        {!others.length && <Empty>You&rsquo;re alone in this world. Invite the Kirds from the ⋯ menu.</Empty>}
        {others.map((p) => (
          <Choice
            key={p.id}
            swatch={p.color}
            icon={<Avatar value={t.avatars[p.id]} userId={p.id} size={30} />}
            title={
              <>
                {p.bot ? "🤖 " : ""}
                {p.name}
              </>
            }
            badge={
              <>
                {atPeace(t.view, p.id) && <Badge kind="ok">🤝 pact</Badge>}
                {p.oathbreaker && <Badge kind="bad">💔 oathbreaker</Badge>}
                <Standing id={p.id} />
              </>
            }
            sub={`${p.regions} region${p.regions === 1 ? "" : "s"} · ${p.cards} resource card${p.cards === 1 ? "" : "s"}${p.heroes.length ? ` · ${p.heroes.map((h) => HEROES[h].icon).join("")}` : ""}${thirstText(t, p.id)}`}
            onClick={() => t.go({ step: "kird", id: p.id })}
          />
        ))}
      </Group>
      {outgoing.length > 0 && (
        <Group title="📤 Your open offers">
          {outgoing.map((o) => (
            <div key={o.id} className="offer-row">
              <span className="small">
                To <strong>{nameOf(t, o.to)}</strong>: <OfferSummary o={o} />
              </span>
              <button type="button" className="btn ghost small" disabled={!t.myTurn || t.busy} onClick={() => t.run({ type: "cancelOffer", offerId: o.id })}>
                Withdraw
              </button>
            </div>
          ))}
        </Group>
      )}
      {t.view.loans.length > 0 && (
        <Group title="🐼🤝 Panda loans">
          {t.view.loans.map((l) => (
            <p key={l.id} className="small">
              {nameOf(t, l.from)} → {nameOf(t, l.to)}: {l.count} panda{l.count === 1 ? "" : "s"} since round {l.sinceRound}
            </p>
          ))}
        </Group>
      )}
      {tribunalSits(t.view) && (
        <p className="small muted">
          🩸 Your Bloodthirst: <strong className={`thirst${meIn(t.view).bloodthirst >= TRIAL_AT - 1 ? " hot" : ""}`}>{meIn(t.view).bloodthirst}/{TRIAL_AT}</strong>. It counts your attacks
          on other Kirds over the last {BLOODTHIRST_ROUNDS} rounds; reach {TRIAL_AT} and the rest of the Kirds vote on whether you&rsquo;re a war
          criminal.
        </p>
      )}
      <Race ctx={t} />
      {t.view.players.some((p) => p.bot) && <p className="muted small">🤖 Computer players answer offers at the start of their turn.</p>}
    </Hub>
  );
}

export function OfferPage({ page }: { page: PageOf<"offer"> }) {
  const t = useTurn();
  const o = t.view.offers.find((x) => x.id === page.offerId && x.to === t.view.me);
  const me = meIn(t.view);
  if (!o) {
    return (
      <Hub icon="📨" title="An offer" tone="deal">
        <Stale why="That offer is gone: it was withdrawn or already answered." />
      </Hub>
    );
  }
  const from = nameOf(t, o.from);
  const cover = o.kind !== "trade" || affordable(o.get, me.goods);
  const barredTrade = o.kind === "trade" ? tradeBar(t, o.from) : null;
  return (
    <Hub icon="📨" title={`${from}'s offer`} sub="Take it, or turn it down. Either way, they'll know." tone="deal">
      <section className="review">
        <p className="review-eyebrow">{from} offers you</p>
        {o.kind === "trade" ? (
          <dl className="review-facts">
            <div>
              <dt>You get</dt>
              <dd>
                <CostChips cost={o.give} />
              </dd>
            </div>
            <div>
              <dt>You give</dt>
              <dd>
                <CostChips cost={o.get} have={me.goods} />
              </dd>
            </div>
          </dl>
        ) : o.kind === "pact" ? (
          <p className="review-title">🤝 A non-aggression pact: neither of you can invade the other while it lasts.</p>
        ) : (
          <p className="review-title">
            🐼 A loan of {o.count} panda{o.count === 1 ? "" : "s"}. They join your capital, you both earn 1 🐼 PandaCoin per loaned panda every turn, and you&rsquo;re at peace.
          </p>
        )}
        {!cover && <p className="afford no">❌ You can&rsquo;t cover your side of this trade right now.</p>}
        {barredTrade && <p className="small sanction-note">{barredTrade}</p>}
        <div className="form-actions">
          <button type="button" className="btn review-go" disabled={!t.myTurn || t.busy || !cover || Boolean(barredTrade)} onClick={() => t.run({ type: "respond", offerId: o.id, accept: true })}>
            ✅ Accept
          </button>
          <button type="button" className="btn ghost" disabled={!t.myTurn || t.busy} onClick={() => t.run({ type: "respond", offerId: o.id, accept: false })}>
            ✋ Decline
          </button>
        </div>
        {!t.myTurn && <p className="small muted">You can answer on your turn.</p>}
      </section>
    </Hub>
  );
}

export function KirdPage({ page }: { page: PageOf<"kird"> }) {
  const t = useTurn();
  const p = t.view.players.find((x) => x.id === page.id);
  if (!p) {
    return (
      <Hub icon="👤" title="A Kird" tone="deal">
        <Stale why="That Kird has left the world." />
      </Hub>
    );
  }
  const pact = atPeace(t.view, p.id);
  const pactOffered = t.view.offers.find((o) => o.kind === "pact" && o.from === p.id && o.to === t.view.me);
  const pactSent = t.view.offers.some((o) => o.kind === "pact" && o.from === t.view.me && o.to === p.id);
  const josser = t.view.heroes.josserkid.owner === t.view.me;
  const land = t.view.regions.filter((r) => !r.fog && r.owner === p.id);
  return (
    <Hub
      icon={<Avatar value={t.avatars[p.id]} userId={p.id} size={40} />}
      title={
        <>
          {p.bot ? "🤖 " : ""}
          {p.name}
        </>
      }
      sub={`${p.regions} region${p.regions === 1 ? "" : "s"} · ${p.cards} resource cards${p.heroes.length ? ` · ${p.heroes.map((h) => `${HEROES[h].icon} ${HEROES[h].name}`).join(", ")}` : ""}${thirstText(t, p.id)}`}
      tone="deal"
    >
      <p className="kird-badges">
        <span className="player-dot" style={{ background: p.color }} /> Their colour on the map
        {pact && <Badge kind="ok">🤝 You have a pact</Badge>}
        {p.oathbreaker && <Badge kind="bad">💔 Oathbreaker</Badge>}
        <Standing id={p.id} />
        {p.bot && <Badge kind="info">🤖 computer · {p.bot}</Badge>}
      </p>
      {p.sentence && (
        <p className="small sanction-note">
          ☠️ Convicted war criminal: {sanctionLabels(p.sentence.sanctions)} for {p.sentence.turnsLeft} more turn{p.sentence.turnsLeft === 1 ? "" : "s"}.
          Attacking them is no crime until then.
        </p>
      )}
      <Group title="What do you want to do with them?">
        {pact ? (
          <Choice icon="💔" title="Break your pact" sub="Then you can attack them. You'd be an Oathbreaker for 3 rounds: half PandaCoin." onClick={() => t.go({ step: "breakReview", with: p.id })} />
        ) : pactOffered ? (
          <Choice icon="📨" title="They've offered you a pact" badge={<Badge kind="warn">answer it</Badge>} sub="Accept or decline." onClick={() => t.go({ step: "offer", offerId: pactOffered.id })} />
        ) : pactSent ? (
          <Choice icon="🤝" title="Your pact offer is on the table" sub="Waiting for their answer." disabled />
        ) : (
          <Choice icon="🤝" title="Offer a pact" sub="Neither of you can invade the other while it lasts." onClick={() => t.go({ step: "pactReview", with: p.id })} />
        )}
        <Choice
          icon="💱"
          title="Propose a trade"
          badge={tradeBar(t, p.id) ? <Badge kind="off">🏦 sanctions</Badge> : null}
          sub={tradeBar(t, p.id) ?? "Pick what you give and what you want back."}
          disabled={Boolean(tradeBar(t, p.id))}
          onClick={() => t.go({ step: "tradeDeal", to: p.id })}
        />
        <Choice icon="🐼" title="Loan them pandas" sub="You both earn 1 🐼 PandaCoin per loaned panda every turn, and it seals a pact." onClick={() => t.go({ step: "loanDeal", to: p.id })} />
        {josser && !pact && <Choice icon="🃏" title="Pick their pocket" sub="The Josserkid steals 1 random resource." onClick={() => t.go({ step: "pickpocketReview", target: p.id })} />}
        <Choice icon="💬" title="Message them" sub="A private chat only the two of you can read." onClick={() => t.openChat(p.id)} />
      </Group>
      {land.length > 0 && (
        <Group title="🗺️ Their land you can see">
          <div className="dest-list">
            {land.map((r) => (
              <button key={r.id} type="button" className="chip" onClick={() => t.showRegion(r.id)}>
                📍 {t.name(r.id)}
              </button>
            ))}
          </div>
        </Group>
      )}
    </Hub>
  );
}

export function PactReview({ page }: { page: PageOf<"pactReview"> }) {
  const t = useTurn();
  const who = nameOf(t, page.with);
  const pending = t.view.offers.some((o) => o.kind === "pact" && ((o.from === t.view.me && o.to === page.with) || (o.from === page.with && o.to === t.view.me)));
  return (
    <Frame page={page} question={`Offer ${who} a pact?`}>
      <Review
        title={
          <>
            🤝 Offer <strong>{who}</strong> a non-aggression pact
          </>
        }
        blocked={atPeace(t.view, page.with) ? "You already have a pact." : pending ? "A pact offer is already on the table." : null}
        label="🤝 Send the offer"
        onGo={() => t.run({ type: "offerPact", to: page.with })}
      >
        <p className="small">If they accept, neither of you can invade the other. Everyone will see the offer.</p>
      </Review>
    </Frame>
  );
}

export function BreakReview({ page }: { page: PageOf<"breakReview"> }) {
  const t = useTurn();
  const who = nameOf(t, page.with);
  const loans = t.view.loans.filter((l) => (l.from === t.view.me && l.to === page.with) || (l.from === page.with && l.to === t.view.me));
  return (
    <Frame page={page} question={`Break your pact with ${who}?`}>
      <Review
        title={
          <>
            💔 Break your pact with <strong>{who}</strong>
          </>
        }
        danger
        blocked={atPeace(t.view, page.with) ? null : "You don't have a pact with them."}
        label="💔 Break the pact"
        onGo={() => t.run({ type: "breakPact", with: page.with })}
      >
        <ul className="review-list">
          <li>You can attack each other again.</li>
          <li>You become an Oathbreaker for 3 rounds: half PandaCoin, and everyone is told.</li>
          {loans.length > 0 && <li>Your panda loans with them end (the pandas stay where they are).</li>}
        </ul>
      </Review>
    </Frame>
  );
}

export function TradeDeal({ page }: { page: PageOf<"tradeDeal"> }) {
  const t = useTurn();
  const me = meIn(t.view);
  const [give, setGive] = useState<Cost>(page.give ?? {});
  const [get, setGet] = useState<Cost>(page.get ?? {});
  const some = (c: Cost) => Object.values(c).some((n) => (n ?? 0) > 0);
  return (
    <Frame page={page} question={`What's the deal with ${nameOf(t, page.to)}?`} help="Pick what you'd give and what you want back. Nothing changes hands until they accept.">
      <div className="trade-cols">
        <div>
          <p className="small">
            <strong>You give</strong>
          </p>
          {GOODS.map((g) => (
            <label key={g} className="trade-line">
              <span title={GOOD_INFO[g].label}>
                {GOOD_INFO[g].icon} <span className="muted small">({me.goods?.[g] ?? 0})</span>
              </span>
              <Stepper value={give[g] ?? 0} max={me.goods?.[g] ?? 0} onChange={(n) => setGive({ ...give, [g]: n })} label={`${GOOD_INFO[g].label} to give`} />
            </label>
          ))}
        </div>
        <div>
          <p className="small">
            <strong>You get</strong>
          </p>
          {GOODS.map((g) => (
            <label key={g} className="trade-line">
              <span title={GOOD_INFO[g].label}>{GOOD_INFO[g].icon}</span>
              <Stepper value={get[g] ?? 0} max={20} onChange={(n) => setGet({ ...get, [g]: n })} label={`${GOOD_INFO[g].label} to get`} />
            </label>
          ))}
        </div>
      </div>
      <button type="button" className="btn next" disabled={!some(give) && !some(get)} onClick={() => t.go({ step: "tradeReview", to: page.to, give, get }, { ...page, give, get })}>
        Next: check the offer →
      </button>
    </Frame>
  );
}

export function TradeReview({ page }: { page: PageOf<"tradeReview"> }) {
  const t = useTurn();
  const who = nameOf(t, page.to);
  return (
    <Frame page={page} question={`Send ${who} this offer?`}>
      <Review title={<>💱 Offer <strong>{who}</strong> a trade</>} blocked={tradeBar(t, page.to) ?? (affordable(page.give, meIn(t.view).goods) ? null : "You don't have what you're offering any more.")} label="📨 Send the offer" onGo={() => t.run({ type: "offerTrade", to: page.to, give: page.give, get: page.get })}>
        <dl className="review-facts">
          <div>
            <dt>You give</dt>
            <dd>
              <CostChips cost={page.give} />
            </dd>
          </div>
          <div>
            <dt>You get</dt>
            <dd>
              <CostChips cost={page.get} />
            </dd>
          </div>
        </dl>
        <p className="small">Only the two of you see it. Nothing changes hands until they accept.</p>
      </Review>
    </Frame>
  );
}

export function LoanDeal({ page }: { page: PageOf<"loanDeal"> }) {
  const t = useTurn();
  const places = frontFirst(
    t.view,
    myRegions(t.view)
      .filter((r) => restedIn(r).panda > 0)
      .map((r) => r.id),
  );
  const [from, setFrom] = useState(page.region && places.includes(page.region) ? page.region : places[0] ?? "");
  const avail = Math.min(10, from ? restedIn(regionIn(t.view, from)!).panda : 0);
  const [n, setN] = useState(page.count ?? 1);
  const count = Math.min(n, Math.max(1, avail));
  return (
    <Frame page={page} question={`Loan ${nameOf(t, page.to)} how many pandas?`} help="Pick where they come from and how many. They only leave if the offer is accepted.">
      {!places.length ? (
        <Empty>You have no rested pandas to loan right now.</Empty>
      ) : (
        <>
          <div className="choice-list">
            {places.map((id) => (
              <button key={id} type="button" className={`choice small${from === id ? " on" : ""}`} aria-pressed={from === id} onClick={() => setFrom(id)}>
                <span className="choice-icon" aria-hidden="true">
                  {from === id ? "✅" : "🏠"}
                </span>
                <span className="choice-body">
                  <span className="choice-title">{t.name(id)}</span>
                  <span className="choice-sub">{restedIn(regionIn(t.view, id)!).panda} rested 🐼</span>
                </span>
              </button>
            ))}
          </div>
          <div className="count-pick">
            <Stepper value={count} min={1} max={Math.max(1, avail)} onChange={setN} label="pandas to loan" />
            <span className="count-big" aria-hidden="true">
              {count} 🐼
            </span>
          </div>
          <button type="button" className="btn next" disabled={!from || avail < 1} onClick={() => t.go({ step: "loanReview", to: page.to, region: from, count }, { ...page, region: from, count })}>
            Next: check the loan →
          </button>
        </>
      )}
    </Frame>
  );
}

export function LoanReview({ page }: { page: PageOf<"loanReview"> }) {
  const t = useTurn();
  const who = nameOf(t, page.to);
  const r = regionIn(t.view, page.region);
  const ok = r?.owner === t.view.me && restedIn(r).panda >= page.count;
  return (
    <Frame page={page} question={`Offer ${who} the loan?`}>
      <Review
        title={
          <>
            🐼 Offer to loan <strong>{page.count}</strong> panda{page.count === 1 ? "" : "s"} from {t.name(page.region)} to <strong>{who}</strong>
          </>
        }
        blocked={ok ? null : `${t.name(page.region)} doesn't have ${page.count} rested pandas any more.`}
        label="📨 Send the offer"
        onGo={() => t.run({ type: "offerLoan", to: page.to, region: page.region, count: page.count })}
      >
        <ul className="review-list">
          <li>If they accept, the pandas move to their capital.</li>
          <li>You both earn 1 🐼 PandaCoin per loaned panda every turn.</li>
          <li>It comes with a pact: you can&rsquo;t attack each other.</li>
        </ul>
      </Review>
    </Frame>
  );
}
