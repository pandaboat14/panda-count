// The advisor is Sun Tzu. Real lines from The Art of War (Lionel Giles' public-domain translation, lightly trimmed)
// mixed with some he "definitely also said" about pandas, gondolas and ogres.
import type { Suggestion } from "./advisor";

type Kind = "attack" | "line" | "recruit" | "ogre" | "market" | "offers" | "raid" | "end" | "welcome" | "waiting" | "opening";

const QUOTES: Record<Kind, string[]> = {
  attack: [
    "The victorious warrior wins first, and then goes to war.",
    "Let your plans be dark as night, and when you move, fall like a thunderbolt.",
    "Opportunities multiply as they are seized.",
    "Attack where the enemy is unprepared; appear where you are not expected.",
    "He who knows when to fight and when not to fight will be victorious.",
  ],
  line: [
    "He who builds the gondola first, rides it first.",
    "The road you have not built cannot carry your army.",
    "Swiftness is the essence of war. So is a good cable.",
  ],
  recruit: [
    "An army marches on its bamboo.",
    "Numbers alone confer no advantage. But they do help.",
    "Raise your pandas in peace, so they need not be raised in haste.",
  ],
  ogre: [
    "An ogre fed today is a rock hauled tomorrow.",
    "Hire the ugly ones. They fight as if they have something to prove.",
  ],
  market: [
    "A market in peace is worth ten forts in war.",
    "The wise general makes coin while the foolish one counts his ogres.",
  ],
  offers: [
    "The supreme art of war is to subdue the enemy without fighting.",
    "Answer your letters, lest your friends become your enemies.",
    "Keep your friends close, and your panda loans closer.",
  ],
  raid: [
    "The general who hoards his bamboo feeds the ogres of the seventh roll.",
    "Treasure unspent is treasure for the raiders.",
  ],
  end: [
    "Victory comes from finding opportunities in problems. Today there are none: rest.",
    "He will win who knows when to wait. End your turn.",
    "Be still as a mountain. Then press End turn.",
  ],
  welcome: [
    "Every battle is won before it is fought. Yours begins now.",
    "The journey of a thousand regions begins with a single gondola.",
  ],
  opening: [
    "Know the enemy and know yourself, and you need not fear the result of a hundred battles.",
    "In the midst of chaos, there is also opportunity.",
    "All warfare is based on deception. Also on gondolas.",
    "Appear weak when you are strong, and strong when you are weak.",
  ],
  waiting: [
    "Patience. The enemy reveals himself to those who wait.",
    "While others move, study the map.",
  ],
};

function kindOf(t: Suggestion): Kind {
  if (t.plan) return "attack";
  if (t.id.startsWith("line-")) return "line";
  if (t.id === "recruit-ogre") return "ogre";
  if (t.id === "recruit") return "recruit";
  if (t.id === "market") return "market";
  if (t.id === "offers") return "offers";
  if (t.id === "raid") return "raid";
  return "end";
}

// Stable within a turn (no flicker as the view refreshes), different from turn to turn.
function pickQuote(kind: Kind, salt: number) {
  const list = QUOTES[kind];
  return list[((salt % list.length) + list.length) % list.length];
}

export function sunTzuSays(t: Suggestion, turn: number, index: number) {
  return pickQuote(kindOf(t), turn + index * 7);
}

export function sunTzuOpening(turn: number, firstTurn: boolean, myTurn: boolean) {
  return pickQuote(firstTurn ? "welcome" : myTurn ? "opening" : "waiting", turn);
}

export const SUN_TZU_QUOTES = QUOTES;
