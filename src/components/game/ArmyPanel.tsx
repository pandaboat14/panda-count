"use client";

import { useMemo, useState } from "react";
import { armySummary, battleRecord, heroBonusText, regionReports } from "@/game/army";
import { canReplay } from "@/game/battleScript";
import { emptyUnits, unitTotal, type GameEvent, type Units } from "@/game/engine";
import { battleOdds } from "@/game/odds";
import { BUILDINGS, HEROES, NACAM_UPKEEP, UNITS, UNIT_TYPES, type UnitType } from "@/game/rules";
import { CostChips, Stepper } from "./bits";
import { OddsLine, playerName, regionName, type Ctx } from "./panels";

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

      <section className="act">
        <h3>🪖 What you have</h3>
        <ul className="army-units">
          {UNIT_TYPES.map((t) => (
            <li key={t} className={sum.total[t] ? "" : "none"}>
              <span className="army-unit-icon" aria-hidden="true">{UNITS[t].icon}</span>
              <div>
                <strong>
                  {sum.total[t]} {sum.total[t] === 1 ? UNITS[t].label : UNITS[t].plural}
                </strong>
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

      <section className="act">
        <h3>⚔️ How battles are won</h3>
        <ol className="small army-rules">
          <li>The attacker rolls one die for each of up to 3 units; the defender rolls for up to 2.</li>
          <li>
            Each die adds its unit&rsquo;s bonus: 🐼 +0 attack / +1 defence, 🛡️ +1 / +2, 👹 +2 / +0, 💪 +2 / +2. Heroes add their bonus to every die,
            and a 🏰 Fort adds +1 to every defending die.
          </li>
          <li>Highest die against highest, then second against second. The higher die wins; <strong>ties go to the defender</strong>.</li>
          <li>Each lost pairing kills that side&rsquo;s weakest unit. Rounds repeat until one side is wiped out.</li>
          <li>Win and you take the region with everyone who survived. Lose and every attacker is gone.</li>
        </ol>
        <Calculator />
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

function Stat({ label, value, note, warn }: { label: string; value: number; note: string; warn?: boolean }) {
  return (
    <div className={`army-stat${warn ? " warn" : ""}`}>
      <span className="army-stat-value">{value}</span>
      <span className="army-stat-label">{label}</span>
      <span className="army-stat-note">{note}</span>
    </div>
  );
}

// Try any matchup: the same dice rules the game uses, played out a couple of hundred times.
function Calculator() {
  const [atk, setAtk] = useState<Units>({ ...emptyUnits(), panda: 3, nacam: 1 });
  const [def, setDef] = useState<Units>({ ...emptyUnits(), panda: 2 });
  const [fort, setFort] = useState(false);
  const [atkHero, setAtkHero] = useState(0);
  const [defHero, setDefHero] = useState(0);
  const odds = useMemo(() => battleOdds(atk, atkHero, def, defHero + (fort ? 1 : 0)), [atk, def, fort, atkHero, defHero]);
  const side = (u: Units, set: (u: Units) => void, label: string) => (
    <div>
      <p className="small"><strong>{label}</strong></p>
      {UNIT_TYPES.map((t) => (
        <label key={t} className="trade-line">
          <span>{UNITS[t].icon}</span>
          <Stepper value={u[t]} max={30} onChange={(n) => set({ ...u, [t]: n })} label={`${label} ${UNITS[t].plural}`} />
        </label>
      ))}
    </div>
  );
  return (
    <details className="army-calc">
      <summary>🧮 Try a battle</summary>
      <div className="trade-cols">
        {side(atk, setAtk, "Attackers")}
        {side(def, setDef, "Defenders")}
      </div>
      <div className="army-calc-mods small">
        <label>
          <input type="checkbox" checked={fort} onChange={(e) => setFort(e.target.checked)} /> 🏰 Defenders have a Fort
        </label>
        <label>
          Attacking hero bonus{" "}
          <select value={atkHero} onChange={(e) => setAtkHero(Number(e.target.value))}>
            <option value={0}>none</option>
            <option value={1}>+1</option>
            <option value={3}>+3 (Casey)</option>
          </select>
        </label>
        <label>
          Defending hero bonus{" "}
          <select value={defHero} onChange={(e) => setDefHero(Number(e.target.value))}>
            <option value={0}>none</option>
            <option value={1}>+1</option>
            <option value={3}>+3 (Casey)</option>
          </select>
        </label>
      </div>
      {unitTotal(atk) > 0 && unitTotal(def) > 0 ? <OddsLine odds={odds} /> : <p className="muted small">Put someone on each side.</p>}
    </details>
  );
}
