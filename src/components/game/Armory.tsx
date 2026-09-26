"use client";

import { useState } from "react";
import { armySummary } from "@/game/army";
import { ITEMS, TYPES, UNITS as FIGHTERS, WEAPONS } from "@/game/battle/codex";
import type { ItemId, WeaponId } from "@/game/battle/types";
import type { GearCharge } from "@/game/engine";
import { ITEM_TIMES, bagCount, battlesLeft, carried, gearOffer, gearThatFits, itemsUsed, unlockedMove, type GearSlot } from "@/game/loadout";
import { GEAR_BATTLES, UNITS, UNIT_TYPES, type UnitType } from "@/game/rules";
import { sanctionedIn } from "@/game/tribunal";
import { CostChips, Stepper, times } from "./bits";
import { DoButton, SanctionNote, meOf, withToasts, type Ctx } from "./panels";

const SLOT_LABEL: Record<GearSlot, string> = { weapon: "Weapon", armor: "Armour" };
const gearName = (g: GearCharge) => `${WEAPONS[g.id].icon} ${WEAPONS[g.id].label}`;

// ---------------------------------------------------------------- the Bag

// Power-ups for battle, bought with resources and kept in one Bag for your whole empire.
export function BagShop({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const me = meOf(view);
  const bag = me.bag ?? {};
  const held = bagCount(bag);
  const embargo = sanctionedIn(view, view.me, "arms");
  const shop = withToasts(ctx);
  const [counts, setCounts] = useState<Partial<Record<ItemId, number>>>({});
  return (
    <section className="act kit" aria-labelledby="bag-h">
      <h3 id="bag-h">
        🎒 Your Bag <span className="muted small">· {held ? `${held} item${held === 1 ? "" : "s"}` : "empty"}</span>
      </h3>
      <p className="muted small">
        Power-ups for battle. The Bag comes along when you invade, and when you&rsquo;re invaded your troops may use some: as many as that
        region&rsquo;s 📜 Standing Orders allow.
      </p>
      <SanctionNote view={view} sanction="arms">war criminals can&rsquo;t buy Bag items</SanctionNote>
      {ITEM_TIMES.map((t) => (
        <div key={t.when} className="kit-group">
          <h4>
            {t.label} <span className="muted small">{t.hint}</span>
          </h4>
          <ul className="kit-list">
            {itemsUsed(t.when).map((id) => {
              const it = ITEMS[id];
              const n = counts[id] ?? 1;
              const cost = times(it.cost, n);
              const have = bag[id] ?? 0;
              return (
                <li key={id} className="kit-item">
                  <span className="kit-icon" aria-hidden="true">{it.icon}</span>
                  <div className="kit-main">
                    <p className="kit-name">
                      <strong>{it.label}</strong>
                      {have > 0 && <span className="badge have">{have} in your Bag</span>}
                    </p>
                    <p className="small">{it.text}</p>
                    {id === "caltrops" && <p className="muted small">Or lay them ahead of time in a region&rsquo;s 📜 Standing Orders.</p>}
                    <div className="kit-buy">
                      <Stepper value={n} min={1} max={20} onChange={(v) => setCounts({ ...counts, [id]: v })} label={`${it.label} to buy`} />
                      <DoButton ctx={shop} cost={cost} action={{ type: "buyItem", item: id, count: n }} disabled={embargo}>
                        Buy <CostChips cost={cost} have={me.goods} />
                      </DoButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- the Armory

// Gear for every unit of a type, one weapon and one piece of armour, plus a siege catapult for the whole army.
export function ArmoryShop({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const me = meOf(view);
  const armory = me.armory;
  const total = armySummary(view).total;
  const [unit, setUnit] = useState<UnitType>(() => UNIT_TYPES.find((t) => total[t] > 0) ?? "panda");
  const embargo = sanctionedIn(view, view.me, "arms");
  const shop = withToasts(ctx);
  const type = TYPES[FIGHTERS[unit].type];

  // One piece of gear: what it does, what it costs, and whether buying it fills the slot, swaps or renews it.
  const offer = (id: WeaponId, forUnit?: UnitType) => {
    const w = WEAPONS[id];
    const o = gearOffer(armory, id, forUnit);
    const move = unlockedMove(id);
    // The catapult only rolls out when you attack, so it counts invasions.
    const uses = w.slot === "army" ? "invasion" : "battle";
    const left = (n: number) => `${n} ${uses}${n === 1 ? "" : "s"} left`;
    const verb = o.kind === "buy" ? (w.slot === "army" ? "Build" : "Fit") : o.kind === "replace" ? "Swap in" : "Renew";
    return (
      <li key={id} className={`kit-item${o.kind === "renew" ? " on" : ""}`}>
        <span className="kit-icon" aria-hidden="true">{w.icon}</span>
        <div className="kit-main">
          <p className="kit-name">
            <strong>{w.label}</strong>
            {o.kind === "renew" && <span className="badge have">✓ {left(o.charges)}</span>}
          </p>
          <p className="small">{w.text}</p>
          {move && (
            <p className="muted small">
              <strong>{move.name}</strong>: {move.text}
            </p>
          )}
          <div className="kit-buy">
            {o.kind === "renew" && o.full ? (
              <span className="muted small">Good as new: nothing to renew yet.</span>
            ) : (
              <>
                <DoButton ctx={shop} cost={w.cost} action={{ type: "buyGear", item: id, ...(forUnit ? { unit: forUnit } : {}) }} disabled={embargo}>
                  {verb} <CostChips cost={w.cost} have={me.goods} />
                </DoButton>
                <span className="muted small">
                  {o.kind === "replace"
                    ? `Replaces the ${gearName(o.old)} (${battlesLeft(o.old.charges)}).`
                    : o.kind === "renew"
                      ? `Back to ${GEAR_BATTLES} ${uses}s.`
                      : `Lasts ${GEAR_BATTLES} ${uses}s.`}
                </span>
              </>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className="act kit" aria-labelledby="armory-h">
      <h3 id="armory-h">🛡️ Armory</h3>
      <p className="muted small">
        Gear for every unit of one type, wherever they are: one weapon and one piece of armour. Each battle that type fights, attacking or
        defending, uses up one of its {GEAR_BATTLES}. Then it breaks.
      </p>
      <SanctionNote view={view} sanction="arms">war criminals can&rsquo;t buy gear</SanctionNote>
      <div className="dest-list" role="group" aria-label="Whose gear">
        {UNIT_TYPES.map((t) => {
          const kit = (["weapon", "armor"] as const).map((s) => carried(armory, t, s)).filter((g): g is GearCharge => Boolean(g));
          return (
            <button key={t} type="button" aria-pressed={unit === t} className={`chip${unit === t ? " on" : ""}`} onClick={() => setUnit(t)}>
              {UNITS[t].icon} {UNITS[t].plural}
              {kit.length > 0 && (
                <>
                  <span aria-hidden="true">{kit.map((g) => WEAPONS[g.id].icon).join("")}</span>
                  <span className="sr-only">, carrying {kit.map((g) => WEAPONS[g.id].label).join(" and ")}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="kit-unit">
        <p className="kit-name">
          <strong>
            {UNITS[unit].icon} {UNITS[unit].plural}
          </strong>
          <span className="badge" title={type.why}>
            {type.icon} {type.label}
          </span>
          <span className="muted small">{total[unit] ? `${total[unit]} in your army` : "none in your army yet"}</span>
        </p>
        <dl className="kit-slots">
          {(["weapon", "armor"] as const).map((s) => {
            const g = carried(armory, unit, s);
            return (
              <div key={s}>
                <dt>{SLOT_LABEL[s]}</dt>
                <dd>{g ? `${gearName(g)} · ${battlesLeft(g.charges)}` : <span className="muted">nothing yet</span>}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      {(["weapon", "armor"] as const).map((s) => (
        <div key={s} className="kit-group">
          <h4>{s === "weapon" ? `Weapons ${UNITS[unit].plural} can carry` : `Armour ${UNITS[unit].plural} can wear`}</h4>
          <ul className="kit-list">{gearThatFits(unit, s).map((id) => offer(id, unit))}</ul>
        </div>
      ))}

      <div className="kit-group">
        <h4>
          For the whole army <span className="muted small">Only used when you attack.</span>
        </h4>
        <ul className="kit-list">{offer("catapult")}</ul>
      </div>
    </section>
  );
}
