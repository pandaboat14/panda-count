// The in-game advisor: a few concrete next moves for the player whose turn it is, worked out only
// from what that player can see (their GameView), so it never leaks anything hidden by the fog.
import { emptyUnits, unitTotal, type Action, type GameView, type RegionView, type Units } from "./engine";
import { attackOdds } from "./odds";
import { NEIGHBORS, REGION_BY_ID, lineId } from "./regions";
import { BUILDINGS, GOODS, GOOD_INFO, RAID_THRESHOLD, RESOURCES, UNIT_TYPES, type Cost, type Good } from "./rules";

export type Suggestion = {
  id: string;
  icon: string;
  title: string;
  detail?: string;
  // One tap does it (after buying any missing resources, if `cost` is set).
  action?: Action;
  cost?: Cost;
  // Or, for choices that need a closer look, point the player at a region / attack.
  focus?: string;
  plan?: { from: string; to: string };
  tab?: "diplomacy" | "bank";
};

const name = (id: string) => REGION_BY_ID.get(id)?.name ?? id;

function restedOf(r: RegionView): Units {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) u[t] = Math.max(0, (r.units?.[t] ?? 0) - (r.tired?.[t] ?? 0));
  return u;
}

// Leave one unit home when everyone there is fit to go.
function sendable(r: RegionView): Units {
  const send = restedOf(r);
  if (unitTotal(send) > 1 && unitTotal(send) === unitTotal({ ...emptyUnits(), ...r.units })) {
    const keep = (["panda", "armedPanda", "nacam", "cam"] as const).find((t) => send[t] > 0)!;
    send[keep] -= 1;
  }
  return send;
}

const has = (goods: Partial<Record<Good, number>>, c: Cost) => GOODS.every((g) => (goods[g] ?? 0) >= (c[g] ?? 0));

// What buying the missing resources would cost in Coin, or null if Coin can't cover it.
export function fillCost(goods: Partial<Record<Good, number>>, cost: Cost, price: number): { buy: Cost; coin: number } | null {
  const buy: Cost = {};
  let coin = 0;
  for (const g of RESOURCES) {
    const short = (cost[g] ?? 0) - (goods[g] ?? 0);
    if (short > 0) {
      buy[g] = short;
      coin += short * price;
    }
  }
  for (const g of ["pandaCoin", "camCoin"] as const) if ((goods[g] ?? 0) < (cost[g] ?? 0)) return null;
  if ((goods.coin ?? 0) < coin + (cost.coin ?? 0)) return null;
  return { buy, coin };
}

export function costLabel(c: Cost) {
  return GOODS.filter((g) => (c[g] ?? 0) > 0)
    .map((g) => `${c[g]} ${GOOD_INFO[g].icon}`)
    .join(" ");
}

export function advise(view: GameView): Suggestion[] {
  const me = view.players.find((p) => p.id === view.me);
  const active = view.players.find((p) => p.seat === view.activeSeat);
  if (!me || !me.goods || active?.id !== view.me || view.winner) return [];
  const goods = me.goods;
  const price = view.prices.buyPrice;
  const mine = view.regions.filter((r) => r.owner === view.me);
  const byId = new Map(view.regions.map((r) => [r.id, r]));
  const pact = (pid?: string | null) => Boolean(pid) && view.pacts.some((p) => (p.a === view.me && p.b === pid) || (p.b === view.me && p.a === pid));
  const lineOk = (a: string, b: string) => {
    const l = view.lines.find((x) => x.id === lineId(a, b));
    return Boolean(l) && (l!.owner === view.me || (byId.get(a)?.owner === view.me && byId.get(b)?.owner === view.me));
  };
  const strike = view.modifiers.some((m) => m.kind === "gondolaStrike");
  const out: Suggestion[] = [];

  const offers = view.offers.filter((o) => o.to === view.me);
  if (offers.length) {
    out.push({ id: "offers", icon: "📨", title: `${offers.length} offer${offers.length === 1 ? "" : "s"} waiting for your answer`, detail: "Trades, pacts and panda loans from other Kirds.", tab: "diplomacy" });
  }

  // Fights worth picking, best first.
  type Fight = { from: string; to: string; send: Units; win: number; lose: number; value: number; line: boolean };
  const fights: Fight[] = [];
  for (const r of mine) {
    const send = sendable(r);
    if (!unitTotal(send)) continue;
    for (const n of NEIGHBORS.get(r.id) ?? []) {
      const t = byId.get(n);
      if (!t || t.owner === view.me || t.fog || pact(t.owner)) continue;
      // Fewer simulations than the attack preview: enough to rank options, cheap on phones.
      const odds = attackOdds(view, r.id, n, send, 120);
      if (!odds) continue;
      const hot = t.token === 6 || t.token === 8 ? 1 : t.token === 5 || t.token === 9 ? 0.5 : 0;
      const needed = RESOURCES.includes(REGION_BY_ID.get(n)!.resource) && !mine.some((m) => REGION_BY_ID.get(m.id)!.resource === REGION_BY_ID.get(n)!.resource) ? 0.6 : 0;
      fights.push({ from: r.id, to: n, send, win: odds.win, lose: odds.attackerLoss, value: odds.win * 3 + hot + needed + (t.owner ? 0.4 : 0), line: lineOk(r.id, n) });
    }
  }
  fights.sort((a, b) => b.value - a.value);

  const ready = fights.filter((f) => f.line && f.win >= 0.7).slice(0, 2);
  for (const f of ready) {
    out.push({
      id: `attack-${f.from}-${f.to}`,
      icon: "⚔️",
      title: `Invade ${name(f.to)} from ${name(f.from)}`,
      detail: `${Math.round(f.win * 100)}% chance to win${f.lose >= 0.5 ? `, losing about ${Math.round(f.lose)} unit${Math.round(f.lose) === 1 ? "" : "s"}` : ""}.`,
      plan: { from: f.from, to: f.to },
    });
  }

  // Next best: lay a gondola toward a fight we'd win, so the army can go (now or next turn).
  if (!strike) {
    const lineable = fights.find((f) => !f.line && f.win >= 0.6 && !view.lines.some((l) => l.id === lineId(f.from, f.to)));
    if (lineable) {
      const cost = view.prices.gondola;
      const affordable = has(goods, cost) || fillCost(goods, cost, price);
      if (affordable) {
        out.push({
          id: `line-${lineable.from}-${lineable.to}`,
          icon: "🚡",
          title: `Build a gondola from ${name(lineable.from)} to ${name(lineable.to)}`,
          detail: `Opens an attack with a ${Math.round(lineable.win * 100)}% chance to win. Costs ${costLabel(cost)}.`,
          action: { type: "gondola", from: lineable.from, to: lineable.to },
          cost,
        });
      }
    }
  }

  // Grow the army where it's needed most.
  const front = [...mine].sort(
    (a, b) =>
      (NEIGHBORS.get(b.id) ?? []).filter((n) => byId.get(n)?.owner !== view.me).length - (NEIGHBORS.get(a.id) ?? []).filter((n) => byId.get(n)?.owner !== view.me).length,
  )[0];
  if (front) {
    const one = view.prices.units.panda;
    let n = 0;
    while (n < 4 && has(goods, Object.fromEntries(Object.entries(one).map(([g, v]) => [g, (v ?? 0) * (n + 1)])) as Cost)) n++;
    const ogre = view.prices.units.nacam;
    if (n > 0) {
      out.push({
        id: "recruit",
        icon: "🐼",
        title: `Recruit ${n} panda${n === 1 ? "" : "s"} in ${name(front.id)}`,
        detail: "Your busiest border. New troops rest this turn and can fight next turn.",
        action: { type: "recruit", region: front.id, unit: "panda", count: n },
      });
    } else if (has(goods, ogre) && (goods.coin ?? 0) >= (ogre.coin ?? 0) + 3) {
      out.push({ id: "recruit-ogre", icon: "👹", title: `Hire a NACAM ogre in ${name(front.id)}`, detail: "Hits hard and quarries Stone. Costs 1 🪙 a turn in wages.", action: { type: "recruit", region: front.id, unit: "nacam", count: 1 } });
    }
  }

  // A Market pays for itself fast and makes the bank cheaper.
  const capital = mine.find((r) => r.id === me.capital) ?? mine[0];
  if (capital && !mine.some((r) => r.buildings?.includes("market")) && (has(goods, BUILDINGS.market.cost) || fillCost(goods, BUILDINGS.market.cost, price))) {
    out.push({
      id: "market",
      icon: "🏪",
      title: `Build a Market in ${name(capital.id)}`,
      detail: `+2 🪙 every turn, and the bank gets cheaper. Costs ${costLabel(BUILDINGS.market.cost)}.`,
      action: { type: "build", region: capital.id, building: "market" },
      cost: BUILDINGS.market.cost,
    });
  }

  const cards = RESOURCES.reduce((n, g) => n + (goods[g] ?? 0), 0);
  if (cards > RAID_THRESHOLD) {
    out.push({ id: "raid", icon: "🎲", title: `You're holding ${cards} resource cards`, detail: "If anyone rolls a 7, ogres raid everyone holding more than 9 and take half. Spend some.", tab: "bank" });
  }

  if (!out.length || (!ready.length && out.every((s) => s.id === "raid"))) {
    out.push({ id: "end", icon: "✅", title: "Nothing urgent. End your turn when you're ready", detail: "Resources and Coin come in at the start of your next turn.", action: { type: "endTurn" } });
  }
  return out.slice(0, 5);
}
