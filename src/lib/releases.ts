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
    title: "A clearer turn: the Actions menu",
    notes: [
      "Your turn starts with one question: What do you want to do? The 🎯 Actions menu lists Attack, Move troops, Build, Recruit, Heroes, Diplomacy, Bank and End turn, and says what each can do for you right now. It takes over from the Plan, Region, Build, Heroes, Kirds and Bank tabs, so everything is in one place.",
      "Every action walks you through it a step at a time (Attack: target, where from, who goes, confirm), with a step bar you can tap to go back. Before you confirm you see exactly what will happen, what it costs and what you'll have left.",
      "Every action ends with a result screen showing what changed, and the map lights up where it happened. Capture a region and the result screen offers to rename it there and then.",
      "Build is one tap from the menu: pick a building by its picture, and see-through ones float over every region it could go in. Confirm, and it rises out of the ground.",
      "🚡 Move troops next to End turn, and dragging an army on the globe, open the same steps. The globe rings every choice: gold for your regions, blue for your land, red to invade (with your chance to win), and dashed where a gondola line has to go first. A glowing arrow shows the move or attack you're planning.",
      "Fixed: clicking from one of your regions to another sometimes kept showing the first one. A click on a region now always opens its page: who holds it, its troops and how many are ready, what it pays, what protects it, what's next door, and what you can do there. Rename land you conquered from its page too.",
      "Your land lists every region you hold with its troops, how many are ready to move and which are at risk. Tap one to fly there, or use ‹ › on a region's page to hop between yours. On the globe your regions wear name tags, with a green dot when troops there are ready.",
      "End turn shows what you haven't used yet (ready troops, attacks you could make, offers waiting) and what you'll collect next turn, including any ogres you can't pay.",
      "The Kirds' Tribunal sits at the top of 🤝 Diplomacy, and the ⚖️ notes under your goods take you straight there. Attack steps show what an invasion will do to your 🩸 Bloodthirst, with a ⚖️ on any that would put you on trial, and anything a war crimes sentence forbids is greyed out with the reason.",
      "A new 🗺️ Map key explains every colour, ring and marker.",
      "Fixed: your chance to win is the same number in the attack list, on the map while you drag, and when you pick who goes.",
      "Fixed: on phones, the buttons at the top of a game no longer land on top of your goods.",
    ],
  },
  {
    date: "2026-09-26",
    title: "War crimes and the Kirds' Tribunal",
    notes: [
      "Attack other Kirds too often and the rest of the world can put you on trial for war crimes. Every Kird has a 🩸 Bloodthirst meter: each invasion of another Kird's land, or Thunder on it, adds 1 (2 if they hold less than half as many regions as you), and it counts for 3 rounds.",
      "Reach 4 and the Kirds' Tribunal opens a trial. Everyone else votes Guilty or Not guilty in the Kirds tab, in secret, any time before the accused's next turn. Trials need at least 3 Kirds in the world.",
      "Each guilty vote picks a punishment: a Ceasefire, an Arms embargo, a Gondola ban, Trade sanctions or Heroes on strike. A guilty verdict imposes every one picked for 3 turns (longer for repeat offenders), and attacking a war criminal is no crime until they've served it.",
      "Fighting back is fair: every attack you suffer earns you one free strike back at the attacker. Attacking the Kird about to win never counts either.",
      "Before you invade, the game shows what the attack will do to your Bloodthirst and warns you if it will put you on trial. The Army tab shows your meter and when each attack stops counting.",
      "Computer players, and anyone on autopilot, sit on juries and vote with their interests, and a generous trade can buy their vote. On trial themselves, they may send you a gift. Hard ones count the votes before they cross the line.",
      "Computer players take their turns faster when armies grow huge.",
    ],
  },
  {
    date: "2026-09-26",
    title: "Buildings you can see, troops you can drag",
    pr: 15,
    notes: [
      "Buildings stand on the globe as little 3D models, each with a pin showing its icon: a pagoda with a panda in its bamboo, a gym with a giant barbell on the roof, a striped market stall, and stone walls round the whole region for a fort.",
      "A new 🏗️ Build tab lists every building with what it does, what it costs and where you already have one. Pick one, tap a glowing region, and watch it rise out of the ground.",
      "Troops are easy to spot. Zoomed out, each army is one big figure with a badge showing how many are there. Zoom in and you see the squad itself, mixed like the real army: pandas with bamboo, armed pandas in tin helmets, club-swinging ogres and flexing CAMs.",
      "Drag your troops to move them: on your turn, grab an army and drop it on a glowing region it can reach by gondola. The move bar opens ready to choose who goes, with your chance to win if it's an invasion.",
      "The camera leans in as you zoom, so you see everything from the side. Each hex's number now sits at its front tip, where nothing can hide it, flags fly from the back of the hex, and gondola cables leave from a mast so they pass over the buildings.",
      "Battle replays use the new figures.",
    ],
  },
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
