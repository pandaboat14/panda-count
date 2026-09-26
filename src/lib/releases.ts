// Release notes shown at /releases, newest first. Every PR that changes what people see adds an entry at the top.
export type Release = {
  date: string; // YYYY-MM-DD, the day it went live
  title: string;
  pr?: number;
  notes: string[];
};

export const RELEASES: Release[] = [
  {
    date: "2026-09-27",
    title: "A game you can actually win",
    pr: 8,
    notes: [
      "Pick how long a world lasts: first to 10, 15 or 20 regions wins, or play Endless. A race bar shows how close everyone is.",
      "New 💡 Plan tab: on your turn it suggests your best next moves, and one tap does them.",
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
