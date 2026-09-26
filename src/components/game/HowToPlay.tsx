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
          It&rsquo;s Risk meets Catan on a 3D globe, and <strong>it never ends</strong>. Grow your empire, make friends, betray them, and
          chase Casey. When it gets boring, new seasons bring new events.
        </p>
        <h3>Your turn</h3>
        <ol>
          <li>
            <strong>Dice &amp; harvest.</strong> Every region you hold gives you 1 of its resource. Then the dice roll, Catan-style: every
            region with that number pays its owner one more. Roll a 7 and <strong>ogres raid</strong>: anyone holding more than 9 resource
            cards loses half.
          </li>
          <li>
            <strong>Income.</strong> 2 🪙 per region (+2 per Market), 1 🐼 per 3 pandas (+2 per Sanctuary, +1 per loaned panda), 1 💪 per
            CAM Gym. NACAM ogres cost 1 🪙 upkeep each or they desert.
          </li>
          <li>
            <strong>Do anything, in any order:</strong> build gondolas, recruit, build, move, invade, trade, hire heroes, loan pandas.
          </li>
          <li>Hit <strong>End turn</strong>. The next Kird gets a replay of everything they&rsquo;re allowed to see.</li>
        </ol>
        <h3>🚡 Urban gondolas</h3>
        <p>
          The <strong>only</strong> way to move troops. Build a line from one of your regions to a neighbour, then send troops along it: into
          your own land to reinforce, or into anyone else&rsquo;s to invade. Units can ride one line per turn, and fresh recruits rest until
          next turn.
        </p>
        <h3>⚔️ Battles</h3>
        <p>
          Risk rules: up to 3 attacking dice against 2 defending dice, highest against highest, ties to the defender, fought to the last
          unit. Each die adds the unit&rsquo;s bonus. Forts add +1 to defenders; heroes add their bonus to battles fought from or in their
          region. Win and the region, its buildings and any heroes there are yours (heroes flee, but Casey gets captured).
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
          beaches. They regrow over time. Every round a world event shakes things up. Lose everything and you get Panda Asylum somewhere new.
          No one ever wins. Everyone keeps playing.
        </p>
        <h3>☁️ Fog of war</h3>
        <p>You see your regions, their neighbours, and the ends of your gondola lines. Everything else is cloud.</p>
      </article>
    </dialog>
  );
}
