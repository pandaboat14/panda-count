// Panda Diplomacy, Season 1: every number that balances the game lives here.
import type { Resource } from "./regions";

export const RESOURCES: Resource[] = ["bamboo", "stone", "iron", "rice", "gems"];
export type Currency = "coin" | "pandaCoin" | "camCoin";
export const CURRENCIES: Currency[] = ["coin", "pandaCoin", "camCoin"];
export type Good = Resource | Currency;
export const GOODS: Good[] = [...RESOURCES, ...CURRENCIES];

export const GOOD_INFO: Record<Good, { label: string; icon: string }> = {
  bamboo: { label: "Bamboo", icon: "🎋" },
  stone: { label: "Stone", icon: "🪨" },
  iron: { label: "Iron", icon: "⛓️" },
  rice: { label: "Rice", icon: "🍚" },
  gems: { label: "Gems", icon: "💎" },
  coin: { label: "Coin", icon: "🪙" },
  pandaCoin: { label: "PandaCoin", icon: "🐼" },
  camCoin: { label: "CamCoin", icon: "💪" },
};

export type Cost = Partial<Record<Good, number>>;

// How each good is earned, for the in-game glossary. (What it's spent on is worked out from the price tables.)
export const GOOD_SOURCE: Record<Good, string> = {
  bamboo: "Grows in bamboo regions: each one you hold gives 1 at the start of your turn, and more whenever the dice roll its number.",
  stone:
    "Quarried in stone regions (1 a turn each, plus dice rolls). Your NACAM ogres also haul it in: each ogre has a 1 in 3 chance to bring 1 Stone at the start of your turn (up to 3).",
  iron: "Mined in iron regions: 1 a turn from each one you hold, plus dice rolls.",
  rice: "Grown in rice regions: 1 a turn from each one you hold, plus dice rolls.",
  gems: "Dug up in gem regions: 1 a turn from each one you hold, plus dice rolls.",
  coin: "2 Coin a turn for every region you hold, +2 for each Market. Ogres cost 1 Coin a turn each in wages. Spend it at the Bank on any resource you're missing.",
  pandaCoin: "1 a turn for every 3 pandas you own, +2 per Panda Sanctuary, +2 with Ping, and +1 per panda on loan (to or from you).",
  camCoin: "+1 a turn per CAM Gym. Or exchange at the Bank: 6 Coin or 3 PandaCoin for 1 CamCoin.",
};

// ---- Units ----
export type UnitType = "panda" | "armedPanda" | "nacam" | "cam";
export const UNIT_TYPES: UnitType[] = ["panda", "armedPanda", "nacam", "cam"];

export const UNITS: Record<UnitType, { label: string; plural: string; icon: string; attack: number; defense: number; cost: Cost; blurb: string }> = {
  panda: {
    label: "Panda",
    plural: "Pandas",
    icon: "🐼",
    attack: 0,
    defense: 1,
    cost: { bamboo: 1, rice: 1 },
    blurb: "Cheap, stubborn defenders. Every 3 pandas you own earn 1 PandaCoin a turn.",
  },
  armedPanda: {
    label: "Armed Panda",
    plural: "Armed Pandas",
    icon: "🛡️",
    attack: 1,
    defense: 2,
    cost: { iron: 1, coin: 1 },
    blurb: "A panda with a bamboo spear and a tin helmet. Upgrade one of your pandas in the same region.",
  },
  nacam: {
    label: "NACAM Ogre",
    plural: "NACAM Ogres",
    icon: "👹",
    attack: 2,
    defense: 0,
    cost: { coin: 3, rice: 1 },
    blurb: "Not A Classically Attractive Male. Ugly, jacked with rage, hits hard. Each one has a 1 in 3 chance to quarry 1 Stone a turn. Mercenaries: 1 coin upkeep each turn or they desert.",
  },
  cam: {
    label: "CAM",
    plural: "CAMs",
    icon: "💪",
    attack: 2,
    defense: 2,
    cost: { camCoin: 2, gems: 1 },
    blurb: "Classically Attractive Males. Jacked, beautiful and expensive. Great at everything.",
  },
};

// ---- Buildings (one of each per region) ----
export type BuildingType = "sanctuary" | "gym" | "market" | "fort";
export const BUILDING_TYPES: BuildingType[] = ["sanctuary", "gym", "market", "fort"];

export const BUILDINGS: Record<BuildingType, { label: string; icon: string; cost: Cost; blurb: string }> = {
  sanctuary: { label: "Panda Sanctuary", icon: "🏯", cost: { bamboo: 2, stone: 1, coin: 2 }, blurb: "+2 PandaCoin every turn." },
  gym: { label: "CAM Gym", icon: "🏋️", cost: { stone: 2, iron: 1, gems: 1 }, blurb: "+1 CamCoin every turn." },
  market: { label: "Market", icon: "🏪", cost: { stone: 1, rice: 1, coin: 3 }, blurb: "+2 Coin every turn, and bank trades at 3:1 instead of 4:1." },
  fort: { label: "Fort", icon: "🏰", cost: { stone: 2, iron: 2 }, blurb: "Defenders here get +1 on every die." },
};

// ---- Urban gondolas: the ONLY way to move troops ----
export const GONDOLA_COST: Cost = { bamboo: 1, stone: 1, iron: 1, coin: 1 };

// ---- Heroes: one of each in the whole world ----
export type HeroId = "ping" | "cockpenis" | "casey" | "piecer" | "josserkid";
export const HERO_IDS: HeroId[] = ["casey", "ping", "cockpenis", "piecer", "josserkid"];

export const HEROES: Record<HeroId, { name: string; title: string; icon: string; cost: Cost; power: string; combatBonus: number }> = {
  casey: {
    name: "Casey",
    title: "the Norse God",
    icon: "⚡",
    cost: { camCoin: 10, pandaCoin: 10, gems: 2, coin: 10 },
    power: "By far the most powerful being alive. +3 to every die in battles fought from or in his region, and every 3 of your turns he can call down Thunder on any region you can see, destroying its 3 strongest units. If his region falls, the conqueror captures him.",
    combatBonus: 3,
  },
  ping: {
    name: "Ping",
    title: "the Panda Diplomat",
    icon: "🎋",
    cost: { pandaCoin: 6, bamboo: 2 },
    power: "Master of panda diplomacy. Bank trades at 2:1, +2 PandaCoin every turn, and +1 to every die in battles fought from or in his region.",
    combatBonus: 1,
  },
  cockpenis: {
    name: "Cock Penis",
    title: "the Ogre Warlord",
    icon: "🪓",
    cost: { coin: 8, camCoin: 2 },
    power: "Commands the NACAM hordes. Ogres cost 1 less Coin to hire and need no upkeep, and +1 to every die in battles fought from or in his region.",
    combatBonus: 1,
  },
  piecer: {
    name: "The Piecer Captain",
    title: "Gondola Engineer",
    icon: "🚡",
    cost: { coin: 6, pandaCoin: 3, iron: 1 },
    power: "Builds gondola lines for half price (rounded up), troops leaving his region can ride two lines in one turn, and +1 to every die in battles fought from or in his region.",
    combatBonus: 1,
  },
  josserkid: {
    name: "The Josserkid",
    title: "the Trickster",
    icon: "🃏",
    cost: { camCoin: 3, coin: 4 },
    power: "Sees through the fog up to 3 regions from wherever he is, once per turn pickpockets a random resource from any Kird whose land you can see, and +1 to every die in battles fought from or in his region.",
    combatBonus: 1,
  },
};

export const THUNDER_COOLDOWN = 3;

// ---- Economy ----
export const COIN_PER_REGION = 2;
export const PANDAS_PER_PANDACOIN = 3;
export const SANCTUARY_PANDACOIN = 2;
export const GYM_CAMCOIN = 1;
export const MARKET_COIN = 2;
export const NACAM_UPKEEP = 1;
// Ogres are strong backs: each NACAM you own has this chance to haul in 1 Stone at the start of your turn.
export const QUARRY_CHANCE = 1 / 3;
export const QUARRY_MAX = 3;
export const RAID_THRESHOLD = 9;

// The World Bank sells any resource for Coin, so no Kird is ever stuck waiting on the dice for one missing card.
export const BUY_PRICE = 3;
export const BUY_PRICE_MARKET = 2;

// Native garrisons never grow past these, so the world around you can't outgrow you forever.
export const NATIVE_CAP: Record<string, Partial<Record<UnitType, number>>> = {
  pandas: { panda: 10, armedPanda: 3 },
  nacams: { nacam: 8 },
  cams: { cam: 6 },
  wild: { panda: 3 },
};

// Game length: hold this many regions at the start of your turn to win (null plays forever).
// Sized from simulated four-player games to the finish: 25 takes about 40 rounds, 30 about 45 or more.
// (35 was tried and dropped: four-sided wars at that size often stalemate for 150+ rounds.)
export const GOAL_CHOICES = [25, 30] as const;
export const DEFAULT_GOAL = 25;

// Currency exchange at the World Bank: pay `pay` of one currency, receive `get` of another.
export const EXCHANGE: { from: Currency; to: Currency; pay: number; get: number }[] = [
  { from: "coin", to: "pandaCoin", pay: 3, get: 1 },
  { from: "pandaCoin", to: "coin", pay: 1, get: 2 },
  { from: "coin", to: "camCoin", pay: 6, get: 1 },
  { from: "pandaCoin", to: "camCoin", pay: 3, get: 1 },
  { from: "camCoin", to: "coin", pay: 1, get: 4 },
];

export const START_KIT = {
  goods: { bamboo: 2, stone: 2, iron: 2, rice: 2, gems: 1, coin: 6, pandaCoin: 1, camCoin: 0 } as Record<Good, number>,
  units: { panda: 3, armedPanda: 0, nacam: 1, cam: 0 } as Record<UnitType, number>,
};

// Natives defending each kind of region before anyone conquers it.
export const NATIVE_GARRISON: Record<string, Partial<Record<UnitType, number>>> = {
  pandas: { panda: 5, armedPanda: 2 },
  nacams: { nacam: 3 },
  cams: { cam: 2 },
  wild: { panda: 1 },
};

export const PLAYER_COLORS = ["#d64a2b", "#2b6fd6", "#e0a526", "#8a3fd1", "#14a38b", "#d6368f", "#5b7d1f", "#0f1f4d"];
