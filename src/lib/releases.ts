// Release notes shown at /releases, newest first. Every PR that changes what people see adds an entry at the top.
export type Release = {
  date: string; // YYYY-MM-DD, the day it went live
  title: string;
  pr?: number;
  notes: string[];
};

export const RELEASES: Release[] = [
  {
    date: "2026-09-26",
    title: "Plant your flag",
    notes: [
      "Your land is unmistakable now: every region you hold flies your flag (your colour with a white star) and glows with a thick border in your colour. Other Kirds' flags carry their initial.",
      "Tap \"Your land\" under your goods to fly around your regions one by one.",
      "Conquerors rename what they take. When you capture a region, give it a new name or keep the old one, and rename it again from its panel while you hold it. Everyone sees the new name, and the old one is shown underneath.",
      "Moving troops has a clear start and finish: tap 🚡 Move troops next to End turn, pick one of your regions, pick where to send them, choose who goes, and send. ✕ Stop moving (or Esc) ends it.",
      "While you move, the map rings every choice: gold for your regions with troops ready, blue for your own land, red for invasions with your chance to win, and a dashed ring where you'd need a gondola first, one tap away.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Throw your dice onto the map",
    pr: 14,
    notes: [
      "At the start of your turn your two dice hover over a tabletop world map in your colour. Tap them, or press and drag to flick them, and they bounce across the map before landing on your roll.",
      "The regions with the number you rolled light up, and their resources fly into each Kird's purse at the edge of the table.",
      "Then it tells you exactly what you got, from the dice and from your turn's harvest and income, and what everyone else got.",
      "Roll a 7 and an ogre stomps onto the map: anyone holding more than 9 resource cards loses half. If the ogres raid you, you now see exactly what they took.",
      "Tap the 🎲 up top to watch the last roll again: everyone sees the same throw land on the same numbers. Resources from land hidden in the fog rise out of the fog, so nothing gives away who holds what.",
      "The dice clack as they land. Tap 🔊 in the pop-up to turn the sound off.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Autopilot",
    pr: 13,
    notes: [
      "Going offline? Switch on 🤖 Autopilot from a game's ⋯ menu, or put every game on autopilot at once from the lobby. The computer plays your turns (careful or aggressive, your choice) until you take back command.",
      "Autopilot answers offers, builds, recruits and attacks for you, and leaves you a private recap of each turn. Your \"since your last turn\" replay waits for you, so you can catch up on everything when you're back.",
      "Everyone can see who is on autopilot. A game where every person is on autopilot waits for someone to come back.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Hex numbers the right way up",
    notes: [
      "Fixed: many hexes on the map showed their number upside down or sideways, so a 6 could pass for a 9. Every number now reads the right way up.",
      "Every hex is laid out the same way now, with its army on the right and its buildings on the left.",
    ],
  },
  {
    date: "2026-09-26",
    title: "The Army tab",
    pr: 10,
    notes: [
      "A new ⚔️ Army tab shows everything you command: how many of each unit you have, how many are ready to move, and what each one is good at.",
      "See where your troops are, region by region, with a warning when a neighbour could take one (and their chance of doing it). Tap a region to manage it.",
      "Your heroes, where they stand and what they add in battle.",
      "How battles are won, explained step by step, plus a calculator to try any matchup before you fight.",
      "Your battle record: every fight you attacked or defended, won or lost, what each side lost, and ▶ Watch to replay it.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Chat works again in Chrome",
    pr: 11,
    notes: [
      "Fixed: in the latest Chrome and Edge, chat crashed the game to a blank page when a message was sent or arrived, when you switched conversations, or when you left the Chat tab.",
    ],
  },
  {
    date: "2026-09-26",
    title: "A longer war, and the chance cubes",
    pr: 9,
    notes: [
      "Games last longer, like Risk or Catan: hold 25 or 30 regions to win (or play Endless). The quick 10 and 15 region games are gone.",
      "Reaching the goal no longer wins on the spot. Everyone is warned, and you win only if you still hold it when your next turn starts, so the others get one last round to stop you.",
      "No more free gondola at the start: choosing where to build your first line is the opening move. Sun Tzu will still point you somewhere good.",
      "The dice roll on screen as two 3D chance cubes at the start of your turn, then tell you what they did. Tap the 🎲 up top to watch the last roll again.",
      "On phones the actions panel sits lower, and you can minimise it to study the map, then bring it back with ▴ Actions.",
      "Computer players now gang up on whoever is one round from winning.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Sun Tzu, and a game you can actually win",
    pr: 8,
    notes: [
      "Pick how long a world lasts: first to 10, 15 or 20 regions wins, or play Endless. A race bar shows how close everyone is.",
      "Meet your advisor, Sun Tzu. The new 💡 Plan tab suggests your best next moves in his (mostly real) words, and one tap does them.",
      "See your chance to win before you invade, and the losses to expect.",
      "The World Bank now sells any resource for 3 🪙 (2 with a Market). Short on something? Buttons offer to buy what's missing and do the action in one tap.",
      "Every Kird starts with a gondola line to a weak neighbour, so your first invasion is ready on turn one.",
      "Native armies stop growing at a limit, so the regions around you can't outgrow you forever.",
      "Computer players buy what they need, propose pacts and trades, withdraw old offers, and answer you in chat.",
      "Fixed: private chat messages to computer players failed with an error.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Computer players, Stone from ogres and fewer errors",
    pr: 7,
    notes: [
      "Play Panda Diplomacy against the computer. When you start a world, list each player as Human or Computer, and give each computer player Easy, Medium or Hard difficulty.",
      "Computer players take their turns as soon as yours ends, and each of their moves stays on screen for at least 8 seconds so you can read it.",
      "NACAM ogres now quarry 🪨 Stone: each ogre has a 1 in 3 chance to bring 1 Stone at the start of your turn, so more ogres means more Stone. The rules explain it.",
      "Tap \"What are these?\" under your goods for a key to every resource and currency: how to earn it and what it buys.",
      "Fixed the errors that popped up while using the Bank and switching between panels, caused by sign-in checks expiring mid-game.",
      "Every move is saved as you make it. Your games are listed as In progress or Complete, and ending a game keeps it, with final standings.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Release notes",
    pr: 6,
    notes: ["This page. Every update to Panda Count now gets a note here, linked from the bottom of each page."],
  },
  {
    date: "2026-09-25",
    title: "Chat, battle replays and avatars",
    pr: 5,
    notes: [
      "Panda Diplomacy has chat. Talk to everyone in a world, or message one Kird privately.",
      "Battles play out in 3D with the real dice, round by round. Watch any battle again from the log.",
      "The log keeps every event since the world began, with filters for battles, diplomacy, world events and your own moves.",
      "Pick an avatar (panda, red panda, ogre, CAM, Norse god or gondola) from the user menu.",
      "Leave a world, or end it if you're the host. Solo players can wrap up a game and start fresh.",
      "Fixed password reset links, which pointed to the wrong site.",
    ],
  },
  {
    date: "2026-09-25",
    title: "Turn emails",
    pr: 4,
    notes: ["Panda Diplomacy can email you when it's your turn. Turn it off any time from the game."],
  },
  {
    date: "2026-09-25",
    title: "Panda Diplomacy",
    pr: 4,
    notes: [
      "The Kirds' never-ending 3D strategy game on a globe of real regions.",
      "Recruit pandas, NACAM ogres and CAMs. Hire heroes: Ping, Cock Penis, Casey the Norse God, The Piecer Captain and The Josserkid.",
      "Urban gondolas are the only way to move troops. Earn coin, PandaCoin and CamCoin. Fog of war hides what you can't see.",
      "Invite friends with a link, take turns one at a time, and replay everything that happened since your last turn.",
    ],
  },
  {
    date: "2026-09-25",
    title: "The World globe",
    pr: 3,
    notes: ["A new World tab: a 3D globe of every giant panda on Earth, with wild ranges in China and zoos outside the US."],
  },
  {
    date: "2026-09-25",
    title: "Panda Count in 3D",
    pr: 1,
    notes: [
      "Panda Count was rebuilt as a 3D app, with a trading card for every giant panda in the United States.",
      "Sign in to add and edit pandas.",
      "Now served from pandacount.net.",
    ],
  },
];
