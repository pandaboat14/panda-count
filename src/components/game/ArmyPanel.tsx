"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { armySummary, battleRecord, heroBonusText, regionReports } from "@/game/army";
import { DOCTRINES, TERRAIN, TYPES, UNITS as FIGHTERS, RULES as BATTLE_RULES } from "@/game/battle/codex";
import type { PlayerDoctrineId, TerrainId } from "@/game/battle/types";
import { canReplay } from "@/game/battleScript";
import { DEFAULT_DOCTRINE, PLAYER_DOCTRINES, emptyUnits, unitTotal, type GameEvent, type Units } from "@/game/engine";
import { catapultOf } from "@/game/loadout";
import { PREVIEW_SIMS, armoryGear, simulateOdds, type OddsSetup } from "@/game/odds";
import { BLOODTHIRST_ROUNDS, BUILDINGS, HEROES, HERO_IDS, NACAM_UPKEEP, TRIAL_AT, UNITS, UNIT_TYPES, type HeroId, type UnitType } from "@/game/rules";
import { onTrial, sanctionLabels, tribunalSits } from "@/game/tribunal";
import { CostChips, Stepper } from "./bits";
import { DefaultOrders } from "./Orders";
import { OddsLine, meOf, playerName, regionName, type Ctx } from "./panels";

const unitLine = (u: Partial<Units>) =>
  UNIT_TYPES.filter((t) => (u[t] ?? 0) > 0)
    .map((t) => `${u[t]} ${UNITS[t].icon}`)
    .join("  ") || "none";

// What each kind of unit is for, in one line.
const ROLE: Record<UnitType, string> = {
  panda: "Cheap defenders. Every 3 pandas earn 1 🐼 PandaCoin a turn.",
  armedPanda: "Pandas you've armed: better at defending and can fight back.",
  nacam: `Your hardest hitters for the price. ${NACAM_UPKEEP} 🪙 wages a turn each, and each may quarry 🪨 Stone.`,
  cam: "Great at attack and defence. Train only at a CAM Gym.",
};

export function ArmyPanel({
  ctx,
  events,
  onManage,
  onWatch,
  openHeroes,
}: {
  ctx: Ctx;
  events: GameEvent[];
  onManage: (region: string) => void;
  onWatch: (e: GameEvent) => void;
  openHeroes: () => void;
}) {
  const { view } = ctx;
  const sum = useMemo(() => armySummary(view), [view]);
  const reports = useMemo(() => regionReports(view), [view]);
  const record = useMemo(() => battleRecord(view, events), [view, events]);
  const wins = record.filter((r) => r.won).length;
  const atRisk = reports.filter((r) => r.danger && r.danger.win >= 0.5).length;

  return (
    <div className="panel-body army">
      <h2>Your army</h2>

      <div className="army-stats">
        <Stat label="Troops" value={unitTotal(sum.total)} note={`${unitTotal(sum.ready)} ready to move`} />
        <Stat label="Regions" value={sum.regions} note={atRisk ? `⚠️ ${atRisk} at risk` : "none at risk"} warn={atRisk > 0} />
        <Stat label="Attack" value={sum.attackPower} note="dice total, all-in" />
        <Stat label="Defence" value={sum.defensePower} note="dice total, holding" />
      </div>
      <p className="muted small">
        {sum.upkeep ? `Ogre wages: ${sum.upkeep} 🪙 a turn. ` : ""}Your pandas earn {sum.pandaCoinFromPandas} 🐼 a turn.
      </p>

      {tribunalSits(view) && <Bloodthirst ctx={ctx} />}

      <section className="act">
        <h3>🪖 What you have</h3>
        <ul className="army-units">
          {UNIT_TYPES.map((t) => (
            <li key={t} className={sum.total[t] ? "" : "none"}>
              <span className="army-unit-icon" aria-hidden="true">{UNITS[t].icon}</span>
              <div>
                <strong>
                  {sum.total[t]} {sum.total[t] === 1 ? UNITS[t].label : UNITS[t].plural}
                </strong>{" "}
                <span className="badge type-tag" title={TYPES[FIGHTERS[t].type].why}>
                  {TYPES[FIGHTERS[t].type].icon} {TYPES[FIGHTERS[t].type].label}
                </span>
                <span className="muted small">
                  {" "}
                  · {sum.ready[t]} ready · attack +{UNITS[t].attack} · defence +{UNITS[t].defense}
                </span>
                <p className="small">{ROLE[t]}</p>
                <p className="muted small">
                  Costs <CostChips cost={t === "armedPanda" ? UNITS.armedPanda.cost : view.prices.units[t]} />
                  {t === "armedPanda" ? " to arm one of your pandas" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="act">
        <h3>🦸 Your heroes</h3>
        {sum.heroes.length === 0 ? (
          <p className="muted small">No heroes yet. They add to every die in battles fought from or in their region.</p>
        ) : (
          <ul className="army-heroes">
            {sum.heroes.map((h) => (
              <li key={h.id}>
                <strong>
                  {HEROES[h.id].icon} {HEROES[h.id].name}
                </strong>{" "}
                <span className="muted small">in {h.region ? regionName(view, h.region) : "the Hall"}</span>
                <p className="small">{heroBonusText(h.id)}.</p>
                {h.region && (
                  <button className="btn ghost small" onClick={() => onManage(h.region!)}>
                    Go to {regionName(view, h.region)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button className="btn ghost small" onClick={openHeroes}>Hall of Heroes</button>
      </section>

      <section className="act">
        <h3>🗺️ Where they are</h3>
        <p className="muted small">Tap a region to recruit there, move troops or build. Riskiest first.</p>
        <ul className="army-regions">
          {reports.map((r) => {
            const risk = r.danger ? Math.round(r.danger.win * 100) : 0;
            return (
              <li key={r.region.id}>
                <button className={`army-region${risk >= 50 ? " danger" : risk >= 20 ? " watch" : ""}`} onClick={() => onManage(r.region.id)}>
                  <span className="army-region-head">
                    <strong>{regionName(view, r.region.id)}</strong>
                    {r.region.id === ctx.view.players.find((p) => p.id === view.me)?.capital && <span className="badge">capital</span>}
                    {r.heroes.map((h) => (
                      <span key={h} title={HEROES[h].name}>{HEROES[h].icon}</span>
                    ))}
                  </span>
                  <span className="small">
                    {unitTotal(r.region.units ?? emptyUnits()) ? unitLine(r.region.units ?? emptyUnits()) : "No troops: anyone can walk in"}
                    {unitTotal(r.ready) < unitTotal(r.region.units ?? emptyUnits()) && <span className="muted"> · {unitTotal(r.ready)} ready</span>}
                  </span>
                  <span className="muted small">
                    {r.region.buildings?.length ? r.region.buildings.map((b) => `${BUILDINGS[b].icon} ${BUILDINGS[b].label}`).join(", ") + " · " : ""}
                    {r.lines} gondola line{r.lines === 1 ? "" : "s"}
                    {!r.border && " · safe inland"}
                  </span>
                  {r.danger && (
                    <span className={`army-risk${risk >= 50 ? " high" : ""}`}>
                      ⚠️ {playerName(view, r.danger.owner)} could take it from {regionName(view, r.danger.from)}: {risk}% chance
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <DefaultOrders ctx={ctx} onManage={onManage} />

      <section className="act">
        <h3>⚔️ How battles are won</h3>
        <ol className="small army-rules">
          <li>
            <strong>Both sides pick a move each round</strong>: a Strike, a Guard, a Tactic, a Bag item, or a switch to another squad. One squad
            fights at a time while the rest wait behind it.
          </li>
          <li>
            <strong>The dice pair off, highest against highest.</strong> The move says how many dice you throw (defenders throw one fewer on
            Strikes). Attackers add their attack to every die and defenders their defence, plus hero auras and a 🏰 Fort&rsquo;s +1. The
            higher total wins the pair, and <strong>ties go to the defender</strong>.
          </li>
          <li>
            <strong>Every pair you win hurts</strong> their squad: each {FIGHTERS.panda.hp} damage fells a unit. A winning{" "}
            {BATTLE_RULES.critOn} is a <strong>crit</strong> and hits half as hard again.
          </li>
          <li>
            <strong>Types:</strong> Fluff 🐼 beats Glam 💪, Glam beats Brute 👹, Brute beats Steel 🛡️, and Steel beats Fluff, for 1.5× the damage
            (and 0.75× the other way round). Heroes are <strong>Legends</strong>: they shrug off a quarter of every blow and hit every type evenly.
          </li>
          <li>
            <strong>Momentum:</strong> every pair you win adds 1. At {BATTLE_RULES.momentumMax}, your squad can unleash its{" "}
            <strong>Signature</strong> move.
          </li>
          <li>
            <strong>Standing Orders fight for you while you&rsquo;re away</strong>, so nobody waits for the defender to wake up.
          </li>
          <li>
            <strong>Retreat</strong> if it goes badly (they get a parting shot), or let <strong>Sun Tzu</strong> fight the rest for you. It ends
            when one side has nobody left standing, or after {BATTLE_RULES.roundLimit} rounds, when the invasion stalls. Win, and your survivors
            move in.
          </li>
        </ol>
        <Calculator ctx={ctx} />
      </section>

      <section className="act">
        <h3>📜 Your battles {record.length > 0 && <span className="muted small">· {wins} won, {record.length - wins} lost</span>}</h3>
        {record.length === 0 ? (
          <p className="muted small">No battles yet. Older ones appear once loaded in the Log.</p>
        ) : (
          <ul className="army-record">
            {record.slice(0, 20).map((b) => (
              <li key={b.event.seq}>
                <span className={`result ${b.won ? "won" : "lost"}`}>{b.won ? "Won" : "Lost"}</span>
                <div>
                  <strong>
                    {b.role === "attack" ? `Attacked ${b.place}` : `Defended ${b.place}`}
                  </strong>{" "}
                  <span className="muted small">vs {b.opponent} · round {b.event.round}</span>
                  <p className="small">
                    You lost {unitLine(b.lost)} · they lost {unitLine(b.killed)}
                  </p>
                </div>
                {canReplay(b.event) && (
                  <button className="chip" onClick={() => onWatch(b.event)}>▶ Watch</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Your conscience: how close you are to a war crimes trial, which attacks still count, and who you may hit back.
function Bloodthirst({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const me = meOf(view);
  const n = me.bloodthirst;
  const owed = Object.entries(me.grudges ?? {}).filter(([id, rounds]) => rounds.length && view.players.some((p) => p.id === id));
  return (
    <section className="act">
      <h3>
        🩸 Bloodthirst {n}/{TRIAL_AT}
        {onTrial(view, view.me) && <span className="badge warn">⚖️ on trial</span>}
        {me.sentence && <span className="badge criminal">☠️ war criminal</span>}
      </h3>
      <div className={`thirst-meter${n >= TRIAL_AT - 1 ? " hot" : ""}`} role="meter" aria-label="Bloodthirst" aria-valuemin={0} aria-valuemax={TRIAL_AT} aria-valuenow={n}>
        <span style={{ width: `${Math.min(100, (n / TRIAL_AT) * 100)}%` }} />
      </div>
      <p className="muted small">
        Each attack on another Kird adds 1 (2 if they hold less than half your regions) and counts for {BLOODTHIRST_ROUNDS} rounds. At {TRIAL_AT},
        everyone else votes on whether you&rsquo;re a war criminal. Hitting back once for every attack you suffer, attacking the Kird about to win,
        and attacking a convicted war criminal don&rsquo;t count.
      </p>
      {me.sentence && (
        <p className="small">
          ☠️ You&rsquo;re serving a sentence ({me.sentence.turnsLeft} turn{me.sentence.turnsLeft === 1 ? "" : "s"} left): {sanctionLabels(me.sentence.sanctions)}.
          Until it&rsquo;s served, attacking you is no crime.
        </p>
      )}
      {(me.crimes ?? []).length > 0 && (
        <ul className="charges small">
          {me.crimes!.map((c, i) => (
            <li key={i}>
              <span>
                {c.kind === "thunder" ? "⚡ Thunder on" : "⚔️ Invaded"} {regionName(view, c.region)} ({playerName(view, c.victim)})
              </span>
              <span className="muted">
                🩸{c.points} · fades after round {c.round + BLOODTHIRST_ROUNDS - 1}
              </span>
            </li>
          ))}
        </ul>
      )}
      {owed.length > 0 && (
        <p className="small">
          🗡️ Free strikes back (they won&rsquo;t count):{" "}
          {owed.map(([id, rounds]) => `${playerName(view, id)}${rounds.length > 1 ? ` ×${rounds.length}` : ""}`).join(", ")}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: number; note: string; warn?: boolean }) {
  return (
    <div className={`army-stat${warn ? " warn" : ""}`}>
      <span className="army-stat-value">{value}</span>
      <span className="army-stat-label">{label}</span>
      <span className="army-stat-note">{note}</span>
    </div>
  );
}

const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];

// Try any matchup: the real battle rules, played out with fixed dice (so the same fight always shows the same number),
// each side making its likely move every round. It only plays while it's open, and a busy phone keeps up because the
// sums wait for your taps.
function Calculator({ ctx }: { ctx: Ctx }) {
  const armory = meOf(ctx.view).armory;
  const hasKit = Object.keys(armoryGear(armory)).length > 0 || Boolean(catapultOf(armory));
  const [open, setOpen] = useState(false);
  const [atk, setAtk] = useState<Units>({ ...emptyUnits(), panda: 3, nacam: 1 });
  const [def, setDef] = useState<Units>({ ...emptyUnits(), panda: 2 });
  const [atkHero, setAtkHero] = useState<HeroId | "">("");
  const [defHero, setDefHero] = useState<HeroId | "">("");
  const [fort, setFort] = useState(false);
  const [terrain, setTerrain] = useState<TerrainId>("bamboo");
  const [doctrine, setDoctrine] = useState<PlayerDoctrineId>(DEFAULT_DOCTRINE);
  const [kit, setKit] = useState(false);
  const setup = useMemo<OddsSetup>(
    () => ({
      atk: {
        units: atk,
        heroes: atkHero ? [atkHero] : [],
        ...(kit && hasKit ? { gear: armoryGear(armory), catapult: Boolean(catapultOf(armory)) } : {}),
      },
      def: { units: def, heroes: defHero ? [defHero] : [], doctrine },
      terrain,
      buildings: fort ? ["fort"] : [],
    }),
    [atk, def, atkHero, defHero, fort, terrain, doctrine, kit, hasKit, armory],
  );
  const shown = useDeferredValue(setup);
  // Heroes only ride along with troops, and a region nobody holds is simply taken.
  const ready = unitTotal(shown.atk.units) > 0 && unitTotal(shown.def.units) > 0;
  const odds = useMemo(() => (open && ready ? simulateOdds(shown) : null), [open, ready, shown]);
  const side = (u: Units, set: (u: Units) => void, hero: HeroId | "", setHero: (h: HeroId | "") => void, label: string) => (
    <div>
      <p className="small">
        <strong>{label}</strong>
      </p>
      {UNIT_TYPES.map((t) => (
        <label key={t} className="trade-line">
          <span>{UNITS[t].icon}</span>
          <Stepper value={u[t]} max={30} onChange={(n) => set({ ...u, [t]: n })} label={`${label} ${UNITS[t].plural}`} />
        </label>
      ))}
      <select className="army-calc-hero" value={hero} onChange={(e) => setHero(e.target.value as HeroId | "")} aria-label={`${label}' hero`}>
        <option value="">No hero</option>
        {HERO_IDS.map((h) => (
          <option key={h} value={h}>
            {HEROES[h].icon} {HEROES[h].name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <details className="army-calc" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>🧮 Try a battle</summary>
      <div className="trade-cols">
        {side(atk, setAtk, atkHero, setAtkHero, "Attackers")}
        {side(def, setDef, defHero, setDefHero, "Defenders")}
      </div>
      <div className="army-calc-mods small">
        <label>
          Where{" "}
          <select value={terrain} onChange={(e) => setTerrain(e.target.value as TerrainId)}>
            {TERRAIN_IDS.map((t) => (
              <option key={t} value={t}>
                {TERRAIN[t].icon} {TERRAIN[t].label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{TERRAIN[terrain].text}</p>
        <label>
          <input type="checkbox" checked={fort} onChange={(e) => setFort(e.target.checked)} /> 🏰 Defenders have a Fort
        </label>
        <label>
          Defenders&rsquo; orders{" "}
          <select value={doctrine} onChange={(e) => setDoctrine(e.target.value as PlayerDoctrineId)}>
            {PLAYER_DOCTRINES.map((d) => (
              <option key={d} value={d}>
                {DOCTRINES[d].icon} {DOCTRINES[d].label}
              </option>
            ))}
          </select>
        </label>
        {hasKit && (
          <label>
            <input type="checkbox" checked={kit} onChange={(e) => setKit(e.target.checked)} /> 🛡️ Attackers carry your Armory gear
          </label>
        )}
      </div>
      <div className={shown !== setup ? "army-calc-out stale" : "army-calc-out"} aria-live="polite">
        {ready ? <OddsLine odds={odds} /> : <p className="muted small">Put someone on each side.</p>}
      </div>
      <p className="muted small">Played out {PREVIEW_SIMS} times by the real battle rules, each side making its likely move every round.</p>
    </details>
  );
}
