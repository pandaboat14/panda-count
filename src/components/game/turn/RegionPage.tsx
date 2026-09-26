"use client";

// Everything about the region you just clicked: whose it is, who's there and how ready they are, what it pays,
// what protects it, what's next door, and what you can do there. Your own regions have ‹ › to hop between them.

import { useMemo, useState } from "react";
import { regionReports, restedIn } from "@/game/army";
import { unitTotal } from "@/game/engine";
import { NEIGHBORS, REGION_BY_ID } from "@/game/regions";
import { BUILDINGS, BUILDING_TYPES, GOOD_INFO, HEROES, HERO_IDS, UNITS, UNIT_TYPES } from "@/game/rules";
import {
  afford,
  atPeace,
  attackBar,
  attackSources,
  attackTargets,
  barred,
  lineState,
  lineTargets,
  meIn,
  moveRoutes,
  myRegions,
  onStrike,
  regionIn,
  rollChance,
  territoryOrder,
  unitsOf,
} from "@/game/turnOptions";
import { placeOf } from "@/game/turnFlow";
import { inkOn } from "../colors";
import { FlagIcon, initialOf } from "../Flag";
import { RenameForm } from "../panels";
import { AffordBadge } from "./build";
import { Badge, Choice, Group, UnitsLine, ownerColor, ownerLabel, useTurn } from "./kit";

export function RegionPage({ id }: { id: string }) {
  const t = useTurn();
  const { view } = t;
  const r = regionIn(view, id);
  const def = REGION_BY_ID.get(id)!;
  const me = meIn(view);
  const mine = r?.owner === view.me;
  const report = useMemo(() => (mine ? regionReports(view).find((x) => x.region.id === id) : undefined), [view, id, mine]);
  const order = useMemo(() => territoryOrder(view), [view]);
  const at = order.indexOf(id);
  const below = t.stack.at(-2);
  const midAction = Boolean(below && placeOf(below));
  if (!r) return null;
  const res = GOOD_INFO[def.resource];
  const hot = r.token === 6 || r.token === 8;
  const heroesHere = HERO_IDS.filter((h) => view.heroes[h].region === id);
  const rested = mine ? restedIn(r) : null;
  const total = unitTotal(unitsOf(r));
  const owner = view.players.find((p) => p.id === r.owner);

  return (
    <div className="panel-body region-page">
      <div className="region-nav">
        {t.stack.length > 1 && (
          <button type="button" className="hub-back" onClick={t.back}>
            ← {midAction ? "Back to what you were doing" : "Back"}
          </button>
        )}
        {mine && order.length > 1 && (
          <span className="region-cycle" role="group" aria-label="Your regions">
            <button type="button" onClick={() => t.showRegion(order[(at - 1 + order.length) % order.length], true)} aria-label="Previous of your regions">
              ‹
            </button>
            <span>
              {at + 1} of {order.length}
            </span>
            <button type="button" onClick={() => t.showRegion(order[(at + 1) % order.length], true)} aria-label="Next of your regions">
              ›
            </button>
          </span>
        )}
      </div>

      <header className={`region-banner${mine ? " mine" : ""}`} style={{ borderColor: r.fog ? "#8c939b" : ownerColor(t, r) }}>
        <p className="eyebrow">📍 Region</p>
        <h2 tabIndex={-1}>{t.name(id)}</h2>
        {r.name && <p className="region-once small muted">Once called {def.name}</p>}
        <p className="region-who">
          {!r.fog && owner ? (
            <span
              className={`owner-pill${mine ? " mine" : ""}`}
              style={mine ? { borderColor: owner.color, background: owner.color, color: inkOn(owner.color) } : { borderColor: owner.color }}
            >
              <FlagIcon color={owner.color} mine={mine} initial={initialOf(owner.name)} size={20} />
              {mine ? "Yours" : owner.name}
            </span>
          ) : (
            <>
              <span className="player-dot big" style={{ background: r.fog ? "#8c939b" : ownerColor(t, r) }} />
              <strong>{r.fog ? "Hidden in the fog" : ownerLabel(t, r)}</strong>
            </>
          )}
          {mine && me.capital === id && <Badge kind="info">👑 your capital</Badge>}
          {owner && owner.id !== view.me && atPeace(view, owner.id) && <Badge kind="ok">🤝 pact</Badge>}
        </p>
        <p className="region-facts">
          <span>
            {res.icon} {res.label}
          </span>
          <span className={`token${hot ? " hot" : ""}`} title="Its dice number">
            🎲 {r.token}
          </span>
        </p>
        {r.renamable && t.myTurn && !t.over && <RenameControls key={id} id={id} />}
      </header>

      {r.fog ? (
        <p className="flow-empty">
          ☁️ You can&rsquo;t see inside. You&rsquo;ll see who&rsquo;s here once you hold a region next to it.
        </p>
      ) : (
        <>
          <section className="region-troops">
            <h3>{mine ? "🪖 Your troops here" : "🪖 Troops here"}</h3>
            {total ? (
              <ul className="troop-counts">
                {UNIT_TYPES.filter((u) => (r.units?.[u] ?? 0) > 0).map((u) => (
                  <li key={u}>
                    <span className="troop-icon" aria-hidden="true">
                      {UNITS[u].icon}
                    </span>
                    <strong>{r.units![u]}</strong>
                    <span className="small muted">{r.units![u] === 1 ? UNITS[u].label : UNITS[u].plural}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="warn-line">{mine ? "⚠️ Nobody is guarding it: any neighbour can walk in." : "Nobody is defending it: whoever arrives first takes it."}</p>
            )}
            {mine && total > 0 && (
              <p className="ready-line">
                <Badge kind={unitTotal(rested!) ? "ok" : "off"}>
                  {unitTotal(rested!) ? `✅ ${unitTotal(rested!)} ready to move` : "💤 all resting"}
                </Badge>
                {unitTotal(rested!) < total && unitTotal(rested!) > 0 && <Badge kind="off">💤 {total - unitTotal(rested!)} resting</Badge>}
                <span className="small muted"> Resting troops moved or joined this turn.</span>
              </p>
            )}
            {mine &&
              (report?.danger ? (
                <p className={`danger-line${report.danger.win >= 0.5 ? " high" : ""}`}>
                  ⚠️ {view.players.find((p) => p.id === report.danger!.owner)?.name} could take it from {t.name(report.danger.from)}:{" "}
                  {Math.round(report.danger.win * 100)}% chance
                </p>
              ) : (
                <p className="safe-line">✅ No enemy army next door can take it right now.</p>
              ))}
          </section>

          <section className="region-info">
            <h3>💰 What it pays</h3>
            <p className="small">
              {mine ? "You get" : "Its owner gets"} 1 {res.icon} {res.label} at the start of each of {mine ? "your" : "their"} turns, plus 1 more whenever the dice roll{" "}
              <strong className={hot ? "hot" : ""}>{r.token}</strong> ({Math.round(rollChance(r.token) * 36)} in 36 rolls). Holding it is also worth 2 🪙 a turn.
            </p>
            <h3>🏠 Buildings</h3>
            {r.buildings?.length ? (
              <ul className="small region-list">
                {r.buildings.map((b) => (
                  <li key={b}>
                    {BUILDINGS[b].icon} <strong>{BUILDINGS[b].label}</strong>: {BUILDINGS[b].blurb}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">None yet.</p>
            )}
            {heroesHere.length > 0 && (
              <>
                <h3>🦸 Heroes here</h3>
                <ul className="small region-list">
                  {heroesHere.map((h) => (
                    <li key={h}>
                      {HEROES[h].icon} <strong>{HEROES[h].name}</strong> ({view.heroes[h].owner === view.me ? "yours" : view.players.find((p) => p.id === view.heroes[h].owner)?.name}): +
                      {HEROES[h].combatBonus} on every die in battles here
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {t.myTurn && !r.fog && (mine ? <MineActions id={id} /> : <TheirActions id={id} />)}
      {!t.myTurn && !t.over && !r.fog && <p className="small muted">Your moves here open on your turn.</p>}

      <section className="region-info">
        <h3>🧭 Next door</h3>
        <p className="small muted">Tap one to go there. 🚡 marks a gondola line you can ride.</p>
        <ul className="neighbours">
          {(NEIGHBORS.get(id) ?? []).map((n) => {
            const nr = regionIn(view, n)!;
            const line = lineState(view, id, n);
            return (
              <li key={n}>
                <button type="button" onClick={() => t.showRegion(n, true)}>
                  <span className="player-dot" style={{ background: nr.fog ? "#8c939b" : ownerColor(t, nr) }} />
                  <span className="nb-name">{t.name(n)}</span>
                  <span className="nb-who small muted">{nr.fog ? "fog" : nr.owner === view.me ? "yours" : ownerLabel(t, nr).replace(/^Held by /, "")}</span>
                  <span className="nb-units small">{nr.fog ? "?" : <UnitsLine u={nr.units} none="—" />}</span>
                  <span className="nb-line" title={line === "ours" ? "Your gondola line" : line === "theirs" ? "Someone else's line" : "No line"}>
                    {line === "ours" ? "🚡" : line === "theirs" ? "🔒" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// Conquerors name what they take: a new name, or its old one back.
function RenameControls({ id }: { id: string }) {
  const t = useTurn();
  const [open, setOpen] = useState(false);
  const original = REGION_BY_ID.get(id)!.name;
  if (open) return <RenameForm ctx={t} id={id} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} autoFocus />;
  return (
    <div className="form-actions region-rename">
      <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
        ✏️ Rename
      </button>
      {regionIn(t.view, id)?.name && (
        <button type="button" className="btn ghost small" disabled={t.busy} onClick={() => t.act({ type: "rename", region: id, name: original })}>
          ↺ Call it {original} again
        </button>
      )}
    </div>
  );
}

// What you can do in one of your own regions.
function MineActions({ id }: { id: string }) {
  const t = useTurn();
  const { view } = t;
  const r = regionIn(view, id)!;
  const targets = attackTargets(view, { from: id, odds: false });
  const ready = targets.filter((x) => x.status === "ready").length;
  const routes = moveRoutes(view, id);
  const rested = unitTotal(restedIn(r));
  const lines = lineTargets(view, id);
  const buildable = BUILDING_TYPES.filter((b) => !r.buildings?.includes(b));
  const myHeroes = HERO_IDS.filter((h) => view.heroes[h].region === id && view.heroes[h].owner === view.me);
  return (
    <Group title={`What do you want to do in ${t.name(id)}?`}>
      <Choice
        icon="⚔️"
        title="Attack from here"
        badge={ready ? <Badge kind="ok">{ready} ready</Badge> : targets.some((x) => x.status === "needLine") ? <Badge kind="warn">needs a line</Badge> : <Badge kind="off">none now</Badge>}
        sub={targets.length ? `${targets.length} neighbour${targets.length === 1 ? "" : "s"} that aren't yours` : "Every neighbour is already yours"}
        disabled={!targets.length}
        onClick={() => t.go({ step: "attackTarget", from: id })}
      />
      <Choice
        icon="🚡"
        title="Move troops from here"
        badge={rested ? <Badge kind="ok">{rested} ready</Badge> : <Badge kind="off">all resting</Badge>}
        sub={routes.length ? `To ${routes.map((x) => t.name(x.to)).join(", ")}` : "No other region of yours next door"}
        disabled={!routes.length || !rested}
        onClick={() => t.go({ step: "moveTo", from: id })}
      />
      <Choice
        icon="🪖"
        title="Recruit here"
        badge={barred(view, "arms") ? <Badge kind="off">🚫 arms embargo</Badge> : null}
        sub={barred(view, "arms") ? "A war crimes sentence bars you from recruiting or arming troops." : "Pandas, ogres, CAMs, or arm the pandas here"}
        disabled={barred(view, "arms")}
        onClick={() => t.go({ step: "recruitWhat", region: id })}
      />
      {buildable.map((b) => (
        <Choice
          key={b}
          icon={BUILDINGS[b].icon}
          title={`Build a ${BUILDINGS[b].label} here`}
          badge={<AffordBadge a={afford(view, BUILDINGS[b].cost)} />}
          sub={BUILDINGS[b].blurb}
          onClick={() => t.go({ step: "buildReview", building: b, region: id })}
        />
      ))}
      {lines.length > 0 && (
        <Choice
          icon="🚡"
          title="Build a gondola line from here"
          badge={
            onStrike(view) ? (
              <Badge kind="off">strike this round</Badge>
            ) : barred(view, "gondolas") ? (
              <Badge kind="off">🚧 gondola ban</Badge>
            ) : (
              <AffordBadge a={afford(view, view.prices.gondola)} />
            )
          }
          sub={`To ${lines.map((x) => t.name(x.id)).join(", ")}`}
          disabled={onStrike(view) || barred(view, "gondolas")}
          onClick={() => t.go({ step: "lineTo", from: id })}
        />
      )}
      {myHeroes.map((h) => (
        <Choice
          key={h}
          icon={HEROES[h].icon}
          title={`Move ${HEROES[h].name}`}
          sub={view.heroes[h].movedTurn === view.turn ? "He already moved this turn" : "Ride a line to another of your regions"}
          disabled={view.heroes[h].movedTurn === view.turn}
          onClick={() => t.go({ step: "heroTo", hero: h })}
        />
      ))}
    </Group>
  );
}

// What you can do about a region that isn't yours.
function TheirActions({ id }: { id: string }) {
  const t = useTurn();
  const { view } = t;
  const r = regionIn(view, id)!;
  const sources = attackSources(view, id);
  const ready = sources.find((s) => s.status === "ready");
  const pact = atPeace(view, r.owner);
  const ceasefire = attackBar(view, id) === "ceasefire";
  const me = meIn(view);
  const casey = view.heroes.casey.owner === view.me && (me.thunderReadyTurn ?? 0) <= view.turn && !attackBar(view, id) && !barred(view, "heroes");
  const pct = ready?.odds ? Math.round(ready.odds.win * 100) : null;
  return (
    <Group title={`What do you want to do about ${t.name(id)}?`}>
      {pact ? (
        <Choice icon="🤝" title="You're at peace with them" sub="Break the pact first if you want to attack." onClick={() => t.go({ step: "kird", id: r.owner! })} />
      ) : ceasefire ? (
        <Choice icon="🕊️" title={`Attack ${t.name(id)}`} badge={<Badge kind="off">ceasefire</Badge>} sub="Your war crimes sentence keeps you out of other Kirds' land for now." disabled />
      ) : !sources.length ? (
        <Choice icon="⚔️" title={`Attack ${t.name(id)}`} sub="None of your regions border it yet." disabled />
      ) : (
        <Choice
          icon="⚔️"
          title={`Attack ${t.name(id)}`}
          badge={ready ? <Badge kind="ok">ready</Badge> : sources.some((s) => s.status === "needLine") ? <Badge kind="warn">needs a line</Badge> : <Badge kind="off">troops resting</Badge>}
          side={pct !== null ? <span className={`odds-chip ${pct >= 75 ? "good" : pct >= 45 ? "fair" : "bad"}`}>{pct}%</span> : null}
          sub={ready ? `Best from ${t.name(ready.from)}` : `From ${sources.map((s) => t.name(s.from)).join(" or ")}`}
          disabled={!sources.some((s) => s.status === "ready" || s.status === "needLine")}
          onClick={() => t.go({ step: "attackFrom", target: id })}
        />
      )}
      {casey && <Choice icon="⚡" title="Strike it with Casey's thunder" sub="Destroys its 3 strongest units." onClick={() => t.go({ step: "thunderReview", target: id })} />}
      {r.owner && <Choice icon="🤝" title={`Deal with ${ownerLabel(t, r)}`} sub="Pact, trade, panda loan, or a private message." onClick={() => t.go({ step: "kird", id: r.owner! })} />}
      {!myRegions(view).length && <p className="small muted">You have no land right now: Panda Asylum finds you a new home on your next turn.</p>}
    </Group>
  );
}
