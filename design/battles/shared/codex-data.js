// Panda Diplomacy battle codex: every number and word the Pokemon-style battles run on.
// Plain script (no imports): defines CODEX. Units, heroes, costs and building names match src/game/rules.ts.
const CODEX = (() => {
  const GOODS = {
    bamboo: { label: "Bamboo", icon: "🎋", color: "#5f9a4a" },
    stone: { label: "Stone", icon: "🪨", color: "#9a968c" },
    iron: { label: "Iron", icon: "⛓️", color: "#5d6b7a" },
    rice: { label: "Rice", icon: "🍚", color: "#e2cf8a" },
    gems: { label: "Gems", icon: "💎", color: "#9b6fc7" },
    coin: { label: "Coin", icon: "🪙", color: "#d9a53a" },
    pandaCoin: { label: "PandaCoin", icon: "🐼", color: "#1c1b17" },
    camCoin: { label: "CamCoin", icon: "💪", color: "#e8b64a" },
  };

  // ---- Types: a ring of four, plus Legend for heroes ----
  // Fluff beats Glam, Glam beats Brute, Brute beats Steel, Steel beats Fluff. Opposites (Fluff/Brute, Glam/Steel) are even.
  const TYPES = {
    fluff: { label: "Fluff", icon: "🐼", color: "#efe7d6", ink: "#1c1b17", beats: "glam", why: "Upstaged! The crowd only has eyes for the pandas." },
    glam: { label: "Glam", icon: "✨", color: "#e8b64a", ink: "#3a2a05", beats: "brute", why: "Shamed! No ogre can stand next to a CAM for long." },
    brute: { label: "Brute", icon: "👹", color: "#6f8a3a", ink: "#ffffff", beats: "steel", why: "Crushed! Tin helmets fold like paper." },
    steel: { label: "Steel", icon: "⚔️", color: "#7d8a98", ink: "#ffffff", beats: "fluff", why: "Outdrilled! Spears and discipline scatter plain fluff." },
    legend: { label: "Legend", icon: "🌟", color: "#9b6fc7", ink: "#ffffff", beats: null, why: "Heroes shrug off a quarter of every blow and hit every type evenly." },
  };
  const SUPER = 1.5;
  const RESIST = 0.75;
  const LEGEND_TAKEN = 0.75;
  function typeMult(atkType, defType) {
    if (defType === "legend") return LEGEND_TAKEN;
    if (atkType === "legend") return 1;
    if (TYPES[atkType].beats === defType) return SUPER;
    if (TYPES[defType].beats === atkType) return RESIST;
    return 1;
  }

  // ---- Units: attack/defence match the game (they add to every die); HP is new ----
  const UNITS = {
    panda: { label: "Panda", plural: "Pandas", icon: "🐼", type: "fluff", hp: 10, atk: 0, def: 1, cost: { bamboo: 1, rice: 1 }, blurb: "Cheap, stubborn defenders. Best when they curl up and let the enemy tire." },
    armedPanda: { label: "Armed Panda", plural: "Armed Pandas", icon: "🛡️", type: "steel", hp: 10, atk: 1, def: 2, cost: { iron: 1, coin: 1 }, blurb: "A panda with a bamboo spear and a tin helmet. Drilled, patient, pointy." },
    nacam: { label: "NACAM Ogre", plural: "NACAM Ogres", icon: "👹", type: "brute", hp: 10, atk: 2, def: 0, cost: { coin: 3, rice: 1 }, blurb: "Not A Classically Attractive Male. Hits like a landslide, guards like a wet paper bag." },
    cam: { label: "CAM", plural: "CAMs", icon: "💪", type: "glam", hp: 10, atk: 2, def: 2, cost: { camCoin: 2, gems: 1 }, blurb: "Classically Attractive Males. Great at everything, and they know it." },
  };

  // Heroes join a battle fought from or in their region. Their aura adds to every die your side rolls (as today),
  // and they also take the field as a one-hero squad you can switch in.
  const HEROES = {
    casey: { name: "Casey", title: "the Norse God", icon: "⚡", type: "legend", hp: 40, atk: 1, def: 1, aura: 3, blurb: "By far the most powerful being alive. +3 on every die your side rolls." },
    ping: { name: "Ping", title: "the Panda Diplomat", icon: "🎋", type: "legend", hp: 20, atk: 0, def: 1, aura: 1, blurb: "Wins fights without fighting. Other pandas find him very persuasive." },
    cockpenis: { name: "Cock Penis", title: "the Ogre Warlord", icon: "🪓", type: "legend", hp: 30, atk: 2, def: 0, aura: 1, blurb: "Every ogre on the field fights harder when he screams." },
    piecer: { name: "The Piecer Captain", title: "Gondola Engineer", icon: "🚡", type: "legend", hp: 22, atk: 1, def: 1, aura: 1, blurb: "Reinforcements by cable, retreats by cable, and a very large wrench." },
    josserkid: { name: "The Josserkid", title: "the Trickster", icon: "🃏", type: "legend", hp: 18, atk: 1, def: 0, aura: 1, blurb: "Cheats. Openly. With a smile." },
  };

  // ---- Moves ----
  // kind: strike, guard (ties go to you, lost pairs hurt 25% less), tactic, signature (needs 5 Momentum).
  // Attackers add their unit's attack to every die and defenders their defence, whatever the move.
  // Every pair you win deals your move's power (x type, x crit). Tactics mostly deal nothing and do something else.
  // tags: ranged (pairs you lose hurt you 15% less), pierce (their guard bonus and Fort don't count),
  //       once (once per battle), reload (every other round), recoil, splash, firstRound.
  const M = (id, o) => ({ id, bonus: 0, power: 0, cost: {}, tags: [], effects: [], ...o });
  const MOVES = [
    // Panda (Fluff)
    M("bellyBump", { name: "Belly Bump", user: "panda", kind: "strike", dice: 3, power: 10, anim: "attack", fx: "impact", text: "A plain, honest hit.", flavor: "A running start and a lot of belly." }),
    M("bambooBarrage", { name: "Bamboo Barrage", user: "panda", kind: "strike", dice: 3, power: 8, element: "bamboo", cost: { bamboo: 1 }, tags: ["ranged"], anim: "throw", fx: "bamboo", text: "Three dice from range: pairs you lose hurt you 15% less.", flavor: "A hail of half-chewed bamboo." }),
    M("rolyPoly", { name: "Roly-Poly", user: "panda", kind: "guard", dice: 2, power: 7, healOnWin: 5, anim: "guard", fx: "shield", text: "Guard: ties go to you and lost pairs hurt 25% less. Win a pair and the squad heals 5.", flavor: "Curl up and roll with the punches." }),
    M("puppyEyes", { name: "Puppy Eyes", user: "panda", kind: "tactic", dice: 2, effects: [{ on: "win", to: "enemy", status: "charmed", turns: 1 }], anim: "cast", fx: "hearts", text: "No damage. Win a pair and the enemy is Charmed: no Strikes next round.", flavor: "Nobody can hit that face." }),
    M("napTime", { name: "Nap Time", user: "panda", kind: "tactic", dice: 1, tags: ["once"], revive: 1, anim: "cast", fx: "zzz", text: "Once per battle. A fallen panda gets back up.", flavor: "They weren't fallen. Just napping." }),
    M("cubSwarm", { name: "Cub Swarm", user: "panda", kind: "tactic", dice: 2, tags: ["once"], needs: "sanctuary", reinforce: 2, anim: "cheer", fx: "hearts", text: "Defending a Sanctuary only, once. Two cubs join the squad.", flavor: "The sanctuary empties. Tiny, furious reinforcements." }),
    M("pandaPileOn", { name: "Panda Pile-On", user: "panda", kind: "signature", stat: "atk", dice: 4, bonus: 1, power: 10, lifesteal: 5, anim: "attack", fx: "impact", text: "Four dice at +1. Every pair you win also heals the squad 5.", flavor: "Everybody on top!" }),

    // Armed Panda (Steel)
    M("spearPoke", { name: "Spear Poke", user: "armedPanda", kind: "strike", dice: 3, power: 10, anim: "attack", fx: "slash", text: "Three dice. A clean, reliable thrust.", flavor: "Pointy end first." }),
    M("pikeCharge", { name: "Pike Charge", user: "armedPanda", kind: "strike", dice: 3, power: 13, effects: [{ on: "always", to: "self", status: "exposed", turns: 1 }], anim: "attack", fx: "slash", text: "Three dice, heavy hits, but you're Exposed next round: lost pairs hurt 50% more.", flavor: "All in, spears down." }),
    M("phalanx", { name: "Phalanx", user: "armedPanda", kind: "guard", dice: 2, power: 8, brace: 0.6, anim: "guard", fx: "shield", text: "Guard: ties go to you, and lost pairs hurt 40% less.", flavor: "Shields locked, spears out." }),
    M("helmetHeadbutt", { name: "Helmet Headbutt", user: "armedPanda", kind: "strike", dice: 1, bonus: 2, power: 13, effects: [{ on: "win", to: "enemy", status: "staggered", turns: 1 }], anim: "attack", fx: "impact", text: "One die at +2. Win it and the enemy is Staggered.", flavor: "The tin helmet finally earns its keep." }),
    M("drillFormation", { name: "Drill Formation", user: "armedPanda", kind: "tactic", dice: 2, effects: [{ on: "always", to: "self", status: "focused", turns: 1 }], anim: "guard", fx: "sparkle", text: "No damage. You're Focused next round: +1 die.", flavor: "Left, right, left, stab." }),
    M("tinRain", { name: "Tin Rain", user: "armedPanda", kind: "strike", dice: 3, power: 8, element: "iron", cost: { iron: 1 }, tags: ["ranged"], anim: "throw", fx: "slash", text: "Javelins: three dice from range.", flavor: "The back row has opinions." }),
    M("bambooWall", { name: "Bamboo Wall", user: "armedPanda", kind: "signature", stat: "def", guard: true, dice: 3, bonus: 2, power: 10, brace: 0.5, anim: "guard", fx: "shield", text: "Guard with three dice at +2: ties go to you and lost pairs hurt half as much.", flavor: "Nothing gets through. Nothing." }),

    // NACAM Ogre (Brute)
    M("clubSmash", { name: "Club Smash", user: "nacam", kind: "strike", dice: 2, power: 14, anim: "attack", fx: "impact", text: "Two dice, heavy hits.", flavor: "Swing first, think never." }),
    M("groundPound", { name: "Ground Pound", user: "nacam", kind: "strike", dice: 3, power: 10, element: "stone", cost: { stone: 1 }, splashOn: "doubles", splash: 6, anim: "attack", fx: "rocks", text: "Three dice. Roll doubles and the quake hits every enemy squad for 6.", flavor: "The whole valley jumps." }),
    M("rage", { name: "Rage", user: "nacam", kind: "tactic", dice: 1, effects: [{ on: "always", to: "self", status: "enraged", turns: 3 }], anim: "cheer", fx: "steam", text: "No damage. Enraged for 3 rounds: +1 on every die, but lost pairs hurt 50% more.", flavor: "Something about the pandas' faces set him off." }),
    M("uglyRoar", { name: "Ugly Roar", user: "nacam", kind: "tactic", dice: 2, effects: [{ on: "win", to: "enemy", status: "shaken", turns: 2 }], anim: "cast", fx: "roar", text: "No damage. Win a pair and the enemy is Shaken: -1 on every die for 2 rounds.", flavor: "It's not the volume. It's the face." }),
    M("boulderToss", { name: "Boulder Toss", user: "nacam", kind: "strike", dice: 2, power: 12, element: "stone", cost: { stone: 1 }, tags: ["ranged"], anim: "throw", fx: "rocks", text: "Two dice from range.", flavor: "Ogres don't aim. Ogres throw harder." }),
    M("bellyFlop", { name: "Belly Flop", user: "nacam", kind: "strike", dice: 3, power: 13, recoil: 6, tags: ["recoil"], anim: "attack", fx: "impact", text: "Three dice, heavy hits, but your squad takes 6.", flavor: "Gravity and a big lunch." }),
    M("nacamStampede", { name: "NACAM Stampede", user: "nacam", kind: "signature", stat: "atk", dice: 4, power: 14, effects: [{ on: "win", to: "enemy", status: "staggered", turns: 1 }], anim: "attack", fx: "rocks", text: "Four dice, heavy hits, and the enemy is Staggered if you win a pair.", flavor: "Every ogre, all at once, in no particular direction." }),

    // CAM (Glam)
    M("poseDown", { name: "Pose-Down", user: "cam", kind: "strike", dice: 3, power: 10, anim: "cast", fx: "sparkle", text: "Three dice.", flavor: "Front double biceps. Side chest. Devastation." }),
    M("dropkick", { name: "Dropkick", user: "cam", kind: "strike", dice: 2, bonus: 1, power: 14, anim: "attack", fx: "impact", text: "Two dice at +1, heavy hits.", flavor: "Beautiful form. Terrible for whoever's in front." }),
    M("flex", { name: "Flex", user: "cam", kind: "guard", dice: 2, power: 8, effects: [{ on: "win", to: "enemy", status: "dazzled", turns: 1 }], anim: "cast", fx: "sparkle", text: "Guard: ties go to you and lost pairs hurt 25% less. Win a pair and the enemy is Dazzled: no crits, and ties go against them.", flavor: "The sun catches the pecs." }),
    M("proteinShake", { name: "Protein Shake", user: "cam", kind: "tactic", dice: 2, element: "rice", cost: { rice: 1 }, heal: 10, effects: [{ on: "always", to: "self", status: "focused", turns: 1 }], anim: "cast", fx: "heal", text: "Heals 10 (one CAM back up) and you're Focused next round.", flavor: "Chocolate. Obviously." }),
    M("blindingSmile", { name: "Blinding Smile", user: "cam", kind: "strike", dice: 3, power: 9, element: "gems", cost: { gems: 1 }, critOn: 5, anim: "cast", fx: "sparkle", text: "Three dice that crit on 5 or 6.", flavor: "Veneers so white they cut." }),
    M("hypeSquad", { name: "Hype Squad", user: "cam", kind: "tactic", dice: 2, effects: [{ on: "always", to: "team", status: "hyped", turns: 1 }], anim: "cheer", fx: "music", text: "No damage. Every squad on your side is Hyped next round: +1 on every die.", flavor: "Let's hear it for the lads." }),
    M("goldenHour", { name: "Golden Hour", user: "cam", kind: "signature", stat: "atk", dice: 4, power: 12, critOn: 4, anim: "cast", fx: "sparkle", text: "Four dice that crit on 4, 5 or 6.", flavor: "The light is perfect. So is the violence." }),

    // Heroes (Legend)
    M("stormHammer", { name: "Storm Hammer", user: "casey", kind: "strike", dice: 3, power: 16, anim: "attack", fx: "lightning", text: "Three dice, enormous hits.", flavor: "It hums before it lands." }),
    M("thunderCall", { name: "Thunder Call", user: "casey", kind: "tactic", dice: 2, tags: ["once"], smite: 3, anim: "cast", fx: "lightning", text: "Once per battle, and only if Casey's Thunder is charged: the 3 strongest enemy units are destroyed. Uses the charge.", flavor: "The sky takes a side." }),
    M("meadBreak", { name: "Mead Break", user: "casey", kind: "tactic", dice: 1, heal: 15, effects: [{ on: "always", to: "self", status: "focused", turns: 1 }], anim: "cheer", fx: "heal", text: "Casey heals 15 and is Focused next round.", flavor: "Even gods need a breather." }),
    M("heavenSplit", { name: "Heaven Split", user: "casey", kind: "signature", stat: "atk", dice: 4, power: 18, splashOn: "always", splash: 10, effects: [{ on: "crit", to: "enemy", status: "burning", turns: 3 }], anim: "cast", fx: "lightning", text: "Four dice, huge hits, 10 to every other enemy squad, and a crit sets them Burning.", flavor: "THE HEAVENS SPLIT." }),

    M("jadeFan", { name: "Jade Fan", user: "ping", kind: "strike", dice: 2, power: 10, anim: "attack", fx: "wind", text: "Two dice.", flavor: "A gentle breeze. With edges." }),
    M("pandaDiplomacy", { name: "Panda Diplomacy", user: "ping", kind: "tactic", dice: 2, convert: "panda", anim: "cast", fx: "hearts", text: "Each pair you win against pandas brings one over to your side. Against anyone else, a win Charms them.", flavor: "Would you like to come home with me?" }),
    M("teaCeremony", { name: "Tea Ceremony", user: "ping", kind: "tactic", dice: 2, healTeam: 8, anim: "cast", fx: "heal", text: "Every squad on your side heals 8.", flavor: "Oolong, and a moment of calm." }),
    M("ceasefire", { name: "Ceasefire", user: "ping", kind: "tactic", dice: 1, cost: { pandaCoin: 3 }, tags: ["once"], ends: "truce", anim: "cast", fx: "hearts", text: "The battle ends now. Both sides keep their survivors and the attackers go home.", flavor: "Tea is served. The war can wait." }),

    M("warAxe", { name: "Warlord's Axe", user: "cockpenis", kind: "strike", dice: 3, power: 15, anim: "attack", fx: "slash", text: "Three dice, enormous hits.", flavor: "Two blades. No manners." }),
    M("warcry", { name: "Warcry", user: "cockpenis", kind: "tactic", dice: 2, effects: [{ on: "always", to: "brutes", status: "enraged", turns: 3 }, { on: "win", to: "enemy", status: "shaken", turns: 2 }], anim: "cast", fx: "roar", text: "Every ogre squad on your side is Enraged for 3 rounds. Win a pair and the enemy is Shaken.", flavor: "HRRAAAGH." }),
    M("hireOnTheSpot", { name: "Hire on the Spot", user: "cockpenis", kind: "tactic", dice: 1, cost: { coin: 6 }, tags: ["once"], hire: 3, anim: "cheer", fx: "coins", text: "Once per battle, 6 🪙: three NACAM ogres join your army now.", flavor: "Cash up front. No questions." }),

    M("wrenchWhack", { name: "Wrench Whack", user: "piecer", kind: "strike", dice: 2, power: 12, anim: "attack", fx: "impact", text: "Two dice.", flavor: "Righty-tighty." }),
    M("cableDrop", { name: "Cable Drop", user: "piecer", kind: "tactic", dice: 2, tags: ["once"], cable: 2, anim: "cast", fx: "cable", text: "Once per battle: 2 Armed Pandas arrive by gondola from your nearest region.", flavor: "Special delivery." }),
    M("cutTheLine", { name: "Cut the Line", user: "piecer", kind: "tactic", dice: 2, cutLine: true, anim: "attack", fx: "cable", text: "Attacking: your retreat can't be chased. Defending: the invaders can't retreat or switch squads for 2 rounds.", flavor: "Nobody leaves until I say so." }),

    M("cardThrow", { name: "Card Throw", user: "josserkid", kind: "strike", dice: 3, power: 8, tags: ["ranged"], anim: "throw", fx: "cards", text: "Three dice from range.", flavor: "Pick a card. Any card. Ow." }),
    M("pickpocket", { name: "Pickpocket", user: "josserkid", kind: "tactic", dice: 2, steal: true, anim: "cast", fx: "cards", text: "Win a pair and steal an item from their bag (or a resource).", flavor: "Is this yours? Not any more." }),
    M("smokeAndMirrors", { name: "Smoke & Mirrors", user: "josserkid", kind: "tactic", dice: 2, decoy: true, anim: "cast", fx: "smoke", text: "This round, pairs you lose deal nothing: a decoy takes the hit.", flavor: "Wrong Josserkid." }),

    // Weapon moves (the weapon unlocks them for whoever carries it)
    M("skewer", { name: "Skewer", user: "weapon:bambooSpear", kind: "strike", dice: 2, power: 12, tags: ["pierce"], anim: "attack", fx: "slash", text: "Two dice that ignore their guard bonus and Fort.", flavor: "Through the gap in the shield." }),
    M("volley", { name: "Volley", user: "weapon:bambooBow", kind: "strike", dice: 3, power: 7, tags: ["ranged", "firstRound"], anim: "throw", fx: "arrows", text: "Three dice from range, +1 die in the first round.", flavor: "Loose!" }),
    M("stoneRain", { name: "Stone Rain", user: "weapon:sling", kind: "strike", dice: 2, power: 10, element: "stone", tags: ["ranged"], anim: "throw", fx: "rocks", text: "Two dice from range.", flavor: "Whirr, whirr, thock." }),
    M("sweep", { name: "Sweep", user: "weapon:ironGlaive", kind: "strike", dice: 3, power: 9, splashOn: "win", splash: 5, anim: "attack", fx: "slash", text: "Three dice. Win a pair and the squad behind them takes 5.", flavor: "A wide arc and a lot of apologies." }),
    M("shieldBash", { name: "Shield Bash", user: "weapon:towerShield", kind: "strike", dice: 2, power: 9, effects: [{ on: "win", to: "enemy", status: "staggered", turns: 1 }], anim: "attack", fx: "impact", text: "Two dice. Win a pair and they're Staggered.", flavor: "The best defence is a door to the face." }),
    M("dazzlePunch", { name: "Dazzle Punch", user: "weapon:gemKnuckles", kind: "strike", dice: 2, power: 13, effects: [{ on: "win", to: "enemy", status: "dazzled", turns: 1 }], anim: "attack", fx: "sparkle", text: "Two dice, heavy hits. Win a pair and they're Dazzled.", flavor: "They never saw it. It was too sparkly." }),
    M("boulderBarrage", { name: "Boulder Barrage", user: "army:catapult", kind: "strike", dice: 3, power: 14, tags: ["pierce", "reload", "ranged"], anim: "throw", fx: "rocks", text: "The catapult: three dice from range that ignore Forts. Reloads every other round.", flavor: "Special delivery, part two." }),
  ];
  const MOVE_BY_ID = Object.fromEntries(MOVES.map((m) => [m.id, m]));

  // ---- The Armory: each squad carries one weapon and one piece of armour; gear breaks after 3 battles ----
  const WEAPONS = {
    bambooSpear: { label: "Bamboo Spear", icon: "🎋", slot: "weapon", fits: ["panda", "armedPanda"], cost: { bamboo: 1, coin: 1 }, power: 2, move: "skewer", text: "+2 power on Strikes. Unlocks Skewer." },
    bambooBow: { label: "Bamboo Bow", icon: "🏹", slot: "weapon", fits: ["panda", "armedPanda", "cam"], cost: { bamboo: 2, coin: 1 }, move: "volley", text: "Unlocks Volley, a ranged opener." },
    gemArrows: { label: "Gem-Tipped Bow", icon: "💎", slot: "weapon", fits: ["panda", "armedPanda", "cam"], cost: { bamboo: 2, gems: 1, coin: 1 }, move: "volley", critOnBow: 5, text: "A bow with gem-tipped arrows: Volley crits on 5 or 6." },
    sling: { label: "Sling", icon: "🪨", slot: "weapon", fits: ["panda", "armedPanda", "nacam"], cost: { stone: 1 }, move: "stoneRain", text: "Unlocks Stone Rain, a cheap ranged attack." },
    ironGlaive: { label: "Iron Glaive", icon: "⚔️", slot: "weapon", fits: ["armedPanda", "cam"], cost: { iron: 2, coin: 1 }, atk: 1, move: "sweep", text: "+1 attack. Unlocks Sweep, which clips the squad behind." },
    spikedClub: { label: "Spiked Club", icon: "🏏", slot: "weapon", fits: ["nacam"], cost: { iron: 1, stone: 1 }, power: 3, doublesStagger: true, text: "+3 power on Strikes, and doubles Stagger the enemy." },
    gemKnuckles: { label: "Gem Knuckles", icon: "💍", slot: "weapon", fits: ["cam"], cost: { gems: 1, camCoin: 1 }, atk: 1, move: "dazzlePunch", text: "+1 attack. Unlocks Dazzle Punch." },
    ironHelm: { label: "Iron Helm", icon: "⛑️", slot: "armor", fits: ["panda", "armedPanda", "nacam", "cam"], cost: { iron: 1 }, def: 1, text: "+1 defence." },
    towerShield: { label: "Tower Shield", icon: "🛡️", slot: "armor", fits: ["panda", "armedPanda"], cost: { iron: 2, stone: 1 }, guardDice: 1, move: "shieldBash", text: "Guard moves roll +1 die. Unlocks Shield Bash." },
    catapult: { label: "Siege Catapult", icon: "🏗️", slot: "army", fits: [], cost: { stone: 3, iron: 1, coin: 2 }, move: "boulderBarrage", text: "One per army, attackers only. Any squad can fire Boulder Barrage. Ignores Forts." },
  };

  // ---- The Bag: power-ups bought at the Bank with resources ----
  // when: action (takes your turn; your squad rolls 1 guard die), prep (free, before the roll), reaction (free, after the roll).
  const ITEMS = {
    riceBall: { label: "Rice Ball", icon: "🍙", when: "action", cost: { rice: 1 }, heal: 10, text: "Heal 10: one fallen unit gets back up." },
    feast: { label: "Feast", icon: "🍱", when: "action", cost: { rice: 3 }, heal: 30, cure: true, text: "Heal 30 and cure every bad status on your side." },
    smokeBomb: { label: "Smoke Bomb", icon: "💨", when: "action", cost: { bamboo: 2 }, smoke: true, text: "The enemy rolls 1 fewer die next round, and your next retreat can't be chased." },
    caltrops: { label: "Caltrops", icon: "📌", when: "action", cost: { stone: 1, iron: 1 }, hazard: 6, text: "Every enemy squad that steps into the fight takes 6. Defenders can lay them in advance." },
    warDrums: { label: "War Drums", icon: "🥁", when: "action", cost: { coin: 2 }, cure: true, team: "hyped", text: "Cure Shaken, Charmed and Dazzled, and your side is Hyped next round." },
    mercHorn: { label: "Mercenary Horn", icon: "📯", when: "action", cost: { coin: 6 }, hire: 2, text: "Two NACAM ogres for hire join your army now." },
    bribe: { label: "Bribe", icon: "💰", when: "action", cost: { pandaCoin: 3 }, bribe: true, text: "Natives only. Roll a die: half that many natives (rounded up) lay down arms and go home." },
    whetstone: { label: "Whetstone", icon: "🔪", when: "prep", cost: { iron: 1 }, power: 4, text: "Before the roll: every pair you win this round deals +4." },
    gemFocus: { label: "Gem Focus", icon: "🔮", when: "prep", cost: { gems: 2 }, dice: 1, text: "Before the roll: +1 die this round." },
    luckyGem: { label: "Lucky Gem", icon: "💎", when: "reaction", cost: { gems: 1 }, reroll: 1, text: "After the roll: re-throw one of your dice." },
    blessing: { label: "Chance Cube Blessing", icon: "🎲", when: "reaction", cost: { gems: 2, pandaCoin: 1 }, winsTies: true, text: "After the roll: ties go to you this round. Blue, it's odd. Red, it's even. Today, it's yours." },
  };

  // ---- Statuses: set by one round, felt in the next ----
  const STATUSES = {
    staggered: { label: "Staggered", icon: "😵", good: false, text: "-1 die." },
    shaken: { label: "Shaken", icon: "😨", good: false, text: "-1 on every die." },
    charmed: { label: "Charmed", icon: "🥺", good: false, text: "Can't use Strikes." },
    dazzled: { label: "Dazzled", icon: "✨", good: false, text: "Can't crit, and ties go against you." },
    burning: { label: "Burning", icon: "🔥", good: false, text: "Loses 5 at the end of every round." },
    exposed: { label: "Exposed", icon: "🎯", good: false, text: "Pairs you lose hurt 50% more." },
    enraged: { label: "Enraged", icon: "😡", good: null, text: "+1 on every die, but pairs you lose hurt 50% more." },
    focused: { label: "Focused", icon: "🔎", good: true, text: "+1 die." },
    hyped: { label: "Hyped", icon: "📣", good: true, text: "+1 on every die." },
  };

  // ---- Terrain comes from the region's resource ----
  const TERRAIN = {
    bamboo: { label: "Bamboo Forest", icon: "🎋", element: "bamboo", rule: "ambush", text: "🎋 moves roll +1 die. Ambush: defenders roll +1 die in round 1." },
    stone: { label: "Stone Highlands", icon: "🪨", element: "stone", rule: "highGround", text: "🪨 moves roll +1 die. High ground: ranged moves deal +3." },
    iron: { label: "Iron Mines", icon: "⛓️", element: "iron", rule: "forge", text: "⛓️ moves roll +1 die. Forge: weapon power bonuses +1." },
    rice: { label: "Rice Paddies", icon: "🍚", element: "rice", rule: "mud", text: "🍚 moves roll +1 die and healing is 50% stronger. Mud: Brute strikes roll 1 fewer die." },
    gems: { label: "Gem Caves", icon: "💎", element: "gems", rule: "glitter", text: "💎 moves roll +1 die. Glitter: everyone crits on 5 or 6." },
  };

  const BUILDINGS = {
    fort: { label: "Fort", icon: "🏰", text: "Defenders get +1 on every die (as today), and their guard moves deal +2." },
    sanctuary: { label: "Panda Sanctuary", icon: "🏯", text: "Defending pandas can call a Cub Swarm once." },
    gym: { label: "CAM Gym", icon: "🏋️", text: "Defending CAMs start Focused." },
    market: { label: "Market", icon: "🏪", text: "The defender can buy Bag items mid-battle at Bank prices." },
  };

  // World events that already exist in the game, and what they do to battles.
  const EVENTS = {
    blight: { label: "Bamboo Blight", icon: "🍂", text: "🎋 moves and items can't be used." },
    gondolaStrike: { label: "Gondola Strike", icon: "🚫", text: "Nobody can retreat, and Cable Drop is grounded." },
    mercMarket: { label: "Mercenary Market", icon: "📯", text: "Hiring ogres mid-battle costs 1 🪙 less per ogre." },
    caseySale: { label: "Casey Sighting", icon: "🍺", text: "Casey's side builds Momentum twice as fast." },
  };

  // ---- Standing Orders: how your troops defend while you're away ----
  const DOCTRINES = {
    turtle: { label: "Hold the Walls", icon: "🐢", text: "Guard first, heal below half, never gamble.", weights: { guard: 7, strike: 0, tactic: 2, heal: 8, items: 0.6 } },
    counter: { label: "Counterpunch", icon: "🥊", text: "Strike when the dice favour it, guard when they don't, and switch to the squad that beats theirs.", weights: { guard: 2, strike: 3, tactic: 2, heal: 5, items: 0.8, switch: 1 } },
    allin: { label: "All In", icon: "🎲", text: "Biggest dice pools, signature moves early, Lucky Gems on every lost pair.", weights: { guard: -2, strike: 6, tactic: 0, heal: 2, items: 1.4, dice: 3 } },
    diplomat: { label: "Soft Power", icon: "🕊️", text: "Charm, Bribe and Ceasefire first. Fights only when cornered.", weights: { guard: 3, strike: 0, tactic: 7, heal: 5, items: 0.8 } },
    // Natives
    berserk: { label: "Berserk", icon: "😡", native: true, text: "The Ogre Nation: Rage, then the biggest swing available.", weights: { guard: -5, strike: 8, tactic: 3, heal: 0, items: 0 } },
    showboat: { label: "Showboat", icon: "✨", native: true, text: "The CAM Nation: Flex, pose, hype. Repeat.", weights: { guard: 4, strike: 4, tactic: 4, heal: 3, items: 0 } },
    skittish: { label: "Skittish", icon: "🐾", native: true, text: "Wild pandas: curl up and make big eyes.", weights: { guard: 6, strike: 1, tactic: 5, heal: 2, items: 0 } },
  };
  const NATIVE_DOCTRINE = { pandas: "turtle", nacams: "berserk", cams: "showboat", wild: "skittish" };
  const NATIVE_NAMES = { pandas: "the Panda Nation", nacams: "the NACAM Ogre Nation", cams: "the CAM Nation", wild: "the wild pandas" };

  const RULES = {
    // Guard moves: ties go to you, and pairs you lose hurt 25% less (Phalanx 40%, Bamboo Wall half).
    guardBrace: 0.75,
    // Attackers add their attack to every die and defenders their defence, exactly as today.
    // Attack pools are written for attackers. Defenders roll one die fewer from Strikes and Signatures
    // (never fewer than one): Risk's 3 attacking dice against 2 defending dice. Guards and Tactics roll as written.
    defenderDiceCut: 1,
    maxDice: 4,
    minDice: 1,
    critOn: 6,
    critMult: 1.5,
    momentumMax: 5,
    roundLimit: 20,
    retreatShot: { dice: 2, hitOn: 5, damage: 8 },
    enragedTaken: 1.5,
    rangedTaken: 0.85,
    switchDice: 2,
    itemDice: 1, // a squad busy with an item rolls one plain die
  };

  return { GOODS, TYPES, SUPER, RESIST, LEGEND_TAKEN, typeMult, UNITS, HEROES, MOVES, MOVE_BY_ID, WEAPONS, ITEMS, STATUSES, TERRAIN, BUILDINGS, EVENTS, DOCTRINES, NATIVE_DOCTRINE, NATIVE_NAMES, RULES };
})();
