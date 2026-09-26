// A world event is drawn at the start of every round. Future seasons ("updates") add cards here:
// give them a higher `season` and bump the game's season to put them in the deck.
import type { GameState, Units } from "./engine";
import { placeName } from "./regions";
import { NATIVE_CAP } from "./rules";

export type ModifierKind = "blight" | "gondolaStrike" | "mercMarket" | "caseySale";

type Helpers = { rand: () => number; emptyUnits: () => Units };

export type WorldEvent = {
  id: string;
  title: string;
  season: number;
  apply: (s: GameState, h: Helpers) => string;
};

const name = (s: GameState, id: string) => placeName(id, s.regions[id]?.name);
const pickOne = <T>(h: Helpers, arr: T[]) => arr[Math.floor(h.rand() * arr.length)];
// Room left under a native nation's cap for one unit type.
const room = (native: string, unit: keyof Units, have: number) => Math.max(0, (NATIVE_CAP[native]?.[unit] ?? 0) - have);

export const WORLD_EVENTS: WorldEvent[] = [
  {
    id: "babyBoom",
    title: "Panda Baby Boom",
    season: 1,
    apply: (s) => {
      const lucky: string[] = [];
      for (const r of Object.values(s.regions)) {
        if (r.owner && r.buildings.includes("sanctuary")) {
          r.units.panda += 1;
          lucky.push(name(s, r.id));
        }
      }
      return lucky.length ? `a cub was born in every Kird-held sanctuary (${lucky.join(", ")}).` : "wild cubs everywhere, but no Kird has a sanctuary to take them in.";
    },
  },
  {
    id: "ogreUprising",
    title: "Ogre Uprising",
    season: 1,
    apply: (s) => {
      let n = 0;
      let held = 0;
      for (const r of Object.values(s.regions)) {
        if (r.owner || r.native !== "nacams") continue;
        held++;
        const add = Math.min(2, room("nacams", "nacam", r.units.nacam));
        if (add) {
          r.units.nacam += add;
          n++;
        }
      }
      if (!held) return "the ogres grumbled, but their nation has already fallen.";
      return n ? `the NACAM Ogre Nation grew uglier and angrier: more ogres in ${n} of its regions.` : "the ogres grumbled, but every ogre stronghold is already full.";
    },
  },
  {
    id: "pageant",
    title: "CAM Beauty Pageant",
    season: 1,
    apply: (s) => {
      const scores = s.players.map((p) => ({
        p,
        cams: Object.values(s.regions).filter((r) => r.owner === p.id).reduce((n, r) => n + r.units.cam, 0),
      }));
      const best = Math.max(0, ...scores.map((x) => x.cams));
      if (!best) return "nobody entered a CAM, so the judges went home.";
      const winners = scores.filter((x) => x.cams === best);
      for (const w of winners) w.p.goods.camCoin += 3;
      return `${winners.map((w) => w.p.name).join(" & ")} took the crown with ${best} CAM${best === 1 ? "" : "s"}: +3 💪 CamCoin.`;
    },
  },
  {
    id: "strike",
    title: "Gondola Strike",
    season: 1,
    apply: (s) => {
      s.modifiers.push({ kind: "gondolaStrike", untilRound: s.round });
      return "cable workers downed tools. No new gondola lines can be built this round (existing lines still run).";
    },
  },
  {
    id: "blight",
    title: "Bamboo Blight",
    season: 1,
    apply: (s) => {
      s.modifiers.push({ kind: "blight", untilRound: s.round });
      return "a fungus hit the bamboo. Bamboo regions produce nothing this round.";
    },
  },
  {
    id: "caseySighting",
    title: "Casey Sighting",
    season: 1,
    apply: (s) => {
      if (s.heroes.casey.owner) {
        const p = s.players.find((q) => q.id === s.heroes.casey.owner)!;
        p.goods.camCoin += 2;
        return `worshippers flocked to Casey. ${p.name} collects +2 💪 CamCoin in offerings.`;
      }
      s.modifiers.push({ kind: "caseySale", untilRound: s.round });
      return "Casey, the Norse God, was seen drinking mead in a bar. His price in the Hall of Heroes is 25% off this round.";
    },
  },
  {
    id: "summit",
    title: "Panda Diplomacy Summit",
    season: 1,
    apply: (s) => {
      const friends = new Set(s.loans.flatMap((l) => [l.from, l.to]));
      if (!friends.size) return "the summit was empty. Loan some pandas to be invited next time.";
      for (const p of s.players) if (friends.has(p.id)) p.goods.pandaCoin += 2;
      return `every Kird with a panda loan gets +2 🐼 PandaCoin (${s.players.filter((p) => friends.has(p.id)).map((p) => p.name).join(", ")}).`;
    },
  },
  {
    id: "goldRush",
    title: "Gold Rush",
    season: 1,
    apply: (s, h) => {
      // One region booms and a rich one dries up, so an endless game never drifts to all-6s-and-8s.
      const regions = Object.values(s.regions);
      const boom = pickOne(h, regions.filter((x) => x.token !== 6 && x.token !== 8));
      const rich = regions.filter((x) => (x.token === 6 || x.token === 8) && x !== boom);
      if (!boom || !rich.length) return "prospectors searched everywhere and found nothing new.";
      const bust = pickOne(h, rich);
      [boom.token, bust.token] = [bust.token, boom.token];
      return `prospectors struck it rich in ${name(s, boom.id)} (now ${boom.token}), while ${name(s, bust.id)} dried up (now ${bust.token}).`;
    },
  },
  {
    id: "migration",
    title: "Wild Panda Migration",
    season: 1,
    apply: (s, h) => {
      const empty = Object.values(s.regions).filter((r) => !r.owner && (r.native === "wild" || !r.native) && room("wild", "panda", r.units.panda) > 0);
      if (!empty.length) return "the pandas looked for somewhere free to live, and found the whole world taken.";
      const r = pickOne(h, empty);
      const add = Math.min(2, room("wild", "panda", r.units.panda));
      r.native = "wild";
      r.units.panda += add;
      return `${add} wild panda${add === 1 ? "" : "s"} wandered into ${name(s, r.id)}.`;
    },
  },
  {
    id: "mercMarket",
    title: "Mercenary Market",
    season: 1,
    apply: (s) => {
      s.modifiers.push({ kind: "mercMarket", untilRound: s.round });
      return "unemployed ogres flood the job boards. NACAMs cost 1 less 🪙 to hire this round.";
    },
  },
  {
    id: "camMigration",
    title: "CAM Spring Break",
    season: 1,
    apply: (s, h) => {
      const beaches = Object.values(s.regions).filter((r) => !r.owner && r.native === "cams" && room("cams", "cam", r.units.cam) > 0);
      if (!beaches.length) return "the CAMs had nowhere left to party.";
      const r = pickOne(h, beaches);
      const add = Math.min(2, room("cams", "cam", r.units.cam));
      r.units.cam += add;
      return `${add} more CAM${add === 1 ? "" : "s"} showed up to flex in ${name(s, r.id)}.`;
    },
  },
  {
    id: "harvest",
    title: "Bumper Harvest",
    season: 1,
    apply: (s) => {
      for (const p of s.players) p.goods.rice += 1;
      return "the rice paddies overflowed. Every Kird gets +1 🍚.";
    },
  },
];
