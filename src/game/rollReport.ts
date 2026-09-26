// Turns a start-of-turn roll into what the dice pop-up shows: the throw, what everyone collected, and
// which paying regions the viewer can actually see. Fog of war holds: a gain from a region the viewer
// can't see is never pinned on a region, it just comes "from the fog".
import type { GameEvent, GameView, IncomeData, RaidData, RollData } from "./engine";
import { REGION_BY_ID, type Resource } from "./regions";
import { RESOURCES, type Cost } from "./rules";

export type RollShow = {
  seq: number; // also seeds the throw, so every replay tumbles the same way
  turn: number;
  round: number;
  roller: string | null;
  roll: [number, number];
  total: number;
  got: Record<string, Cost> | null; // what each player collected (null: an older event with only its text)
  raided: Record<string, number> | null; // on a 7: cards each raided player lost (null: older event)
  blight: boolean;
  raid: RaidData | null; // exactly what the ogres took from the viewer
  income: IncomeData | null; // the viewer's own start-of-turn harvest and income (their own rolls only)
  incomeText: string | null; // the same, from an older event that only has its text
  lines: string[]; // what an older event's text said, shown when there's no data
};

// The latest roll (by `who`, or by anyone if null), as the viewer `me` sees it.
export function rollShow(events: GameEvent[], who: string | null, me: string): RollShow | null {
  const e = [...events].reverse().find((x) => x.type === "roll" && (who === null || x.actor === who) && Array.isArray(x.data?.roll));
  if (!e) return null;
  const data = e.data as RollData;
  const total = data.roll[0] + data.roll[1];
  // The private events that go with this roll: what the ogres took from you, and your own turn's income.
  const raidEvent = events.find((x) => x.type === "raid" && x.turn === e.turn && x.seq > e.seq && (x.only?.includes(me) ?? false));
  const incomeEvent = e.actor === me ? events.find((x) => x.type === "income" && x.actor === me && x.turn === e.turn) : undefined;
  return {
    seq: e.seq,
    turn: e.turn,
    round: e.round,
    roller: e.actor,
    roll: data.roll,
    total,
    got: total !== 7 && data.got ? data.got : null,
    raided: total === 7 && data.raided ? data.raided : null,
    blight: Boolean(data.blight),
    raid: (raidEvent?.data as RaidData | undefined) ?? null,
    income: (incomeEvent?.data as IncomeData | undefined) ?? null,
    incomeText: incomeEvent && !incomeEvent.data ? incomeEvent.text : null,
    lines: [e.text.replace(/^🎲 .*? rolled \d+[.:]?\s*/u, "")].filter(Boolean),
  };
}

// One resource the roll paid out, and the region it came from if the viewer can see it (null: the fog).
export type Payout = { player: string; resource: Resource; region: string | null };

// Every resource the roll handed out, in seat order. Each is matched to a region the viewer can see
// that has the rolled number and that resource and is held by that player; the rest came from the fog.
export function payouts(show: RollShow, view: GameView): Payout[] {
  if (!show.got) return [];
  const seat = new Map(view.players.map((p) => [p.id, p.seat]));
  const used = new Set<string>();
  const out: Payout[] = [];
  const players = Object.keys(show.got).sort((a, b) => (seat.get(a) ?? 99) - (seat.get(b) ?? 99));
  for (const player of players) {
    for (const resource of RESOURCES) {
      for (let i = 0; i < (show.got[player][resource] ?? 0); i++) {
        const r = view.regions.find(
          (x) => !x.fog && x.owner === player && x.token === show.total && !used.has(x.id) && REGION_BY_ID.get(x.id)?.resource === resource,
        );
        if (r) used.add(r.id);
        out.push({ player, resource, region: r?.id ?? null });
      }
    }
  }
  return out;
}

// Total resource cards in a bundle of goods.
export const cardCount = (c: Cost) => RESOURCES.reduce((n, g) => n + (c[g] ?? 0), 0);
