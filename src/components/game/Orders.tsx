"use client";

import { useState } from "react";
import { DOCTRINES, ITEMS } from "@/game/battle/codex";
import type { PlayerDoctrineId } from "@/game/battle/types";
import { DEFAULT_DOCTRINE, PLAYER_DOCTRINES, type Action, type GameView, type RegionView } from "@/game/engine";
import { actualLead, bagCount, clampBudget, leadChoices, type LeadId } from "@/game/loadout";
import { DEFAULT_ITEM_BUDGET, HEROES, HERO_IDS, MAX_ITEM_BUDGET, UNITS, type HeroId } from "@/game/rules";
import { CostChips, Stepper } from "./bits";
import { DoButton, meOf, regionName, withToasts, type Ctx } from "./panels";

type OrdersPatch = Omit<Extract<Action, { type: "setOrders" }>, "type" | "region">;

const isHero = (id: LeadId): id is HeroId => (HERO_IDS as string[]).includes(id);
export const leadLabel = (id: LeadId) => (isHero(id) ? `${HEROES[id].icon} ${HEROES[id].name}` : `${UNITS[id].icon} ${UNITS[id].plural}`);
const goesFirst = (id: LeadId) => `${leadLabel(id)} ${isHero(id) ? "goes" : "go"} first`;
const items = (n: number) => `${n} item${n === 1 ? "" : "s"}`;

// A region's orders in one line: "🐢 Hold the Walls · 🐼 Pandas first · up to 2 items · 📌 caltrops".
export function ordersLine(view: GameView, region: RegionView) {
  const o = region.orders;
  if (!o) return "";
  const d = DOCTRINES[o.doctrine];
  const lead = actualLead(view, region);
  return [
    `${d.icon} ${d.label}`,
    lead && `${leadLabel(lead)} first`,
    o.budget ? `up to ${o.budget} item${o.budget === 1 ? "" : "s"}` : "no items",
    o.traps.includes("caltrops") && `${ITEMS.caltrops.icon} caltrops`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// The four ways a Kird's troops can fight without them, each with what it does.
export function DoctrinePicker({
  name,
  legend,
  value,
  yours,
  disabled,
  onPick,
}: {
  name: string;
  legend: string;
  value: PlayerDoctrineId;
  yours?: PlayerDoctrineId; // marks your default
  disabled?: boolean;
  onPick: (d: PlayerDoctrineId) => void;
}) {
  return (
    <fieldset className="doctrine-pick" disabled={disabled}>
      <legend className="small">
        <strong>{legend}</strong>
      </legend>
      {PLAYER_DOCTRINES.map((d) => (
        <label key={d} className={`doctrine-opt${value === d ? " on" : ""}`}>
          <input type="radio" name={name} checked={value === d} onChange={() => onPick(d)} />
          <span className="doctrine-icon" aria-hidden="true">
            {DOCTRINES[d].icon}
          </span>
          <span>
            <strong>{DOCTRINES[d].label}</strong>
            {d === yours && <span className="badge">your default</span>}
            <span className="muted small">{DOCTRINES[d].text}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// How one of your regions fights back while you're away: its doctrine, who meets invaders first, how many Bag items
// the defenders may use, and caltrops laid in advance.
export function StandingOrders({ ctx, region }: { ctx: Ctx; region: RegionView }) {
  const { view, myTurn, busy } = ctx;
  // A new item budget, picked but not given yet.
  const [budget, setBudget] = useState<number | null>(null);
  const o = region.orders;
  if (!o) return null;
  const me = meOf(view);
  const orders = withToasts(ctx);
  const give = (patch: OrdersPatch) => orders.act({ type: "setOrders", region: region.id, ...patch });
  const locked = !myTurn || busy;
  const yours = me.doctrine ?? DEFAULT_DOCTRINE;
  const choices = leadChoices(view, region);
  const first = actualLead(view, region);
  const picked = o.lead ? choices.find((c) => c.id === o.lead) : undefined;
  const draft = budget ?? o.budget;
  const inBag = bagCount(me.bag);
  const spare = me.bag?.caltrops ?? 0;
  const laid = o.traps.includes("caltrops");
  const caltrops = ITEMS.caltrops;

  const leadNote = !first
    ? "Nobody is here to meet them: an invader would just walk in."
    : !picked
      ? `${goesFirst(first)}, the usual order (pandas, armed pandas, ogres, CAMs, then heroes).`
      : !picked.here
        ? `${isHero(picked.id) ? `${HEROES[picked.id].name} isn't` : `No ${UNITS[picked.id].plural} are`} here right now, so ${goesFirst(first)}.`
        : picked.onStrike
          ? `${HEROES[picked.id as HeroId].name} is on strike, so ${goesFirst(first)}.`
          : `${goesFirst(first)}, and the rest follow in the usual order.`;

  return (
    <section className="act">
      <details className="orders">
        <summary>
          <strong>📜 Standing Orders</strong> <span className="muted small">{ordersLine(view, region)}</span>
        </summary>
        <p className="muted small">How the troops here fight back when someone invades while you&rsquo;re away.</p>

        <DoctrinePicker name={`doctrine-${region.id}`} legend="Doctrine" value={o.doctrine} yours={yours} disabled={locked} onPick={(d) => give({ doctrine: d })} />
        <p className="muted small">
          {o.doctrineSet ? (
            <>
              Set for {regionName(view, region.id)} only.{" "}
              {myTurn && (
                <button type="button" className="linkish" disabled={busy} onClick={() => give({ doctrine: null })}>
                  ↺ Follow your default ({DOCTRINES[yours].icon} {DOCTRINES[yours].label})
                </button>
              )}
            </>
          ) : (
            "Following your default doctrine. You can change the default in the ⚔️ Army tab."
          )}
        </p>

        <div className="orders-part">
          <p className="small">
            <strong>Lead squad</strong> <span className="muted">· who meets invaders first</span>
          </p>
          <div className="dest-list" role="radiogroup" aria-label="Lead squad">
            <button type="button" role="radio" aria-checked={!o.lead} className={`chip${!o.lead ? " on" : ""}`} disabled={locked} onClick={() => o.lead && give({ lead: null })}>
              Usual order
            </button>
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={o.lead === c.id}
                className={`chip${o.lead === c.id ? " on" : ""}`}
                disabled={locked}
                onClick={() => o.lead !== c.id && give({ lead: c.id })}
              >
                {leadLabel(c.id)}
                {!c.hero && c.here && <span className="n">{c.count}</span>}
              </button>
            ))}
          </div>
          <p className="muted small">{leadNote}</p>
        </div>

        <div className="orders-part">
          <p className="small">
            <strong>Item budget</strong> <span className="muted">· how many Bag items they may use here</span>
          </p>
          <div className="kit-buy">
            <Stepper value={draft} min={0} max={MAX_ITEM_BUDGET} onChange={(v) => setBudget(clampBudget(v))} label="Bag items allowed" disabled={!myTurn} />
            <button type="button" className="btn small" disabled={locked || draft === o.budget} onClick={async () => (await give({ budget: draft })) && setBudget(null)}>
              Save
            </button>
            <span className="muted small">{inBag ? `Your Bag holds ${items(inBag)}.` : "Your Bag is empty: stock it at the 🏦 Bank."}</span>
          </div>
        </div>

        <div className="orders-part">
          <p className="small">
            <strong>
              {caltrops.icon} {caltrops.label}
            </strong>{" "}
            <span className="muted">· every invading squad takes {caltrops.hazard} damage as it steps in</span>
          </p>
          {laid ? (
            <div className="kit-buy">
              <span className="small">✅ Laid. The next invasion springs them.</span>
              <button type="button" className="btn ghost small" disabled={locked} onClick={() => give({ traps: [] })}>
                Pick them up
              </button>
            </div>
          ) : (
            <div className="kit-buy">
              <DoButton ctx={orders} cost={spare ? {} : caltrops.cost} action={{ type: "setOrders", region: region.id, traps: ["caltrops"] }}>
                {spare ? (
                  `Lay a set from your Bag (${spare} there)`
                ) : (
                  <>
                    Lay them <CostChips cost={caltrops.cost} have={me.goods} />
                  </>
                )}
              </DoButton>
              <span className="muted small">Picked up again, they go back in your Bag.</span>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

// The Army tab's part: the doctrine every region follows unless told otherwise, and which regions were told otherwise.
export function DefaultOrders({ ctx, onManage }: { ctx: Ctx; onManage: (region: string) => void }) {
  const { view, myTurn, busy } = ctx;
  const me = meOf(view);
  const orders = withToasts(ctx);
  const own = view.regions.filter(
    (r) => r.owner === view.me && r.orders && (r.orders.doctrineSet || r.orders.lead || r.orders.traps.length > 0 || r.orders.budget !== DEFAULT_ITEM_BUDGET),
  );
  return (
    <section className="act">
      <h3>📜 Standing Orders</h3>
      <p className="muted small">
        While you&rsquo;re away, your troops fight invaders by their orders. Every region follows your default doctrine unless you give it
        one of its own in its panel. That&rsquo;s also where you pick who meets invaders first, how many Bag items they may use, and lay
        caltrops. Sun Tzu fights your way too when you hand him a battle.
      </p>
      <DoctrinePicker name="doctrine-default" legend="Your default doctrine" value={me.doctrine ?? DEFAULT_DOCTRINE} disabled={!myTurn || busy} onPick={(d) => orders.act({ type: "setOrders", doctrine: d })} />
      {own.length > 0 && (
        <>
          <p className="small">
            <strong>Regions with orders of their own</strong>
          </p>
          <ul className="orders-own">
            {own.map((r) => (
              <li key={r.id}>
                <button type="button" className="linkish" onClick={() => onManage(r.id)}>
                  {regionName(view, r.id)}
                </button>{" "}
                <span className="muted small">{ordersLine(view, r)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!myTurn && <p className="muted small">You can change your orders on your turn.</p>}
    </section>
  );
}
