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
    title: "Release notes",
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
