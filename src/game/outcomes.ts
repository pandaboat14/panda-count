// What a move just did, in plain words: the result screen shown after every action in the turn menu.
// Built from the view before and after the move plus the events it made, so it reports what really happened.
import { describeUnits, emptyUnits, unitTotal, type Action, type BattleData, type GameEvent, type GameView, type Units } from "./engine";
import { placeName } from "./regions";
import { BUILDINGS, EXCHANGE, GOODS, GOOD_INFO, HEROES, UNITS, type Cost } from "./rules";

export type OutcomeTone = "win" | "loss" | "build" | "move" | "recruit" | "hero" | "deal" | "bank" | "info";

export type Outcome = {
  tone: OutcomeTone;
  icon: string;
  title: string;
  lines: string[];
  regions: string[]; // where it happened, to light up on the map
  burst?: string; // a few words that float up from the map
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const unitsAt = (v: GameView, id: string): Units => ({ ...emptyUnits(), ...v.regions.find((r) => r.id === id)?.units });

// What your goods went down and up by.
export function goodsDelta(before: GameView, after: GameView) {
  const was: Cost = before.players.find((p) => p.id === before.me)?.goods ?? {};
  const now: Cost = after.players.find((p) => p.id === after.me)?.goods ?? {};
  const spent: Cost = {};
  const gained: Cost = {};
  for (const g of GOODS) {
    const d = (now[g] ?? 0) - (was[g] ?? 0);
    if (d < 0) spent[g] = -d;
    if (d > 0) gained[g] = d;
  }
  return { spent, gained };
}

export function describeOutcome(action: Action, before: GameView, after: GameView, events: GameEvent[]): Outcome {
  // What a region is called now (a conqueror may have renamed it).
  const place = (id: string) => placeName(id, (after.regions.find((r) => r.id === id) ?? before.regions.find((r) => r.id === id))?.name);
  const who = (id: string | null | undefined) => after.players.find((p) => p.id === id)?.name ?? before.players.find((p) => p.id === id)?.name ?? "someone";
  const mine = events.filter((e) => e.actor === after.me);
  const heroNews = events.filter((e) => e.type === "heroCaptured" || e.type === "heroFled").map((e) => e.text);
  const fallback = (tone: OutcomeTone, icon: string): Outcome => ({ tone, icon, title: mine[0]?.text ?? "Done.", lines: [], regions: mine[0]?.regions ?? [] });

  switch (action.type) {
    case "build": {
      const b = BUILDINGS[action.building];
      // No burst: the building rises out of the globe with its own caption.
      return { tone: "build", icon: b.icon, title: `${b.label} built in ${place(action.region)}!`, lines: [b.blurb], regions: [action.region] };
    }
    case "gondola": {
      const other = after.regions.find((r) => r.id === action.to);
      const enemy = other && other.owner !== after.me;
      return {
        tone: "build",
        icon: "🚡",
        title: `Gondola line open: ${place(action.from)} ⇄ ${place(action.to)}`,
        lines: enemy
          ? ["Your troops can ride it, starting now: one line a turn.", `${place(action.to)} isn't yours, so this line is your way to attack it.`]
          : ["Your troops and heroes can ride it both ways, starting now. Troops ride one line a turn."],
        regions: [action.from, action.to],
        burst: "🚡 Line open!",
      };
    }
    case "recruit": {
      const u = UNITS[action.unit];
      return {
        tone: "recruit",
        icon: u.icon,
        title: `${plural(action.count, u.label, u.plural)} recruited in ${place(action.region)}!`,
        lines: [`${place(action.region)} now has ${describeUnits(unitsAt(after, action.region))}.`, "New troops rest this turn: they can move or attack on your next turn."],
        regions: [action.region],
        burst: `+${action.count} ${u.icon}`,
      };
    }
    case "arm":
      return {
        tone: "recruit",
        icon: UNITS.armedPanda.icon,
        title: `${plural(action.count, "panda", "pandas")} armed in ${place(action.region)}!`,
        lines: [`Armed pandas attack +${UNITS.armedPanda.attack} and defend +${UNITS.armedPanda.defense}.`, `${place(action.region)} now has ${describeUnits(unitsAt(after, action.region))}.`],
        regions: [action.region],
        burst: `+${action.count} 🛡️`,
      };
    case "move": {
      const fight = mine.find((e) => e.type === "battle");
      if (fight?.data) {
        const d = fight.data as unknown as BattleData;
        if (d.won) {
          const held = unitsAt(after, d.to);
          return {
            tone: "win",
            icon: "🏆",
            title: `${place(d.to)} is yours!`,
            lines: [
              `You beat ${d.defenderName}. You lost ${describeUnits(d.attackerLost) || "nobody"}; they lost ${describeUnits(d.defenderLost) || "nobody"}.`,
              `${plural(unitTotal(held), "survivor holds", "survivors hold")} ${place(d.to)} now. They rest until your next turn.`,
              ...heroNews,
            ],
            regions: [d.from, d.to],
            burst: "⚔️ Captured!",
          };
        }
        return {
          tone: "loss",
          icon: "💀",
          title: `The attack on ${place(d.to)} failed`,
          lines: [
            `${capital(d.defenderName)} held the line. Every attacker fell (${describeUnits(d.attacker)}).`,
            `They lost ${describeUnits(d.defenderLost) || "nobody"}, and ${place(d.to)} still holds ${describeUnits(unitsAt(after, d.to)) || "nobody"}.`,
          ],
          regions: [d.from, d.to],
          burst: "🛡️ Held",
        };
      }
      if (mine.some((e) => e.type === "capture")) {
        return {
          tone: "win",
          icon: "🏳️",
          title: `You claimed ${place(action.to)}!`,
          lines: ["Nobody was defending it, so your troops walked straight in.", "They rest there until your next turn.", ...heroNews],
          regions: [action.from, action.to],
          burst: "🏳️ Claimed!",
        };
      }
      const sent = { ...emptyUnits(), ...action.units };
      const piecer = before.heroes.piecer.owner === before.me && before.heroes.piecer.region === action.from;
      return {
        tone: "move",
        icon: "🚡",
        title: `${describeUnits(sent)} arrived in ${place(action.to)}`,
        lines: [
          `${place(action.from)} now has ${describeUnits(unitsAt(after, action.from)) || "nobody"}; ${place(action.to)} has ${describeUnits(unitsAt(after, action.to))}.`,
          piecer ? "The Piecer Captain sent them on: they can ride one more line this turn." : "They rest there until your next turn.",
        ],
        regions: [action.from, action.to],
        burst: `+${unitTotal(sent)} 🚡`,
      };
    }
    case "recruitHero": {
      const h = HEROES[action.hero];
      return { tone: "hero", icon: h.icon, title: `${h.name} joins you in ${place(action.region)}!`, lines: [h.power], regions: [action.region], burst: `${h.icon} ${h.name}!` };
    }
    case "moveHero": {
      const h = HEROES[action.hero];
      return {
        tone: "hero",
        icon: h.icon,
        title: `${h.name} rode to ${place(action.to)}`,
        lines: [`Battles fought from or in ${place(action.to)} now get his +${h.combatBonus}. Heroes move once a turn.`],
        regions: [before.heroes[action.hero].region ?? action.to, action.to],
        burst: `${h.icon} Arrived`,
      };
    }
    case "thunder": {
      const e = mine.find((x) => x.type === "thunder");
      const killed = (e?.data?.killed ?? {}) as Partial<Units>;
      const me = after.players.find((p) => p.id === after.me);
      return {
        tone: "win",
        icon: "⚡",
        title: `Thunder struck ${place(action.target)}!`,
        lines: [`Casey destroyed ${describeUnits(killed) || "nothing but grass"}.`, ...(me?.thunderReadyTurn ? [`He can strike again from turn ${me.thunderReadyTurn}.`] : [])],
        regions: [action.target],
        burst: "⚡ Smite!",
      };
    }
    case "pickpocket":
      return { ...fallback("hero", "🃏"), title: mine.find((e) => e.type === "pickpocket")?.text.replace(/^🃏 /u, "") ?? "The Josserkid struck.", lines: ["He can pick one pocket a turn."] };
    case "offerTrade":
    case "offerPact":
    case "offerLoan": {
      const bot = after.players.find((p) => p.id === action.to)?.bot;
      const what = action.type === "offerPact" ? "a non-aggression pact" : action.type === "offerLoan" ? `a loan of ${plural(action.count, "panda", "pandas")}` : "a trade";
      return {
        tone: "deal",
        icon: "📨",
        title: `You offered ${who(action.to)} ${what}`,
        lines: [bot ? "Computer players answer at the start of their turn." : "They can answer on their turn. You'll see it in the log.", "You can withdraw it from Diplomacy until then."],
        regions: [],
      };
    }
    case "respond": {
      const e = events.find((x) => ["trade", "pact", "loan", "decline"].includes(x.type));
      return { tone: "deal", icon: action.accept ? "🤝" : "✋", title: e?.text ?? (action.accept ? "Deal done." : "Offer declined."), lines: [], regions: e?.regions ?? [] };
    }
    case "cancelOffer":
      return { tone: "deal", icon: "↩️", title: "Offer withdrawn", lines: ["It's off the table."], regions: [] };
    case "breakPact":
      return {
        tone: "loss",
        icon: "💔",
        title: `You broke your pact with ${who(action.with)}`,
        lines: ["You're an Oathbreaker for 3 rounds: half PandaCoin, and everyone knows.", "Any panda loans between you are over. You can attack them now."],
        regions: [],
      };
    case "buy":
      return {
        tone: "bank",
        icon: "🛒",
        title: `Bought ${action.count} ${GOOD_INFO[action.good].icon} ${GOOD_INFO[action.good].label}`,
        lines: [`Paid ${action.count * before.prices.buyPrice} 🪙 at the World Bank.`],
        regions: [],
      };
    case "bankTrade":
      return { tone: "bank", icon: "🔁", title: `Swapped ${before.prices.bankRate} ${GOOD_INFO[action.give].icon} for 1 ${GOOD_INFO[action.get].icon}`, lines: [], regions: [] };
    case "exchange": {
      const x = EXCHANGE.find((e) => e.from === action.from && e.to === action.to);
      const title = x ? `Exchanged ${x.pay} ${GOOD_INFO[x.from].icon} for ${x.get} ${GOOD_INFO[x.to].icon}` : "Exchanged";
      return { tone: "bank", icon: "💱", title, lines: [], regions: [] };
    }
    default:
      return fallback("info", "✅");
  }
}
