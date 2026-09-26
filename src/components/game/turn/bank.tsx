"use client";

// 🏦 The World Bank, step by step: buy resources with Coin, swap resources, or exchange currencies.

import { useState } from "react";
import type { Resource } from "@/game/regions";
import { BUILDINGS, BUILDING_TYPES, EXCHANGE, GOOD_INFO, RESOURCES, UNITS, UNIT_TYPES, type Cost } from "@/game/rules";
import type { PageOf } from "@/game/turnFlow";
import { afford, barred, meIn, type Afford } from "@/game/turnOptions";
import { CostChips, GoodsBar, Stepper } from "../bits";
import { SanctionNote } from "../panels";
import { Badge, Choice, Empty, Frame, Group, Hub, Review, useTurn } from "./kit";

const SHUT = "🏦 Trade sanctions: the World Bank won't serve a convicted war criminal.";

// Swaps and exchanges spend what you hold: buying the missing part first would make no sense.
const noBuying = (a: Afford): Afford => (a.status === "buy" ? { status: "no", short: a.buy } : a);

export function Bank() {
  const t = useTurn();
  const { buyPrice, bankRate } = t.view.prices;
  return (
    <Hub icon="🏦" title="World Bank" sub="Short on something? Buy it, swap for it, or change currencies." tone="bank">
      <GoodsBar goods={meIn(t.view).goods} />
      <SanctionNote view={t.view} sanction="trade">the World Bank won&rsquo;t serve a convicted war criminal</SanctionNote>
      <div className="choice-list">
        <Choice
          icon="🛒"
          title="Buy resources"
          sub={`Any resource for ${buyPrice} 🪙 each.${buyPrice > 2 ? " Owning a 🏪 Market makes it 2." : ""}`}
          disabled={barred(t.view, "trade")}
          onClick={() => t.go({ step: "buyWhat" })}
        />
        <Choice
          icon="🔁"
          title="Swap resources"
          sub={`Give ${bankRate} of one resource, get 1 of another.${bankRate > 3 ? " A 🏪 Market makes it 3, Ping makes it 2." : ""}`}
          disabled={barred(t.view, "trade")}
          onClick={() => t.go({ step: "swapGive" })}
        />
        <Choice
          icon="💱"
          title="Exchange currency"
          sub="Turn 🪙 Coin, 🐼 PandaCoin and 💪 CamCoin into each other."
          disabled={barred(t.view, "trade")}
          onClick={() => t.go({ step: "exchangePick" })}
        />
      </div>
      <Group title="📜 Price list">
        <ul className="price-list small">
          <li>
            🚡 Gondola line <CostChips cost={t.view.prices.gondola} />
          </li>
          {UNIT_TYPES.map((u) => (
            <li key={u}>
              {UNITS[u].icon} {u === "armedPanda" ? "Arm a panda" : UNITS[u].label} <CostChips cost={u === "armedPanda" ? UNITS.armedPanda.cost : t.view.prices.units[u]} />
            </li>
          ))}
          {BUILDING_TYPES.map((b) => (
            <li key={b}>
              {BUILDINGS[b].icon} {BUILDINGS[b].label} <CostChips cost={BUILDINGS[b].cost} />
            </li>
          ))}
        </ul>
      </Group>
    </Hub>
  );
}

export function BuyWhat({ page }: { page: PageOf<"buyWhat"> }) {
  const t = useTurn();
  const goods: Cost = meIn(t.view).goods ?? {};
  return (
    <Frame page={page} question="Which resource do you want?" help={`Each costs ${t.view.prices.buyPrice} 🪙. You have ${goods.coin ?? 0} 🪙.`}>
      <div className="choice-list">
        {RESOURCES.map((g) => (
          <Choice key={g} icon={GOOD_INFO[g].icon} title={GOOD_INFO[g].label} sub={`You have ${goods[g] ?? 0}`} onClick={() => t.go({ step: "buyCount", good: g })} />
        ))}
      </div>
    </Frame>
  );
}

export function BuyCount({ page }: { page: PageOf<"buyCount"> }) {
  const t = useTurn();
  const price = t.view.prices.buyPrice;
  const coin = meIn(t.view).goods?.coin ?? 0;
  const max = Math.min(20, Math.floor(coin / price));
  const [n, setN] = useState(page.count ?? 1);
  const count = Math.min(n, Math.max(1, max));
  const g = GOOD_INFO[page.good];
  return (
    <Frame page={page} question={`How much ${g.label}?`} help={`${price} 🪙 each. You have ${coin} 🪙.`}>
      {max < 1 ? (
        <Empty>You need at least {price} 🪙 to buy one.</Empty>
      ) : (
        <>
          <div className="count-pick">
            <Stepper value={count} min={1} max={max} onChange={setN} label={g.label} />
            <span className="count-big" aria-hidden="true">
              {count} {g.icon}
            </span>
            <span className="troop-quick">
              <button type="button" className="chip" onClick={() => setN(max)}>
                Max {max}
              </button>
            </span>
          </div>
          <p className="review-cost-inline">Costs {count * price} 🪙</p>
          <button type="button" className="btn next" onClick={() => t.go({ step: "buyReview", good: page.good, count }, { ...page, count })}>
            Next: check it →
          </button>
        </>
      )}
    </Frame>
  );
}

export function BuyReview({ page }: { page: PageOf<"buyReview"> }) {
  const t = useTurn();
  const cost = { coin: page.count * t.view.prices.buyPrice };
  const g = GOOD_INFO[page.good];
  return (
    <Frame page={page} question="Buy it?">
      <Review
        blocked={barred(t.view, "trade") ? SHUT : null}
        title={
          <>
            🛒 Buy <strong>{page.count}</strong> {g.icon} {g.label}
          </>
        }
        cost={cost}
        afford={afford(t.view, cost)}
        label={`🛒 Buy ${page.count} ${g.icon}`}
        onGo={() => t.run({ type: "buy", good: page.good, count: page.count })}
      />
    </Frame>
  );
}

export function SwapGive({ page }: { page: PageOf<"swapGive"> }) {
  const t = useTurn();
  const rate = t.view.prices.bankRate;
  const goods: Cost = meIn(t.view).goods ?? {};
  return (
    <Frame page={page} question="What will you give?" help={`The Bank takes ${rate} of one resource for 1 of another.`}>
      <div className="choice-list">
        {RESOURCES.map((g) => {
          const ok = (goods[g] ?? 0) >= rate;
          return (
            <Choice
              key={g}
              icon={GOOD_INFO[g].icon}
              title={`${rate} ${GOOD_INFO[g].label}`}
              sub={`You have ${goods[g] ?? 0}`}
              badge={ok ? null : <Badge kind="off">not enough</Badge>}
              disabled={!ok}
              onClick={() => t.go({ step: "swapGet", give: g })}
            />
          );
        })}
      </div>
    </Frame>
  );
}

export function SwapGet({ page }: { page: PageOf<"swapGet"> }) {
  const t = useTurn();
  const goods: Cost = meIn(t.view).goods ?? {};
  return (
    <Frame page={page} question="What do you want for it?">
      <div className="choice-list">
        {RESOURCES.filter((g) => g !== page.give).map((g) => (
          <Choice key={g} icon={GOOD_INFO[g].icon} title={`1 ${GOOD_INFO[g].label}`} sub={`You have ${goods[g] ?? 0}`} onClick={() => t.go({ step: "swapReview", give: page.give, get: g as Resource })} />
        ))}
      </div>
    </Frame>
  );
}

export function SwapReview({ page }: { page: PageOf<"swapReview"> }) {
  const t = useTurn();
  const rate = t.view.prices.bankRate;
  const cost = { [page.give]: rate };
  return (
    <Frame page={page} question="Make the swap?">
      <Review
        blocked={barred(t.view, "trade") ? SHUT : null}
        title={
          <>
            🔁 Swap {rate} {GOOD_INFO[page.give].icon} {GOOD_INFO[page.give].label} for 1 {GOOD_INFO[page.get].icon} {GOOD_INFO[page.get].label}
          </>
        }
        cost={cost}
        afford={noBuying(afford(t.view, cost))}
        label="🔁 Swap"
        onGo={() => t.run({ type: "bankTrade", give: page.give, get: page.get })}
      />
    </Frame>
  );
}

export function ExchangePick({ page }: { page: PageOf<"exchangePick"> }) {
  const t = useTurn();
  const goods: Cost = meIn(t.view).goods ?? {};
  return (
    <Frame page={page} question="Which exchange?" help="Fixed rates, any time on your turn.">
      <div className="choice-list">
        {EXCHANGE.map((x) => {
          const ok = (goods[x.from] ?? 0) >= x.pay;
          return (
            <Choice
              key={`${x.from}-${x.to}`}
              icon="💱"
              title={`${x.pay} ${GOOD_INFO[x.from].icon} → ${x.get} ${GOOD_INFO[x.to].icon}`}
              sub={`${GOOD_INFO[x.from].label} to ${GOOD_INFO[x.to].label} · you have ${goods[x.from] ?? 0} ${GOOD_INFO[x.from].icon}`}
              badge={ok ? null : <Badge kind="off">not enough</Badge>}
              disabled={!ok}
              onClick={() => t.go({ step: "exchangeReview", from: x.from, to: x.to })}
            />
          );
        })}
      </div>
    </Frame>
  );
}

export function ExchangeReview({ page }: { page: PageOf<"exchangeReview"> }) {
  const t = useTurn();
  const x = EXCHANGE.find((e) => e.from === page.from && e.to === page.to)!;
  const cost = { [x.from]: x.pay };
  return (
    <Frame page={page} question="Make the exchange?">
      <Review
        blocked={barred(t.view, "trade") ? SHUT : null}
        title={
          <>
            💱 Exchange {x.pay} {GOOD_INFO[x.from].icon} {GOOD_INFO[x.from].label} for {x.get} {GOOD_INFO[x.to].icon} {GOOD_INFO[x.to].label}
          </>
        }
        cost={cost}
        afford={noBuying(afford(t.view, cost))}
        label="💱 Exchange"
        onGo={() => t.run({ type: "exchange", from: page.from, to: page.to })}
      />
    </Frame>
  );
}
