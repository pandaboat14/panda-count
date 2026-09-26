// The Bag, the Armory and Standing Orders as one player sees them: what each slot can carry, what buying a piece of
// gear would do, who could lead a region's defence, and the item budget's limits. Pure, from the player's own view.
import type { Armory, GameView, GearCharge, RegionView } from "./engine";
import { DEFAULT_ITEM_BUDGET, GEAR_BATTLES, HERO_IDS, MAX_ITEM_BUDGET, UNIT_TYPES, type HeroId, type UnitType } from "./rules";
import { ITEMS, MOVE_BY_ID, WEAPONS } from "./battle/codex";
import type { Bag, ItemDef, ItemId, WeaponId } from "./battle/types";
import { sanctionedIn } from "./tribunal";

export type GearSlot = "weapon" | "armor";
export const GEAR_IDS = Object.keys(WEAPONS) as WeaponId[];
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

// ---------------------------------------------------------------- the Bag

// When an item can be used in a battle, in the order the Bank lists them.
export const ITEM_TIMES: { when: ItemDef["when"]; label: string; hint: string }[] = [
  { when: "action", label: "Instead of a move", hint: "Your squad spends its turn on it, and rolls just 1 die to hold the enemy off." },
  { when: "prep", label: "Before the roll", hint: "Free, on top of your move." },
  { when: "reaction", label: "After the roll", hint: "Free, once you've seen the dice." },
];

export const itemsUsed = (when: ItemDef["when"]) => ITEM_IDS.filter((id) => ITEMS[id].when === when);
export const bagCount = (bag: Bag | undefined) => ITEM_IDS.reduce((n, id) => n + (bag?.[id] ?? 0), 0);

// ---------------------------------------------------------------- the Armory

// The weapons (or armour) a unit type can carry, in the codex's order. The catapult belongs to the whole army.
export function gearThatFits(unit: UnitType, slot: GearSlot): WeaponId[] {
  return GEAR_IDS.filter((id) => WEAPONS[id].slot === slot && WEAPONS[id].fits.includes(unit));
}

// What a unit type carries in a slot now. Gear with no battles left has broken, so it isn't there.
export function carried(armory: Armory | undefined, unit: UnitType, slot: GearSlot): GearCharge | null {
  const c = armory?.units[unit]?.[slot];
  return c && c.charges > 0 ? c : null;
}
export function catapultOf(armory: Armory | undefined): GearCharge | null {
  const c = armory?.army;
  return c && c.charges > 0 ? c : null;
}

// What buying a piece of gear would do: fill an empty slot, replace what's there, or renew the same gear to a full
// GEAR_BATTLES battles (whatever was left of the old one is lost). `unit` is left out for the catapult.
export type GearOffer = { kind: "buy" } | { kind: "replace"; old: GearCharge } | { kind: "renew"; charges: number; full: boolean };
export function gearOffer(armory: Armory | undefined, item: WeaponId, unit?: UnitType): GearOffer {
  const slot = WEAPONS[item].slot;
  const now = slot === "army" ? catapultOf(armory) : unit ? carried(armory, unit, slot) : null;
  if (!now) return { kind: "buy" };
  if (now.id !== item) return { kind: "replace", old: now };
  return { kind: "renew", charges: now.charges, full: now.charges >= GEAR_BATTLES };
}

// The move a piece of gear unlocks, in the codex's words (the catapult's own line already says what it fires).
export function unlockedMove(item: WeaponId): { name: string; text: string } | null {
  const w = WEAPONS[item];
  const m = w.move ? MOVE_BY_ID[w.move] : undefined;
  return m && w.slot !== "army" ? { name: m.name, text: m.text } : null;
}

export const battlesLeft = (n: number) => `${n} battle${n === 1 ? "" : "s"} left`;

// ---------------------------------------------------------------- Standing Orders

// Any number into an item budget the orders accept: a whole number from 0 to MAX_ITEM_BUDGET.
export function clampBudget(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_ITEM_BUDGET;
  return Math.min(MAX_ITEM_BUDGET, Math.max(0, Math.round(n)));
}

export type LeadId = UnitType | HeroId;
export type LeadChoice = {
  id: LeadId;
  hero: boolean;
  count: number; // units of that type there (1 for a hero who's there)
  here: boolean; // there right now, so the order means something today
  onStrike: boolean; // a hero sitting battles out while the Tribunal's sentence lasts
};

const isHero = (id: string): id is HeroId => (HERO_IDS as string[]).includes(id);

// Who could meet invaders first in one of your regions: every unit type there, then your heroes there. A lead picked
// earlier who has since left stays on the list, marked as gone, so the order in force is never hidden.
export function leadChoices(view: GameView, region: RegionView): LeadChoice[] {
  const strike = sanctionedIn(view, view.me, "heroes");
  const out: LeadChoice[] = [];
  for (const t of UNIT_TYPES) {
    const n = region.units?.[t] ?? 0;
    if (n > 0) out.push({ id: t, hero: false, count: n, here: true, onStrike: false });
  }
  for (const h of HERO_IDS) {
    if (view.heroes[h].owner === view.me && view.heroes[h].region === region.id) out.push({ id: h, hero: true, count: 1, here: true, onStrike: strike });
  }
  const lead = region.orders?.lead;
  if (lead && !out.some((c) => c.id === lead)) out.push({ id: lead, hero: isHero(lead), count: 0, here: false, onStrike: isHero(lead) && strike });
  return out;
}

// Who meets invaders first when nobody is picked: the first squad in the usual order (pandas, armed pandas, ogres,
// CAMs, then heroes). The same order decides it when the picked lead isn't there, or can't fight.
export function usualLead(view: GameView, region: RegionView): LeadId | null {
  return leadChoices(view, region).find((c) => c.here && !c.onStrike)?.id ?? null;
}

// Who will really meet the invaders first under this region's orders.
export function actualLead(view: GameView, region: RegionView): LeadId | null {
  const lead = region.orders?.lead;
  const pick = lead ? leadChoices(view, region).find((c) => c.id === lead) : undefined;
  return pick && pick.here && !pick.onStrike ? pick.id : usualLead(view, region);
}
