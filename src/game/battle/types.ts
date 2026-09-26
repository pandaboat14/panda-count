// Types for the Pokémon-style battles. Everything here is plain data: a battle survives
// JSON.parse(JSON.stringify(b)) between any two engine calls.

export type SideKey = "atk" | "def";

export type GoodId = "bamboo" | "stone" | "iron" | "rice" | "gems" | "coin" | "pandaCoin" | "camCoin";
export type Goods = Record<GoodId, number>;
export type Cost = Partial<Record<GoodId, number>>;

export type TypeId = "fluff" | "glam" | "brute" | "steel" | "legend";
export type UnitId = "panda" | "armedPanda" | "nacam" | "cam";
export type HeroId = "casey" | "ping" | "cockpenis" | "piecer" | "josserkid";
export type MoveKind = "strike" | "guard" | "tactic" | "signature";
export type MoveTag = "ranged" | "pierce" | "once" | "reload" | "recoil" | "splash" | "firstRound";
export type StatusId = "staggered" | "shaken" | "charmed" | "dazzled" | "burning" | "exposed" | "enraged" | "focused" | "hyped";
export type TerrainId = "bamboo" | "stone" | "iron" | "rice" | "gems";
export type BuildingId = "fort" | "sanctuary" | "gym" | "market";
export type WorldEventId = "blight" | "gondolaStrike" | "mercMarket" | "caseySale";
export type DoctrineId = "turtle" | "counter" | "allin" | "diplomat" | "berserk" | "showboat" | "skittish";
// The doctrines a player can give their Standing Orders (the others belong to the natives).
export type PlayerDoctrineId = "turtle" | "counter" | "allin" | "diplomat";
export type NativeId = "pandas" | "nacams" | "cams" | "wild";
export type WeaponId = "bambooSpear" | "bambooBow" | "gemArrows" | "sling" | "ironGlaive" | "spikedClub" | "gemKnuckles" | "ironHelm" | "towerShield" | "catapult";
export type ItemId = "riceBall" | "feast" | "smokeBomb" | "caltrops" | "warDrums" | "mercHorn" | "bribe" | "whetstone" | "gemFocus" | "luckyGem" | "blessing";
export type ReactionId = "luckyGem" | "blessing" | "loadedDice";
export type TrapId = "caltrops";
export type ResultHow = "won" | "held" | "retreat" | "truce" | "stalled";

export type Bag = Partial<Record<ItemId, number>>;

export type Effect = {
  on: "always" | "win" | "doubles" | "triples" | "crit";
  to: "enemy" | "self" | "team" | "brutes";
  status: StatusId;
  turns: number;
};

export type MoveDef = {
  id: string;
  name: string;
  // A unit or hero id, "weapon:<id>" for weapon moves, or "army:catapult".
  user: string;
  kind: MoveKind;
  dice: number;
  bonus: number;
  power: number;
  cost: Cost;
  tags: MoveTag[];
  effects: Effect[];
  anim: string;
  fx: string;
  text: string;
  flavor: string;
  element?: TerrainId;
  healOnWin?: number;
  revive?: number;
  needs?: BuildingId;
  reinforce?: number;
  stat?: "atk" | "def";
  lifesteal?: number;
  brace?: number;
  guard?: boolean;
  recoil?: number;
  splashOn?: "always" | "win" | "doubles" | "triples" | "crit";
  splash?: number;
  heal?: number;
  critOn?: number;
  smite?: number;
  convert?: UnitId;
  healTeam?: number;
  ends?: "truce";
  hire?: number;
  cable?: number;
  cutLine?: boolean;
  steal?: boolean;
  decoy?: boolean;
  winsTies?: boolean;
};

export type WeaponDef = {
  label: string;
  icon: string;
  slot: "weapon" | "armor" | "army";
  fits: UnitId[];
  cost: Cost;
  text: string;
  power?: number;
  move?: string;
  critOnBow?: number;
  atk?: number;
  def?: number;
  doublesStagger?: boolean;
  guardDice?: number;
};

export type ItemDef = {
  label: string;
  icon: string;
  when: "action" | "prep" | "reaction";
  cost: Cost;
  text: string;
  heal?: number;
  cure?: boolean;
  smoke?: boolean;
  hazard?: number;
  team?: StatusId;
  hire?: number;
  bribe?: boolean;
  power?: number;
  dice?: number;
  reroll?: number;
  winsTies?: boolean;
};

export type DoctrineWeights = { guard: number; strike: number; tactic: number; heal: number; items: number; switch?: number; dice?: number };
export type DoctrineDef = { label: string; icon: string; text: string; weights: DoctrineWeights; native?: boolean };

// ---------------------------------------------------------------- battle setup

export type SquadSpec = { unit?: UnitId; count?: number; gear?: WeaponId[]; weapon?: WeaponId; hero?: HeroId };

export type SideConfig = {
  name: string;
  color?: string;
  native?: NativeId | null;
  // A person commanding this side live (the arena shows the defender's doctrine only when it isn't).
  player?: boolean;
  doctrine?: DoctrineId;
  squads?: SquadSpec[];
  hero?: HeroId | null;
  bag?: Bag;
  goods?: Partial<Goods>;
  catapult?: boolean;
  thunderCharged?: boolean;
  traps?: TrapId[];
  // Standing Orders: how many Bag items this side may spend in the battle (null or missing: no limit).
  budget?: number | null;
};

export type BattleConfig = {
  seed?: number;
  terrain?: TerrainId;
  buildings?: BuildingId[];
  events?: WorldEventId[];
  place?: string;
  atk: SideConfig;
  def: SideConfig;
};

// ---------------------------------------------------------------- battle state

export type Squad = {
  id: string;
  hero: HeroId | null;
  unit: UnitId | null;
  kind: UnitId | HeroId;
  name: string;
  icon: string;
  type: TypeId;
  count: number;
  maxCount: number;
  hpPer: number;
  hp: number;
  gear: WeaponId[];
  status: Partial<Record<StatusId, number>>;
  fresh: Partial<Record<StatusId, boolean>>;
  lost: number;
  announcedFaint?: boolean;
};

// What a display needs to show a squad right after an event.
export type SquadSnap = {
  id: string;
  unit: UnitId | null;
  hero: HeroId | null;
  kind: UnitId | HeroId;
  name: string;
  type: TypeId;
  hp: number;
  count: number;
  maxCount: number;
  hpPer: number;
  gear: WeaponId[];
};

export type SideFlags = { noChase: boolean; smokedRound: number; trappedUntil: number; catapultRound: number; blessing: boolean };

export type BattleSide = {
  key: SideKey;
  name: string;
  color: string;
  native: NativeId | null;
  player: boolean;
  doctrine: DoctrineId;
  squads: Squad[];
  active: number;
  bag: Bag;
  goods: Goods;
  catapult: boolean;
  thunderCharged: boolean;
  momentum: number;
  used: Record<string, boolean>; // once-per-battle moves
  hazard: number; // damage this side's squads take when they step in (enemy caltrops)
  flags: SideFlags;
  spent: Cost;
  // Standing Orders' item budget (null: no limit) and how many Bag items this side has spent so far.
  budget: number | null;
  itemsUsed: number;
};

export type BattleAction =
  | { kind: "move"; id: string; prep?: ItemId }
  | { kind: "item"; id: ItemId; prep?: ItemId }
  | { kind: "switch"; to: number; prep?: ItemId }
  | { kind: "retreat"; prep?: ItemId };

export type PlanNote = { label: string; value: string };

export type Plan = {
  key: SideKey;
  action: BattleAction;
  dice: number;
  bonus: number;
  power: number;
  critOn: number;
  ranged: boolean;
  pierce: boolean;
  guard: boolean;
  brace: number;
  winsTies: boolean;
  losesTies: boolean;
  decoy: boolean;
  pierceable: number;
  type: TypeId;
  move: MoveDef | null;
  notes: PlanNote[];
};

export type PlanSummary = Pick<Plan, "dice" | "bonus" | "power" | "critOn" | "notes" | "ranged" | "pierce" | "guard" | "brace">;

export type Pair = { ai: number; di: number; aRaw: number; dRaw: number; a: number; d: number; win: SideKey; tie: boolean; crit: boolean };

// Fields every event may carry, added when it is emitted: the named squad's state right after it,
// every squad (when armies change shape), the entering squad's index, and a side's momentum.
export type EventSnapshots = {
  after?: SquadSnap;
  squads?: { atk: SquadSnap[]; def: SquadSnap[] };
  index?: number;
  value?: number;
  // Added by the game (not the engine): the physics seed for a roll's or re-roll's throw.
  seed?: number;
};

export type BattleEvent = EventSnapshots &
  (
    | { t: "say"; text: string; fx?: string; side?: SideKey }
    | { t: "enter"; side: SideKey; squad: string; text: string }
    | { t: "damage"; side: SideKey; squad: string; amount: number; fell: number; eff: "super" | "resist" | null; hits: number; crits: number; source?: "caltrops" | "recoil" | "splash" | "burning"; by?: SideKey; text: string }
    | { t: "item"; side: SideKey; item: ItemId; text: string }
    | { t: "use"; side: SideKey; action: BattleAction; text: string }
    | { t: "roll"; atk: number[]; def: number[]; plans: { atk: PlanSummary; def: PlanSummary } | null; text?: string }
    | { t: "heal"; side: SideKey; squad: string | null; amount: number; revived: number; text: string }
    | { t: "cure"; side: SideKey; text: string }
    | { t: "status"; side: SideKey; squad: string | null; status: StatusId; turns: number; text: string }
    | { t: "reinforce"; side: SideKey; squad: string; unit: UnitId | null; count: number; text: string }
    | { t: "bribe"; side: SideKey; roll: number; count: number; squad: string; text: string }
    | { t: "smite"; side: SideKey; killed: Record<string, number>; text: string }
    | { t: "reroll"; side: SideKey; item: ReactionId; die: number; from: number; to: number; text: string }
    | { t: "blessing"; side: SideKey; text: string }
    | { t: "pairs"; pairs: Pair[]; tieWinner: SideKey; bonus: { atk: number; def: number } }
    | { t: "momentum"; side: SideKey; value: number }
    | { t: "convert"; side: SideKey; count: number; from: string; text: string }
    | { t: "steal"; side: SideKey; item?: ItemId; good?: GoodId; text: string }
    | { t: "faint"; side: SideKey; squad: string; text: string }
    | { t: "end"; how: ResultHow; winner: SideKey; text: string }
  );

export type BattleEventType = BattleEvent["t"];

export type Pending = {
  round: number;
  actions: { atk: BattleAction; def: BattleAction };
  plans: { atk?: Plan; def?: Plan };
  dice: { atk?: number[]; def?: number[] };
  rerolls: BattleEvent[];
  used: { atk: boolean; def: boolean };
  blessing: { atk: boolean; def: boolean };
  events: BattleEvent[];
  done: boolean;
};

export type RoundLog = {
  round: number;
  actions: { atk: BattleAction; def: BattleAction };
  dice: { atk: number[]; def: number[] };
  plans: { atk?: PlanSummary; def?: PlanSummary };
  events: BattleEvent[];
};

export type BattleResult = { how: ResultHow; winner: SideKey; text: string; rounds: number };

export type Battle = {
  cfg: BattleConfig;
  seed: number;
  // The dice and the computer's RNG states (mulberry32), advanced explicitly so the battle stays plain JSON.
  rng: number;
  aiRng: number;
  terrain: TerrainId;
  buildings: BuildingId[];
  events: WorldEventId[];
  place: string;
  round: number;
  over: boolean;
  result: BattleResult | null;
  sides: { atk: BattleSide; def: BattleSide };
  log: RoundLog[];
  pending: Pending | null;
  opening: BattleEvent[];
};

// ---------------------------------------------------------------- menus, previews and summaries

export type MoveOption = { kind: "move"; id: string; move: MoveDef; enabled: boolean; reason: string | null };
export type ItemOption = { kind: "item"; id: ItemId; item: ItemDef; when: ItemDef["when"]; enabled: boolean; reason: string | null; count: number };
export type SwitchOption = { kind: "switch"; to: number; squad: Squad; enabled: boolean; reason: string | null };
export type RetreatOption = { kind: "retreat"; enabled: boolean; reason: string | null };
export type ActionGroups = {
  attack: MoveOption[];
  defend: MoveOption[];
  tactics: MoveOption[];
  signature: MoveOption[];
  bag: ItemOption[];
  squads: SwitchOption[];
  retreat: RetreatOption[];
};

export type ReactionOption = { id: ReactionId; label: string; icon: string; text: string; count?: number; needsDie: boolean };

export type Estimate = { dealt: number; taken: number; pAny: number; hits: number; plan: Plan; foePlan: Plan; mult: number };

export type SquadStats = { atk: number; def: number; aura: number; fort: number };

export type SideSummary = {
  name: string;
  survivors: Partial<Record<UnitId, number>>;
  lost: Partial<Record<UnitId, number>>;
  heroes: { hero: HeroId; standing: boolean }[];
  spent: Cost;
  luck: number;
};
export type BattleSummary = { atk: SideSummary; def: SideSummary };
