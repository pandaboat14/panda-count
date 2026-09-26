// The turn menu's pages and how a click on the globe moves you through them. A click only counts as a
// choice when the current step asks you to pick a region (those regions glow); any other click just opens
// that region's page, so you can always hop from one of your regions to another.
import type { Action, GameEvent, GameView, Units } from "./engine";
import type { Resource } from "./regions";
import type { BuildingType, Cost, Currency, HeroId } from "./rules";
import {
  attackBar,
  attackSources,
  attackTargets,
  buildWhere,
  canChoose,
  heroMoves,
  lineSources,
  lineState,
  lineTargets,
  linesClosed,
  moveRoutes,
  moveSources,
  myRegions,
  recruitPlaces,
  thunderTargets,
  type RecruitKind,
} from "./turnOptions";

export type Page =
  | { step: "home" }
  | { step: "ideas" }
  | { step: "region"; id: string }
  | { step: "attackTarget"; from?: string }
  | { step: "attackFrom"; target: string }
  | { step: "attackLine"; target: string; from: string }
  | { step: "attackTroops"; target: string; from: string; units?: Units }
  | { step: "attackReview"; target: string; from: string; units: Units }
  | { step: "moveFrom" }
  | { step: "moveTo"; from: string }
  | { step: "moveLine"; from: string; to: string }
  | { step: "moveTroops"; from: string; to: string; units?: Units }
  | { step: "moveReview"; from: string; to: string; units: Units }
  | { step: "buildWhat" }
  | { step: "buildWhere"; building: BuildingType }
  | { step: "buildReview"; building: BuildingType; region: string }
  | { step: "lineFrom" }
  | { step: "lineTo"; from: string }
  | { step: "lineReview"; from: string; to: string }
  | { step: "recruitWhat"; region?: string }
  | { step: "recruitWhere"; unit: RecruitKind }
  | { step: "recruitCount"; unit: RecruitKind; region: string; count?: number }
  | { step: "recruitReview"; unit: RecruitKind; region: string; count: number }
  | { step: "heroes" }
  | { step: "hireWhere"; hero: HeroId }
  | { step: "hireReview"; hero: HeroId; region: string }
  | { step: "heroTo"; hero: HeroId }
  | { step: "heroReview"; hero: HeroId; to: string }
  | { step: "thunderTarget" }
  | { step: "thunderReview"; target: string }
  | { step: "pickpocketWho" }
  | { step: "pickpocketReview"; target: string }
  | { step: "diplomacy" }
  | { step: "offer"; offerId: string }
  | { step: "kird"; id: string }
  | { step: "pactReview"; with: string }
  | { step: "breakReview"; with: string }
  | { step: "tradeDeal"; to: string; give?: Cost; get?: Cost }
  | { step: "tradeReview"; to: string; give: Cost; get: Cost }
  | { step: "loanDeal"; to: string; region?: string; count?: number }
  | { step: "loanReview"; to: string; region: string; count: number }
  | { step: "bank" }
  | { step: "buyWhat" }
  | { step: "buyCount"; good: Resource; count?: number }
  | { step: "buyReview"; good: Resource; count: number }
  | { step: "swapGive" }
  | { step: "swapGet"; give: Resource }
  | { step: "swapReview"; give: Resource; get: Resource }
  | { step: "exchangePick" }
  | { step: "exchangeReview"; from: Currency; to: Currency }
  | { step: "end" }
  // The result of an action. The outcome is worked out when shown, from the view before and after it.
  | { step: "done"; action: Action; events: GameEvent[]; before: GameView };

export type Step = Page["step"];
export type PageOf<S extends Step> = Extract<Page, { step: S }>;

export type FlowId =
  | "attack"
  | "move"
  | "build"
  | "line"
  | "recruit"
  | "hire"
  | "heroMove"
  | "thunder"
  | "pickpocket"
  | "pact"
  | "breakPact"
  | "trade"
  | "loan"
  | "buy"
  | "swap"
  | "exchange";

export type Tone = "attack" | "move" | "build" | "recruit" | "hero" | "deal" | "bank" | "end";

// Each flow's name and steps, for the step-by-step header. `hub` is the menu page its first step lives on.
export const FLOWS: Record<FlowId, { icon: string; title: string; tone: Tone; steps: string[]; hub?: Step }> = {
  attack: { icon: "⚔️", title: "Attack", tone: "attack", steps: ["Target", "From", "Troops", "Confirm"] },
  move: { icon: "🚡", title: "Move troops", tone: "move", steps: ["From", "To", "Troops", "Confirm"] },
  build: { icon: "🏗️", title: "Build", tone: "build", steps: ["What", "Where", "Confirm"] },
  line: { icon: "🚡", title: "Build a gondola line", tone: "build", steps: ["What", "From", "To", "Confirm"], hub: "buildWhat" },
  recruit: { icon: "🪖", title: "Recruit", tone: "recruit", steps: ["Unit", "Where", "How many", "Confirm"] },
  hire: { icon: "🦸", title: "Hire a hero", tone: "hero", steps: ["Hero", "Where", "Confirm"], hub: "heroes" },
  heroMove: { icon: "🦸", title: "Move a hero", tone: "hero", steps: ["Hero", "Where to", "Confirm"], hub: "heroes" },
  thunder: { icon: "⚡", title: "Casey's thunder", tone: "attack", steps: ["Hero", "Target", "Confirm"], hub: "heroes" },
  pickpocket: { icon: "🃏", title: "Pickpocket", tone: "hero", steps: ["Hero", "Who", "Confirm"], hub: "heroes" },
  pact: { icon: "🤝", title: "Offer a pact", tone: "deal", steps: ["Kird", "Confirm"], hub: "kird" },
  breakPact: { icon: "💔", title: "Break a pact", tone: "attack", steps: ["Kird", "Confirm"], hub: "kird" },
  trade: { icon: "💱", title: "Propose a trade", tone: "deal", steps: ["Kird", "Deal", "Confirm"], hub: "kird" },
  loan: { icon: "🐼", title: "Loan pandas", tone: "deal", steps: ["Kird", "Pandas", "Confirm"], hub: "kird" },
  buy: { icon: "🛒", title: "Buy resources", tone: "bank", steps: ["What", "How many", "Confirm"] },
  swap: { icon: "🔁", title: "Swap resources", tone: "bank", steps: ["Give", "Get", "Confirm"] },
  exchange: { icon: "💱", title: "Exchange currency", tone: "bank", steps: ["Pick", "Confirm"] },
};

const PLACE: Partial<Record<Step, [FlowId, number]>> = {
  attackTarget: ["attack", 0],
  attackFrom: ["attack", 1],
  attackLine: ["attack", 1],
  attackTroops: ["attack", 2],
  attackReview: ["attack", 3],
  moveFrom: ["move", 0],
  moveTo: ["move", 1],
  moveLine: ["move", 1],
  moveTroops: ["move", 2],
  moveReview: ["move", 3],
  buildWhat: ["build", 0],
  buildWhere: ["build", 1],
  buildReview: ["build", 2],
  lineFrom: ["line", 1],
  lineTo: ["line", 2],
  lineReview: ["line", 3],
  recruitWhat: ["recruit", 0],
  recruitWhere: ["recruit", 1],
  recruitCount: ["recruit", 2],
  recruitReview: ["recruit", 3],
  hireWhere: ["hire", 1],
  hireReview: ["hire", 2],
  heroTo: ["heroMove", 1],
  heroReview: ["heroMove", 2],
  thunderTarget: ["thunder", 1],
  thunderReview: ["thunder", 2],
  pickpocketWho: ["pickpocket", 1],
  pickpocketReview: ["pickpocket", 2],
  pactReview: ["pact", 1],
  breakReview: ["breakPact", 1],
  tradeDeal: ["trade", 1],
  tradeReview: ["trade", 2],
  loanDeal: ["loan", 1],
  loanReview: ["loan", 2],
  buyWhat: ["buy", 0],
  buyCount: ["buy", 1],
  buyReview: ["buy", 2],
  swapGive: ["swap", 0],
  swapGet: ["swap", 1],
  swapReview: ["swap", 2],
  exchangePick: ["exchange", 0],
  exchangeReview: ["exchange", 1],
};

// Which flow a page belongs to and which of its steps it is (menu pages like home belong to none).
export function placeOf(page: Page): { flow: FlowId; index: number } | null {
  const p = PLACE[page.step];
  return p ? { flow: p[0], index: p[1] } : null;
}

// Pages you start actions from. After an action, "Back" returns to the last one of these.
const HUBS = new Set<Step>(["home", "ideas", "region", "heroes", "diplomacy", "kird", "bank"]);
export const isHub = (page: Page) => HUBS.has(page.step);

// The stack after an action succeeds: back to where you started it, then the result.
export function afterAction(stack: Page[], done: PageOf<"done">): Page[] {
  let hub = 0;
  stack.forEach((p, i) => {
    if (isHub(p)) hub = i;
  });
  return [...stack.slice(0, hub + 1), done];
}

// Where in the stack a finished step lives, so the step header can jump back to it (-1: not reachable).
export function stepIndexInStack(stack: Page[], flow: FlowId, index: number): number {
  for (let i = stack.length - 2; i >= 0; i--) {
    const p = placeOf(stack[i]);
    if (p?.flow === flow && p.index === index) return i;
    if (index === 0 && FLOWS[flow].hub === stack[i].step) return i;
    if (p?.flow !== flow) return -1;
  }
  return -1;
}

// Opening a region: replace a region page on top (so hopping between regions doesn't pile up), else push one.
export function openRegion(stack: Page[], id: string): Page[] {
  const top = stack.at(-1);
  if (top?.step === "region") return top.id === id ? stack : [...stack.slice(0, -1), { step: "region", id }];
  // A finished action's result makes way: Back from the region goes to where the action started.
  const base = top?.step === "done" ? stack.slice(0, -1) : stack;
  return [...base, { step: "region", id }];
}

// ---------------------------------------------------------------- choosing on the globe

// What picking a region at this step does, which the globe shows by the colour of its ring: one of your regions
// to act from or in ("source"), your land to send troops to ("move"), somewhere to invade ("attack"), somewhere a
// gondola line has to be built first ("build"), a thunder target, or a spot for the building you're placing.
export type ChoiceKind = "source" | "move" | "attack" | "build" | "thunder" | "site";

// The regions you can pick at this step, and what picking each one does. They glow on the globe.
export function choicesAt(page: Page, view: GameView): Map<string, ChoiceKind> {
  // Choices that need a new gondola line wait while lines can't be built.
  const strike = linesClosed(view);
  const all = (ids: string[], kind: ChoiceKind) => new Map(ids.map((id) => [id, kind]));
  switch (page.step) {
    case "attackTarget":
      return new Map(
        attackTargets(view, { from: page.from, odds: false })
          .filter((t) => canChoose(t.status, strike))
          .map((t) => [t.id, t.status === "ready" ? "attack" : "build"]),
      );
    case "attackFrom":
      if (attackBar(view, page.target)) return new Map();
      return new Map(
        attackSources(view, page.target, false)
          .filter((s) => canChoose(s.status, strike))
          .map((s) => [s.from, s.status === "ready" ? "source" : "build"]),
      );
    case "moveFrom":
      return new Map(
        moveSources(view)
          .filter((s) => canChoose(s.status, strike))
          .map((s) => [s.id, s.status === "ready" ? "source" : "build"]),
      );
    case "moveTo":
      return new Map(
        moveRoutes(view, page.from)
          .filter((r) => r.line === "ours" || !strike)
          .map((r) => [r.to, r.line === "ours" ? "move" : "build"]),
      );
    case "buildWhere":
      return all(buildWhere(view, page.building), "site");
    case "lineFrom":
      return all(linesClosed(view) ? [] : lineSources(view), "source");
    case "lineTo":
      return all(
        linesClosed(view) ? [] : lineTargets(view, page.from).map((r) => r.id),
        "build",
      );
    case "recruitWhere":
      return all(recruitPlaces(view, page.unit), "source");
    case "hireWhere":
      return all(
        myRegions(view).map((r) => r.id),
        "source",
      );
    case "heroTo":
      return all(heroMoves(view, page.hero), "move");
    case "thunderTarget":
      return all(thunderTargets(view), "thunder");
    default:
      return new Map();
  }
}

export const pickable = (page: Page, view: GameView): string[] => [...choicesAt(page, view).keys()];

// Picking a region at this step: the next page, or null if that region isn't a choice here.
export function pick(page: Page, id: string, view: GameView): Page | null {
  if (!pickable(page, view).includes(id)) return null;
  switch (page.step) {
    case "attackTarget":
      return page.from ? attackNext(view, id, page.from) : { step: "attackFrom", target: id };
    case "attackFrom":
      return attackNext(view, page.target, id);
    case "moveFrom":
      return { step: "moveTo", from: id };
    case "moveTo":
      return lineState(view, page.from, id) === "ours" ? { step: "moveTroops", from: page.from, to: id } : { step: "moveLine", from: page.from, to: id };
    case "buildWhere":
      return { step: "buildReview", building: page.building, region: id };
    case "lineFrom":
      return { step: "lineTo", from: id };
    case "lineTo":
      return { step: "lineReview", from: page.from, to: id };
    case "recruitWhere":
      return { step: "recruitCount", unit: page.unit, region: id };
    case "hireWhere":
      return { step: "hireReview", hero: page.hero, region: id };
    case "heroTo":
      return { step: "heroReview", hero: page.hero, to: id };
    case "thunderTarget":
      return { step: "thunderReview", target: id };
    default:
      return null;
  }
}

// With a target and a region to attack from: pick troops, or build the missing gondola line first.
export function attackNext(view: GameView, target: string, from: string): Page {
  return lineState(view, from, target) === "ours" ? { step: "attackTroops", target, from } : { step: "attackLine", target, from };
}

// What the banner over the globe says while a step wants you to pick a region.
export function promptFor(page: Page): string | null {
  const text: Partial<Record<Step, string>> = {
    attackTarget: "Tap a glowing region to attack it",
    attackFrom: "Tap one of your glowing regions to attack from",
    moveFrom: "Tap one of your glowing regions to move troops out of",
    moveTo: "Tap a glowing region to send the troops to",
    buildWhere: "Tap one of your glowing regions to build there",
    lineFrom: "Tap one of your glowing regions to start the line",
    lineTo: "Tap a glowing neighbour to run the line to",
    recruitWhere: "Tap one of your glowing regions to recruit there",
    hireWhere: "Tap one of your glowing regions for the hero to arrive in",
    heroTo: "Tap a glowing region to send the hero there",
    thunderTarget: "Tap a glowing region for Casey to strike",
  };
  return text[page.step] ?? null;
}

// The plan drawn on the globe: an arrow for a move, attack or line, or a ring on one region.
export type Plan = { from?: string; to: string; tone: "battle" | "move" | "build" | "hero" };

export function planOf(page: Page, view: GameView): Plan | null {
  switch (page.step) {
    case "attackFrom":
      return { to: page.target, tone: "battle" };
    case "attackLine":
    case "attackTroops":
    case "attackReview":
      return { from: page.from, to: page.target, tone: "battle" };
    case "moveTo":
      return { to: page.from, tone: "move" };
    case "moveLine":
    case "moveTroops":
    case "moveReview":
      return { from: page.from, to: page.to, tone: "move" };
    case "buildReview":
      return { to: page.region, tone: "build" };
    case "lineTo":
      return { to: page.from, tone: "build" };
    case "lineReview":
      return { from: page.from, to: page.to, tone: "build" };
    case "recruitCount":
    case "recruitReview":
      return { to: page.region, tone: "build" };
    case "hireReview":
      return { to: page.region, tone: "hero" };
    case "heroTo":
      return view.heroes[page.hero].region ? { to: view.heroes[page.hero].region!, tone: "hero" } : null;
    case "heroReview":
      return { from: view.heroes[page.hero].region ?? undefined, to: page.to, tone: "hero" };
    case "thunderReview":
      return { to: page.target, tone: "battle" };
    default:
      return null;
  }
}
