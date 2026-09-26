// What computer Kirds say back in chat. Canned, but in character: easy bots are sweet, hard bots are smug.
import type { BotLevel } from "./engine";

type Mood = "pact" | "trade" | "threat" | "hello" | "praise" | "question" | "other";

const LINES: Record<BotLevel, Record<Mood, string[]>> = {
  easy: {
    pact: ["A pact? Yes please! 🤝 Send it over in the Kirds tab and I'll sign on my turn.", "Friends forever! Well, until the next Ogre Raid. Offer me a pact."],
    trade: ["I love a deal. Put an offer together in the Kirds tab and I'll look at it on my turn.", "Trading? Sure! Be gentle, I'm new at this."],
    threat: ["Please don't invade me, I only just unpacked. 🥺", "Eek. I'll build a fort. Probably. Eventually."],
    hello: ["Hi hi! 🐼", "Hello, fellow Kird! Lovely weather for gondolas."],
    praise: ["Aw, thank you! You're doing great too.", "Stop, I'm blushing. 🐼"],
    question: ["Hmm, good question. I'm mostly here for the pandas.", "I'd tell you, but I honestly don't know either."],
    other: ["Nice! 🐼", "The pandas agree with you.", "I'm just happy to be here."],
  },
  medium: {
    pact: ["A pact could suit us both. Offer one in the Kirds tab and I'll weigh it on my turn.", "Peace is profitable. Make me an offer."],
    trade: ["Everything has a price. Send a trade through the Kirds tab.", "I'll trade if the numbers work. Make it worth my while."],
    threat: ["Bold words. My gondolas are already moving.", "Try it. My ogres haven't been paid in a while and they're cranky."],
    hello: ["Greetings, Kird.", "Hello. Keep your pandas where I can see them."],
    praise: ["Thanks. You're not bad yourself.", "Noted. I'll still invade you if it pays."],
    question: ["That's classified.", "Ask me again after the next world event."],
    other: ["Interesting.", "The dice will decide.", "Mm. I'm busy counting Coin."],
  },
  hard: {
    pact: ["A pact with me? Show me you're worth protecting. Offer it in the Kirds tab.", "I sign pacts with the strong. Are you strong?"],
    trade: ["You need my goods more than I need yours. Make me a generous offer.", "Trade? Fine. But I always win the trade."],
    threat: ["Cute. I've already simulated this battle forty times. You lose.", "Come at me. Casey's on my wishlist, and you're in the way."],
    hello: ["Ah, my next region says hello.", "Hello. I've been expecting you."],
    praise: ["I know.", "Flattery won't save your borders."],
    question: ["Everything I do is optimal. That's the answer.", "Watch the map. You'll figure it out."],
    other: ["Noted. And ignored.", "Every turn you talk, I build another gondola.", "The world will be mine. Nothing personal."],
  },
};

function moodOf(text: string): Mood {
  const t = text.toLowerCase();
  if (/\b(pact|peace|ally|alliance|friends?|truce|treaty)\b/.test(t)) return "pact";
  if (/\b(trade|deal|swap|buy|sell|offer|loan)\b/.test(t)) return "trade";
  if (/\b(attack|invade|war|destroy|crush|kill|die|coming for|revenge)\b/.test(t)) return "threat";
  if (/\b(hi|hey|hello|yo|sup|howdy|greetings)\b/.test(t)) return "hello";
  if (/\b(nice|good|great|love|gg|well played|thanks|thank you)\b/.test(t)) return "praise";
  if (t.includes("?")) return "question";
  return "other";
}

export function botReply(level: BotLevel, text: string, rand: () => number) {
  const lines = LINES[level][moodOf(text)];
  return lines[Math.floor(rand() * lines.length)];
}
