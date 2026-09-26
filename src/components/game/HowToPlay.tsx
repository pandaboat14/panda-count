"use client";

import { useEffect, useRef } from "react";
import { BUILDINGS, BUILDING_TYPES, HEROES, HERO_IDS, UNITS, UNIT_TYPES } from "@/game/rules";

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
            <strong>Dice &amp; harvest.</strong> The chance cubes roll on screen (tap the 🎲 up top to watch the last roll again). Every
            region you hold gives you 1 of its resource. Then the dice pay out, Catan-style: every
            region with that number pays its owner one more. Roll a 7 and <strong>ogres raid</strong>: anyone holding more than 9 resource
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
            Market, 2 with Ping), and changes currencies. Any button you&rsquo;re short for offers to buy what&rsquo;s missing first.
          </li>
          <li>
            <strong>Do anything, in any order:</strong> build gondolas, recruit, build, move, invade, trade, hire heroes, loan pandas.
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
        <h3>🚡 Urban gondolas</h3>
        <p>
          The <strong>only</strong> way to move troops. Build a line from one of your regions to a neighbour, then send troops along it: into
          your own land to reinforce, or into anyone else&rsquo;s to invade. Units can ride one line per turn, and fresh recruits rest until
          next turn.
        </p>
        <p>
          <strong>Drag to move:</strong> on your turn, grab one of your armies on the globe and drop it on a glowing region it can reach.
          Red means invade. A card asks who goes (everyone rested, to start with) and shows your chance to win before anyone sets off.
        </p>
        <h3>⚔️ Battles</h3>
        <p>
          Open the <strong>⚔️ Army</strong> tab to see all your troops, where they are and which regions are at risk, your battle record,
          and a calculator to try any fight before you pick it.
        </p>
        <p>
          Risk rules: up to 3 attacking dice against 2 defending dice, highest against highest, ties to the defender, fought to the last
          unit. Each die adds the unit&rsquo;s bonus. Forts add +1 to defenders; heroes add their bonus to battles fought from or in their
          region. Win and the region, its buildings and any heroes there are yours (heroes flee, but Casey gets captured). Before you
          invade, the game shows your <strong>chance to win</strong> and the losses to expect.
        </p>
        <h3>Units</h3>
        <ul>
          {UNIT_TYPES.map((t) => (
            <li key={t}>
              {UNITS[t].icon} <strong>{UNITS[t].label}</strong> (atk +{UNITS[t].attack}, def +{UNITS[t].defense}): {UNITS[t].blurb}
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
          a recap of each one. If every person in a world is on autopilot, the world waits.
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
