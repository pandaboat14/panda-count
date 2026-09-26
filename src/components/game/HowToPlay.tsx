"use client";

import { useEffect, useRef } from "react";
import { DOCTRINES, TYPES, UNITS as FIGHTERS, RULES as BATTLE_RULES } from "@/game/battle/codex";
import { PLAYER_DOCTRINES } from "@/game/engine";
import {
  BLOODTHIRST_ROUNDS,
  BUILDINGS,
  BUILDING_TYPES,
  GEAR_BATTLES,
  HEROES,
  HERO_IDS,
  REPEAT_OFFENDER_TURNS,
  SANCTIONS,
  SANCTION_INFO,
  SENTENCE_TURNS,
  TRIAL_AT,
  TRIAL_MIN_KIRDS,
  UNITS,
  UNIT_TYPES,
} from "@/game/rules";

// "a, b, c or d"
const listOr = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="help-dialog" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <article>
        <button className="close" onClick={onClose} aria-label="Close">&times;</button>
        <h2>How to play Panda Diplomacy</h2>
        <p>
          It&rsquo;s Risk meets Catan on a 3D globe. Grow your empire, make friends, betray them, and chase Casey.{" "}
          <strong>How you win</strong> is picked when the world starts: hold 25 or 30 regions, or play an <strong>Endless</strong>{" "}
          world that never stops. Reaching the goal sounds the alarm: you win only if you still hold it when your next turn starts, so
          everyone gets one last round to stop you. Expect a long war, like Risk or Catan.
        </p>
        <p>
          <strong>Stuck?</strong> Open the <strong>💡 Plan</strong> tab and ask Sun Tzu. On your turn he suggests your best next moves
          (with a saying or two), and one tap does them. Your first big choice is where to build your first gondola line.
        </p>
        <h3>Your turn</h3>
        <ol>
          <li>
            <strong>Dice &amp; harvest.</strong> You throw your two dice onto the world map: tap them, or flick them. Every
            region you hold gives you 1 of its resource. Then the dice pay out, Catan-style: every
            region with that number pays its owner one more, and the dice tell you what everyone collected (tap the 🎲 up top to
            watch the last roll again). Roll a 7 and <strong>ogres raid</strong>: anyone holding more than 9 resource
            cards loses half.
          </li>
          <li>
            <strong>Income.</strong> 2 🪙 per region (+2 per Market), 1 🐼 per 3 pandas (+2 per Sanctuary, +1 per loaned panda), 1 💪 per
            CAM Gym. NACAM ogres cost 1 🪙 upkeep each or they desert.
          </li>
          <li>
            <strong>Ogre quarry.</strong> Each NACAM ogre you own has a 1 in 3 chance to haul in 1 🪨 Stone (up to 3 a turn), so the more
            ogres you keep, the more Stone turns up. Stone also comes from stone regions and from the Bank.
          </li>
          <li>
            <strong>The World Bank</strong> sells any resource for 3 🪙 (2 🪙 once you own a Market), swaps resources 4 for 1 (3 with a
            Market, 2 with Ping), and changes currencies. Its 🎒 Bag and 🛡️ Armory shelves sell power-ups and gear for battle. Any button
            you&rsquo;re short for offers to buy what&rsquo;s missing first.
          </li>
          <li>
            <strong>Do anything, in any order:</strong> build gondolas, recruit, build, move troops and invade (tap 🚡 Move troops), trade,
            hire heroes, loan pandas, stock your Bag, kit out your troops, and give your regions Standing Orders.
          </li>
          <li>Hit <strong>End turn</strong>. The next Kird gets a replay of everything they&rsquo;re allowed to see.</li>
        </ol>
        <p>
          Not sure what a 🎋 or 💪 is? Tap <strong>▾ What are these?</strong> under your goods for how to earn each one and what it buys.
        </p>
        <h3>🤖 Computer players</h3>
        <p>
          Play alone or fill empty seats with computer Kirds when you start a world. <strong>Easy</strong> ones are timid,{" "}
          <strong>Medium</strong> ones build a steady economy and pick good fights, and <strong>Hard</strong> ones simulate every battle
          before they commit, hire heroes and gang up on people. They play the moment your turn ends, and each of their moves stays on screen
          for 8 seconds (tap ▶ to move on, or Skip all). They answer your trade, pact and loan offers on their turn.
        </p>
        <h3>🚩 Your land</h3>
        <p>
          Every region you hold flies your flag (your colour with a white star, on a gold pole) and wears a thick glowing border in your
          colour. Other Kirds&rsquo; flags carry their initial. Tap <strong>Your land</strong> under your goods to visit your regions one by
          one.
        </p>
        <h3>🚡 Moving troops</h3>
        <p>
          Urban gondolas are the <strong>only</strong> way to move troops. Build a line from one of your regions to a neighbour, then send
          troops along it: into your own land to reinforce, or into anyone else&rsquo;s to invade.
        </p>
        <ol>
          <li>
            <strong>Start:</strong> tap <strong>🚡 Move troops</strong> next to End turn (or <strong>Move troops from here</strong> in a
            region&rsquo;s panel).
          </li>
          <li>
            <strong>From:</strong> tap one of your regions. Gold rings show the ones with troops ready to go.
          </li>
          <li>
            <strong>To:</strong> tap a ringed neighbour. Blue is your own land, red is an invasion, with your chance to win. A dashed ring
            needs a gondola line first, and one tap builds it.
          </li>
          <li>
            <strong>Who goes:</strong> pick the troops, then press Send or Invade.
          </li>
          <li>
            <strong>Stop:</strong> tap <strong>✕ Stop moving</strong> (or press Esc) when you&rsquo;re done.
          </li>
        </ol>
        <p>Units can ride one line per turn, and fresh recruits rest until next turn.</p>
        <p>
          <strong>Or drag them:</strong> on your turn, grab one of your armies on the globe and drop it on a ringed region it can reach.
          The move bar opens at <strong>Who goes</strong>, with everyone who&rsquo;s ready picked and your chance to win if it&rsquo;s an
          invasion.
        </p>
        <h3>✏️ Renaming what you conquer</h3>
        <p>
          Conquerors name what they take. When you capture a region you&rsquo;re offered the chance to rename it, or keep its name, and you
          can rename it again from its panel for as long as you hold it. Names are public, so everyone sees them, even through the fog, and
          whoever takes the region next can rename it in turn. The land you start with wasn&rsquo;t conquered, so it keeps its name.
        </p>
        <h3>⚔️ Battles</h3>
        <p>
          Invade a region with defenders and a battle starts, fought round by round like a Pokémon duel. Before you invade, the game shows
          your <strong>chance to win</strong> and the losses to expect.
        </p>
        <ul>
          <li>
            <strong>Each round</strong> both sides pick a move: a Strike, a Guard, a Tactic, a Bag item, or a switch to another squad. One
            squad fights at a time while the rest wait behind it.
          </li>
          <li>
            <strong>The dice pair off, highest against highest.</strong> Attackers add their attack to every die and defenders their defence;
            heroes and Forts add more. The higher total wins the pair, and <strong>ties go to the defender</strong>. Every pair you win hurts
            their squad, and a winning {BATTLE_RULES.critOn} is a crit that hits harder still.
          </li>
          <li>
            <strong>Types:</strong> Fluff 🐼 beats Glam 💪, Glam beats Brute 👹, Brute beats Steel 🛡️, and Steel beats Fluff. Heroes are
            Legends, tough against everything.
          </li>
          <li>
            <strong>Momentum:</strong> every pair you win builds it. At {BATTLE_RULES.momentumMax}, your squad&rsquo;s Signature move is ready.
          </li>
          <li>
            <strong>Retreat</strong> if it goes badly, or let <strong>Sun Tzu</strong> fight the rest for you (ending your turn mid-battle
            does too). Win and the region, its buildings and any heroes there are yours (heroes flee, but Casey gets captured).
          </li>
        </ul>
        <p>
          Open the <strong>⚔️ Army</strong> tab to see all your troops, where they are and which regions are at risk, your battle record, how
          battles work in full, and a calculator to try any fight before you pick it.
        </p>
        <h3>🎒 The Bag, 🛡️ the Armory and 📜 Standing Orders</h3>
        <ul>
          <li>
            <strong>The Bag</strong> (🏦 Bank → 🎒 Bag) holds power-ups you buy with resources, like Rice Balls, Smoke Bombs and Lucky Gems.
            Some take your squad&rsquo;s turn; others are free, before or after the dice.
          </li>
          <li>
            <strong>The Armory</strong> (🏦 Bank → 🛡️ Armory) gives every unit of one type a weapon and a piece of armour, wherever they
            are. Gear lasts {GEAR_BATTLES} battles. A Siege Catapult rolls out with your invasions and ignores Forts.
          </li>
          <li>
            <strong>Standing Orders:</strong> you&rsquo;re rarely online when someone invades, so your troops fight by your orders. Pick a
            default doctrine in the ⚔️ Army tab ({listOr(PLAYER_DOCTRINES.map((d) => `${DOCTRINES[d].icon} ${DOCTRINES[d].label}`))}), then
            fine-tune any region in its panel: a doctrine of its own, who meets invaders first, how many Bag items they may use, and caltrops
            laid in advance.
          </li>
        </ul>
        <h3>Units</h3>
        <ul>
          {UNIT_TYPES.map((t) => (
            <li key={t}>
              {UNITS[t].icon} <strong>{UNITS[t].label}</strong> ({TYPES[FIGHTERS[t].type].label}, atk +{UNITS[t].attack}, def +{UNITS[t].defense}):{" "}
              {UNITS[t].blurb}
            </li>
          ))}
        </ul>
        <h3>Buildings</h3>
        <p>
          Open the <strong>🏗️ Build</strong> tab: pick a building, tap one of your glowing regions, and it goes up on the globe. Each region
          holds one of each.
        </p>
        <ul>
          {BUILDING_TYPES.map((b) => (
            <li key={b}>
              {BUILDINGS[b].icon} <strong>{BUILDINGS[b].label}</strong>: {BUILDINGS[b].blurb}
            </li>
          ))}
        </ul>
        <h3>🦸 Heroes (one of each in the world)</h3>
        <ul>
          {HERO_IDS.map((h) => (
            <li key={h}>
              {HEROES[h].icon} <strong>{HEROES[h].name}</strong>, {HEROES[h].title}: {HEROES[h].power}
            </li>
          ))}
        </ul>
        <h3>🐼🤝 Panda diplomacy</h3>
        <p>
          Offer a pact, trade anything, or loan pandas: loaned pandas pay both of you PandaCoin every turn and seal a pact. You can&rsquo;t
          invade someone you have a pact with. You can break it, but you&rsquo;ll be an Oathbreaker (half PandaCoin for 3 rounds) and
          everyone will know.
        </p>
        <h3>⚖️ War crimes</h3>
        <p>
          Attack other Kirds too often and the rest of the world can put you on trial. (The Tribunal needs a jury, so it only sits in worlds
          with {TRIAL_MIN_KIRDS} or more Kirds.)
        </p>
        <ul>
          <li>
            <strong>🩸 Bloodthirst.</strong> Every invasion of another Kird&rsquo;s land, and every Thunder on it, adds 1 to your Bloodthirst,
            or 2 if they hold less than half as many regions as you. Attacks count for {BLOODTHIRST_ROUNDS} rounds, and everyone can see
            everyone&rsquo;s meter. Some attacks don&rsquo;t count: hitting back once for every attack you suffered (an eye for an eye),
            attacking the Kird about to win, and attacking a convicted war criminal. Natives never count.
          </li>
          <li>
            <strong>⚖️ The trial.</strong> Reach {TRIAL_AT} and you&rsquo;re on trial. Everyone else votes Guilty or Not guilty in the 🤝 Kirds
            tab, whenever they like, before your next turn starts; the verdict comes early once they all have. Ballots are secret and can
            be changed until the verdict. Most votes wins, and a tie or an empty ballot box means Not guilty. Attacks you make while on
            trial are added to the charges. Whatever the verdict, it wipes your Bloodthirst clean.
          </li>
          <li>
            <strong>☠️ The sentence.</strong> Each juror who votes Guilty picks one punishment, and a guilty verdict imposes every one they
            picked, for {SENTENCE_TURNS} of your turns ({REPEAT_OFFENDER_TURNS} more for each earlier conviction). Until it&rsquo;s served,
            attacking you is no crime.
            <ul>
              {SANCTIONS.map((k) => (
                <li key={k}>
                  {SANCTION_INFO[k].icon} <strong>{SANCTION_INFO[k].label}</strong>: {SANCTION_INFO[k].blurb}
                </li>
              ))}
            </ul>
          </li>
          <li>
            <strong>🤝 Politics.</strong> On trial? Plead your case in chat, lean on your pact partners, or sweeten a juror with a generous
            trade. Computer jurors can be bought, and hard ones stick up for fellow machines. The ballot is secret, though, so a bribe is a
            gamble.
          </li>
        </ul>
        <h3>🌍 The world fights back</h3>
        <p>
          The Panda Nation guards Sichuan and Qinling, the NACAM Ogre Nation holds the cold and empty places, and the CAM Nation owns the
          beaches. They regrow over time, but only up to a limit, so they never outgrow you. Every round a world event shakes things up. Lose everything and you get Panda Asylum somewhere new.
          No one ever wins. Everyone keeps playing.
        </p>
        <h3>☁️ Fog of war</h3>
        <p>You see your regions, their neighbours, and the ends of your gondola lines. Everything else is cloud.</p>
        <h3>💬 Chat, log and leaving</h3>
        <p>
          Talk to everyone in the Chat tab, or pick one Kird to message privately. The Log tab keeps every event in the world, and you can
          ▶ watch any battle again. Pick your face under ⋯ → Your avatar. Leaving a world turns your lands wild.
        </p>
        <h3>🤖 Autopilot</h3>
        <p>
          Going somewhere without WiFi? Pick <strong>Autopilot</strong> in a game&rsquo;s ⋯ menu (careful or aggressive), or{" "}
          <strong>Autopilot all my games</strong> in the lobby. The computer plays your turns until you take back command, and leaves you
          a recap of each one, including how it voted in any war crimes trial. If every person in a world is on autopilot, the world waits.
        </p>
        <h3>💾 Saving and finishing</h3>
        <p>
          Every move saves the moment you make it, so close the tab whenever you like: your worlds wait for you under{" "}
          <strong>In progress</strong> in the lobby. When the host ends a world it moves to <strong>Complete</strong> with the final standings
          (most regions wins), and you can still look around it.
        </p>
      </article>
    </dialog>
  );
}
