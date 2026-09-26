"use client";

import { useMemo, useState } from "react";
import type { Action, GameEvent, GameView, RegionView, Units } from "@/game/engine";
import { NEIGHBORS, REGION_BY_ID, lineId, type Resource } from "@/game/regions";
import {
  BUILDINGS,
  BUILDING_TYPES,
  EXCHANGE,
  GOODS,
  GOOD_INFO,
  HEROES,
  HERO_IDS,
  RESOURCES,
  UNITS,
  UNIT_TYPES,
  type Cost,
  type Good,
  type HeroId,
  type UnitType,
} from "@/game/rules";
import { costLabel, fillCost } from "@/game/advisor";
import { canReplay } from "@/game/battleScript";
import { attackOdds, type Odds } from "@/game/odds";
import { Avatar } from "../Avatar";
import { Race } from "./Race";
import { CostChips, Stepper, affordable, times } from "./bits";

export type Ctx = {
  view: GameView;
  myTurn: boolean;
  busy: boolean;
  act: (a: Action) => Promise<GameEvent[] | false>;
  avatars: Record<string, string>;
  over?: boolean; // the game has ended: look, don't touch
};

export const regionName = (id: string) => REGION_BY_ID.get(id)?.name ?? id;
const NATIVE_LABEL = { pandas: "the Panda Nation 🐼", nacams: "the NACAM Ogre Nation 👹", cams: "the CAM Nation 💪", wild: "wild pandas" } as const;

export function meOf(view: GameView) {
  return view.players.find((p) => p.id === view.me)!;
}
export function regionView(view: GameView, id: string) {
  return view.regions.find((r) => r.id === id)!;
}
export function playerName(view: GameView, id: string | null | undefined) {
  return view.players.find((p) => p.id === id)?.name ?? "someone";
}
export function usableLine(view: GameView, a: string, b: string) {
  const line = view.lines.find((l) => l.id === lineId(a, b));
  if (!line) return false;
  return line.owner === view.me || (regionView(view, a).owner === view.me && regionView(view, b).owner === view.me);
}
export function inPact(view: GameView, other: string) {
  return view.pacts.some((p) => (p.a === view.me && p.b === other) || (p.b === view.me && p.a === other));
}
const rested = (r: RegionView): Units => {
  const out = { panda: 0, armedPanda: 0, nacam: 0, cam: 0 };
  for (const t of UNIT_TYPES) out[t] = (r.units?.[t] ?? 0) - (r.tired?.[t] ?? 0);
  return out;
};
const unitLine = (u?: Partial<Units>) =>
  UNIT_TYPES.filter((t) => (u?.[t] ?? 0) > 0).map((t) => `${u![t]} ${UNITS[t].icon}`).join("  ") || "nobody";

// ---------------------------------------------------------------- shared

// Buys whatever resources are missing (with Coin), then does the action. Returns false if anything failed.
export async function buyThen(ctx: Ctx, cost: Cost, action: Action) {
  const me = meOf(ctx.view);
  const plan = fillCost(me.goods ?? {}, cost, ctx.view.prices.buyPrice);
  if (!plan) return false;
  for (const [g, n] of Object.entries(plan.buy)) {
    if (!(await ctx.act({ type: "buy", good: g as Resource, count: n as number }))) return false;
  }
  return Boolean(await ctx.act(action));
}

// A button for anything that costs goods. Short on resources but rich in Coin? One tap buys them first.
export function DoButton({
  ctx,
  cost,
  action,
  children,
  className = "btn small",
  disabled,
  onDone,
}: {
  ctx: Ctx;
  cost: Cost;
  action: Action;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const goods = meOf(ctx.view).goods ?? {};
  const can = affordable(cost, goods);
  const fill = can ? null : fillCost(goods, cost, ctx.view.prices.buyPrice);
  const off = disabled || ctx.busy || !ctx.myTurn || (!can && !fill);
  return (
    <button
      className={className}
      disabled={off}
      title={!can && fill ? `Buys ${costLabel(fill.buy)} for ${fill.coin} 🪙 first` : undefined}
      onClick={async () => {
        const ok = can ? Boolean(await ctx.act(action)) : await buyThen(ctx, cost, action);
        if (ok) onDone?.();
      }}
    >
      {!can && fill ? (
        <>
          🛒 Buy {costLabel(fill.buy)} ({fill.coin} 🪙) &amp; {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function OddsInline({ odds }: { odds: Odds | null }) {
  if (!odds) return null;
  const pct = Math.round(odds.win * 100);
  return <span className={`odds-chip ${pct >= 75 ? "good" : pct >= 45 ? "fair" : "bad"}`}>{pct}% with everyone rested</span>;
}

export function OddsLine({ odds }: { odds: Odds | null }) {
  if (!odds) return <p className="small muted">Odds unknown: you can&rsquo;t see who&rsquo;s defending.</p>;
  const pct = Math.round(odds.win * 100);
  const tone = pct >= 75 ? "good" : pct >= 45 ? "fair" : "bad";
  return (
    <p className={`odds ${tone}`}>
      <strong>{pct}% chance to win</strong>
      <span className="small">
        {" "}
        · you&rsquo;d lose about {odds.attackerLoss.toFixed(1)}, they&rsquo;d lose about {odds.defenderLoss.toFixed(1)}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- region

export function RegionPanel({
  ctx,
  id,
  dest,
  setDest,
  startThunder,
  planAttack,
}: {
  ctx: Ctx;
  id: string;
  dest: string | null;
  setDest: (id: string | null) => void;
  startThunder: () => void;
  planAttack: (from: string, to: string) => void;
}) {
  const { view, myTurn, busy } = ctx;
  const r = regionView(view, id);
  const def = REGION_BY_ID.get(id)!;
  const me = meOf(view);
  const mine = r.owner === view.me;
  const heroesHere = HERO_IDS.filter((h) => view.heroes[h].region === id);

  return (
    <div className="panel-body">
      <header className="region-head">
        <h2>{def.name}</h2>
        <p className="region-sub">
          {GOOD_INFO[def.resource].icon} {GOOD_INFO[def.resource].label} · number <strong className={r.token === 6 || r.token === 8 ? "hot" : ""}>{r.token}</strong>
        </p>
        <p className="region-owner">
          {r.fog ? (
            "☁️ Hidden in the fog of war"
          ) : r.owner ? (
            <>
              <span className="player-dot" style={{ background: view.players.find((p) => p.id === r.owner)?.color }} /> {mine ? "Yours" : playerName(view, r.owner)}
              {r.owner === me.id && me.capital === id && " · capital"}
            </>
          ) : r.native ? (
            <>Held by {NATIVE_LABEL[r.native]}</>
          ) : (
            "Empty. Anyone can claim it"
          )}
        </p>
        {!r.fog && (
          <p className="region-units">
            {unitLine(r.units)}
            {mine && r.tired && UNIT_TYPES.some((t) => r.tired![t] > 0) && <span className="muted"> · {unitLine(r.tired)} resting</span>}
          </p>
        )}
        {!r.fog && r.buildings && r.buildings.length > 0 && (
          <p className="region-buildings">{r.buildings.map((b) => `${BUILDINGS[b].icon} ${BUILDINGS[b].label}`).join(" · ")}</p>
        )}
        {heroesHere.length > 0 && (
          <p className="region-heroes">
            {heroesHere.map((h) => (
              <span key={h}>
                {HEROES[h].icon} {HEROES[h].name} ({playerName(view, view.heroes[h].owner)})
              </span>
            ))}
          </p>
        )}
      </header>

      {mine && myTurn && (
        <>
          <SendTroops ctx={ctx} from={r} dest={dest} setDest={setDest} />
          <Gondolas ctx={ctx} from={r} />
          <Recruit ctx={ctx} region={r} />
          <Build ctx={ctx} region={r} />
          {heroesHere.filter((h) => view.heroes[h].owner === view.me).length > 0 && (
            <HeroMoves ctx={ctx} region={r} heroes={heroesHere.filter((h) => view.heroes[h].owner === view.me)} startThunder={startThunder} />
          )}
        </>
      )}
      {!mine && myTurn && !r.fog && <InvadeHint ctx={ctx} target={r} planAttack={planAttack} />}
      {ctx.over && <p className="muted">🏁 This game is over. You can still look around.</p>}
      {!myTurn && !ctx.over && <p className="muted">It&rsquo;s {playerName(view, view.players.find((p) => p.seat === view.activeSeat)?.id)}&rsquo;s turn. You can look around; your moves open up on your turn.</p>}
      {busy && <p className="muted">…</p>}
      <p className="muted small">Neighbours: {NEIGHBORS.get(id)!.map(regionName).join(", ")}</p>
    </div>
  );
}

function SendTroops({ ctx, from, dest, setDest }: { ctx: Ctx; from: RegionView; dest: string | null; setDest: (id: string | null) => void }) {
  const { view, busy, act } = ctx;
  const avail = rested(from);
  const piecer = view.heroes.piecer.owner === view.me && view.heroes.piecer.region === from.id;
  const options = NEIGHBORS.get(from.id)!.filter((n) => usableLine(view, from.id, n));
  const [pick, setPick] = useState<Units>({ panda: 0, armedPanda: 0, nacam: 0, cam: 0 });
  const total = UNIT_TYPES.reduce((n, t) => n + pick[t], 0);
  const target = dest && options.includes(dest) ? regionView(view, dest) : null;
  const invading = target && target.owner !== view.me;
  const blocked = target?.owner && target.owner !== view.me && inPact(view, target.owner);
  const anyone = UNIT_TYPES.some((t) => avail[t] > 0);

  return (
    <section className="act">
      <h3>🚡 Send troops</h3>
      {!options.length ? (
        <p className="muted">No gondola lines from here yet. Build one below: gondolas are the only way to move troops.</p>
      ) : !anyone ? (
        <p className="muted">Everyone here is resting this turn.</p>
      ) : (
        <>
          <p className="muted small">Pick a destination on the globe (glowing tiles) or here{piecer ? ". The Piecer Captain is here: troops can ride on after arriving" : ""}.</p>
          <div className="dest-list">
            {options.map((n) => {
              const rv = regionView(view, n);
              const enemy = rv.owner !== view.me;
              return (
                <button key={n} className={`chip${dest === n ? " on" : ""}${enemy ? " enemy" : ""}`} onClick={() => setDest(dest === n ? null : n)}>
                  {enemy ? "⚔️" : "➡️"} {regionName(n)}
                </button>
              );
            })}
          </div>
          {target && (
            <>
              {invading && (
                <p className="small">
                  Defending: {target.fog ? "unknown" : unitLine(target.units)}
                  {target.buildings?.includes("fort") && " · 🏰 fort (+1)"}
                  {target.owner ? ` · ${playerName(view, target.owner)}` : target.native ? ` · ${NATIVE_LABEL[target.native]}` : ""}
                </p>
              )}
              <div className="unit-pick">
                {UNIT_TYPES.filter((t) => avail[t] > 0).map((t) => (
                  <label key={t}>
                    <span>
                      {UNITS[t].icon} {UNITS[t].plural} <span className="muted">({avail[t]})</span>
                    </span>
                    <Stepper value={pick[t]} max={avail[t]} onChange={(n) => setPick({ ...pick, [t]: n })} label={UNITS[t].plural} />
                  </label>
                ))}
              </div>
              {invading && (
                <>
                  <OddsLine odds={attackOdds(view, from.id, target.id, total ? pick : avail)} />
                  {!total && <p className="muted small">That&rsquo;s with everyone rested here. Pick who goes, or tap All.</p>}
                </>
              )}
              <div className="form-actions">
                <button type="button" className="btn ghost small" onClick={() => setPick({ ...avail })}>All</button>
                <button
                  className={`btn${invading ? " danger" : ""}`}
                  disabled={busy || !total || Boolean(blocked)}
                  onClick={async () => {
                    if (await act({ type: "move", from: from.id, to: target.id, units: pick })) {
                      setPick({ panda: 0, armedPanda: 0, nacam: 0, cam: 0 });
                      setDest(null);
                    }
                  }}
                >
                  {blocked ? "You have a pact 🤝" : invading ? `Invade ${regionName(target.id)}` : `Send to ${regionName(target.id)}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Gondolas({ ctx, from }: { ctx: Ctx; from: RegionView }) {
  const { view } = ctx;
  const me = meOf(view);
  const strike = view.modifiers.some((m) => m.kind === "gondolaStrike");
  return (
    <section className="act">
      <h3>🚡 Urban gondolas</h3>
      <p className="muted small">
        Build a line to a neighbour to move or attack along it. Cost: <CostChips cost={view.prices.gondola} have={me.goods} />
        {strike && " · ⚠️ Gondola strike this round"}
      </p>
      <ul className="gondola-list">
        {NEIGHBORS.get(from.id)!.map((n) => {
          const line = view.lines.find((l) => l.id === lineId(from.id, n));
          return (
            <li key={n}>
              <span>{regionName(n)}</span>
              {line ? (
                <span className="muted small">{line.owner === view.me ? "✅ your line" : `${playerName(view, line.owner)}'s line`}</span>
              ) : (
                <DoButton ctx={ctx} cost={view.prices.gondola} action={{ type: "gondola", from: from.id, to: n }} disabled={strike}>
                  Build
                </DoButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Recruit({ ctx, region }: { ctx: Ctx; region: RegionView }) {
  const { view } = ctx;
  const [n, setN] = useState<Record<string, number>>({ panda: 1, nacam: 1, cam: 1, armedPanda: 1 });
  const rows: UnitType[] = ["panda", "nacam", "cam"];
  return (
    <section className="act">
      <h3>🪖 Recruit</h3>
      {rows.map((t) => {
        const cost = times(view.prices.units[t], n[t]);
        const needsGym = t === "cam" && !region.buildings?.includes("gym");
        return (
          <div className="recruit-row" key={t}>
            <div>
              <strong>
                {UNITS[t].icon} {UNITS[t].label}
              </strong>{" "}
              <span className="muted small">
                atk +{UNITS[t].attack} · def +{UNITS[t].defense}
              </span>
              <p className="muted small">{needsGym ? "Needs a CAM Gym in this region." : UNITS[t].blurb}</p>
            </div>
            <div className="recruit-buy">
              <Stepper value={n[t]} min={1} max={20} onChange={(v) => setN({ ...n, [t]: v })} label={UNITS[t].plural} />
              <DoButton ctx={ctx} cost={cost} action={{ type: "recruit", region: region.id, unit: t as "panda" | "nacam" | "cam", count: n[t] }} disabled={needsGym}>
                <CostChips cost={cost} />
              </DoButton>
            </div>
          </div>
        );
      })}
      {(region.units?.panda ?? 0) > 0 && (
        <div className="recruit-row">
          <div>
            <strong>🛡️ Arm pandas</strong> <span className="muted small">atk +1 · def +2</span>
            <p className="muted small">{UNITS.armedPanda.blurb}</p>
          </div>
          <div className="recruit-buy">
            <Stepper value={Math.min(n.armedPanda, region.units!.panda)} min={1} max={region.units!.panda} onChange={(v) => setN({ ...n, armedPanda: v })} label="pandas to arm" />
            <DoButton
              ctx={ctx}
              cost={times(UNITS.armedPanda.cost, Math.min(n.armedPanda, region.units!.panda))}
              action={{ type: "arm", region: region.id, count: Math.min(n.armedPanda, region.units!.panda) }}
            >
              <CostChips cost={times(UNITS.armedPanda.cost, Math.min(n.armedPanda, region.units!.panda))} />
            </DoButton>
          </div>
        </div>
      )}
    </section>
  );
}

function Build({ ctx, region }: { ctx: Ctx; region: RegionView }) {
  const todo = BUILDING_TYPES.filter((b) => !region.buildings?.includes(b));
  if (!todo.length) return null;
  return (
    <section className="act">
      <h3>🏗️ Build</h3>
      {todo.map((b) => (
        <div className="recruit-row" key={b}>
          <div>
            <strong>
              {BUILDINGS[b].icon} {BUILDINGS[b].label}
            </strong>
            <p className="muted small">{BUILDINGS[b].blurb}</p>
          </div>
          <DoButton ctx={ctx} cost={BUILDINGS[b].cost} action={{ type: "build", region: region.id, building: b }}>
            <CostChips cost={BUILDINGS[b].cost} />
          </DoButton>
        </div>
      ))}
    </section>
  );
}

function HeroMoves({ ctx, region, heroes, startThunder }: { ctx: Ctx; region: RegionView; heroes: HeroId[]; startThunder: () => void }) {
  const { view, busy, act } = ctx;
  const me = meOf(view);
  const dests = NEIGHBORS.get(region.id)!.filter((n) => regionView(view, n).owner === view.me && usableLine(view, region.id, n));
  return (
    <section className="act">
      <h3>🦸 Heroes here</h3>
      {heroes.map((h) => (
        <div key={h} className="recruit-row">
          <div>
            <strong>
              {HEROES[h].icon} {HEROES[h].name}
            </strong>
            {view.heroes[h].movedTurn === view.turn && <span className="muted small"> · moved this turn</span>}
          </div>
          <div className="dest-list">
            {dests.map((d) => (
              <button key={d} className="chip" disabled={busy || view.heroes[h].movedTurn === view.turn} onClick={() => act({ type: "moveHero", hero: h, to: d })}>
                ➡️ {regionName(d)}
              </button>
            ))}
            {h === "casey" && (
              <button className="btn small danger" disabled={busy || (me.thunderReadyTurn ?? 0) > view.turn} onClick={startThunder}>
                ⚡ Thunder{(me.thunderReadyTurn ?? 0) > view.turn ? ` (ready turn ${me.thunderReadyTurn})` : ""}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function InvadeHint({ ctx, target, planAttack }: { ctx: Ctx; target: RegionView; planAttack: (from: string, to: string) => void }) {
  const { view } = ctx;
  const from = NEIGHBORS.get(target.id)!.filter((n) => regionView(view, n).owner === view.me);
  if (!from.length) return <p className="muted">You don&rsquo;t border {regionName(target.id)} yet.</p>;
  return (
    <section className="act">
      <h3>⚔️ Invade {regionName(target.id)}</h3>
      {from.map((f) => (
        <p key={f} className="small">
          From {regionName(f)}:{" "}
          {usableLine(view, f, target.id) ? (
            <>
              <button className="btn small danger" onClick={() => planAttack(f, target.id)}>
                Plan attack
              </button>{" "}
              <OddsInline odds={attackOdds(view, f, target.id, rested(regionView(view, f)))} />
            </>
          ) : (
            <span className="muted">build a gondola line first (select {regionName(f)})</span>
          )}
        </p>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- heroes

export function HeroesPanel({ ctx, selected }: { ctx: Ctx; selected: string | null }) {
  const { view } = ctx;
  const me = meOf(view);
  const home = selected && regionView(view, selected).owner === view.me ? selected : me.capital!;
  return (
    <div className="panel-body">
      <h2>Hall of Heroes</h2>
      <p className="muted small">One of each in the whole world. Heroes arrive in {regionName(home)} (select one of your regions to change that). Beaten heroes flee back here, except Casey, who is captured.</p>
      {HERO_IDS.map((h) => {
        const hero = view.heroes[h];
        const info = HEROES[h];
        const cost = view.prices.heroes[h];
        return (
          <article key={h} className={`hero-card${h === "casey" ? " legendary" : ""}`}>
            <div className="hero-icon" aria-hidden="true">{info.icon}</div>
            <div>
              <h3>
                {info.name} <span className="muted">{info.title}</span>
              </h3>
              <p className="small">{info.power}</p>
              {hero.owner ? (
                <p className="small">
                  Fights for <strong>{playerName(view, hero.owner)}</strong>
                  {hero.region ? ` in ${regionName(hero.region)}` : ""}
                </p>
              ) : (
                <div className="form-actions">
                  <DoButton ctx={ctx} cost={cost} action={{ type: "recruitHero", hero: h, region: home }}>
                    Recruit <CostChips cost={cost} have={me.goods} />
                  </DoButton>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- diplomacy

export function DiplomacyPanel({ ctx, selected }: { ctx: Ctx; selected: string | null }) {
  const { view, myTurn, busy, act } = ctx;
  const me = meOf(view);
  const loanFrom = selected && regionView(view, selected).owner === view.me ? selected : me.capital!;
  const loanAvail = rested(regionView(view, loanFrom)).panda;
  const [trading, setTrading] = useState<string | null>(null);
  const [loanN, setLoanN] = useState(1);
  const incoming = view.offers.filter((o) => o.to === view.me);
  const outgoing = view.offers.filter((o) => o.from === view.me);
  const josser = view.heroes.josserkid.owner === view.me;

  return (
    <div className="panel-body">
      <h2>Panda diplomacy</h2>
      {incoming.length > 0 && (
        <section className="act">
          <h3>📨 Offers for you</h3>
          {incoming.map((o) => (
            <div key={o.id} className="offer">
              <p className="small">
                <strong>{playerName(view, o.from)}</strong>{" "}
                {o.kind === "trade" ? (
                  <>
                    gives <CostChips cost={o.give} /> for your <CostChips cost={o.get} have={me.goods} />
                  </>
                ) : o.kind === "pact" ? (
                  "proposes a non-aggression pact 🤝"
                ) : (
                  `wants to loan you ${o.count} panda${o.count === 1 ? "" : "s"} 🐼 (a pact comes with it)`
                )}
              </p>
              <div className="form-actions">
                <button className="btn small" disabled={!myTurn || busy} onClick={() => act({ type: "respond", offerId: o.id, accept: true })}>Accept</button>
                <button className="btn ghost small" disabled={!myTurn || busy} onClick={() => act({ type: "respond", offerId: o.id, accept: false })}>Decline</button>
              </div>
            </div>
          ))}
          {!myTurn && <p className="muted small">You can answer on your turn.</p>}
        </section>
      )}

      <Race ctx={ctx} />
      <section className="act">
        <h3>🌍 The Kirds</h3>
        {view.players.map((p) => {
          const pact = p.id !== view.me && inPact(view, p.id);
          const active = p.seat === view.activeSeat;
          return (
            <div key={p.id} className="kird">
              <div className="kird-head">
                <span className="avatar-ring" style={{ borderColor: p.color }}>
                  <Avatar value={ctx.avatars[p.id]} userId={p.id} size={26} />
                </span>
                <strong>{p.id === view.me ? `${p.name} (you)` : p.name}</strong>
                {p.bot && <span className="badge">🤖 computer · {p.bot}</span>}
                {active && <span className="badge">playing</span>}
                {pact && <span className="badge">🤝 pact</span>}
                {p.oathbreaker && <span className="badge warn">💔 oathbreaker</span>}
              </div>
              <p className="muted small">
                {p.regions} region{p.regions === 1 ? "" : "s"} · {p.cards} resource cards {p.heroes.length > 0 && `· ${p.heroes.map((h) => HEROES[h].icon).join("")}`}
              </p>
              {p.id !== view.me && myTurn && (
                <div className="dest-list">
                  {pact ? (
                    <button className="chip enemy" disabled={busy} onClick={() => confirm(`Break your pact with ${p.name}? You'll be an Oathbreaker for 3 rounds.`) && act({ type: "breakPact", with: p.id })}>
                      💔 Break pact
                    </button>
                  ) : view.offers.some((o) => o.kind === "pact" && ((o.from === view.me && o.to === p.id) || (o.from === p.id && o.to === view.me))) ? (
                    <span className="chip" aria-disabled="true">🤝 Pact on the table</span>
                  ) : (
                    <button className="chip" disabled={busy} onClick={() => act({ type: "offerPact", to: p.id })}>🤝 Offer pact</button>
                  )}
                  <button className="chip" disabled={busy} onClick={() => setTrading(trading === p.id ? null : p.id)}>💱 Trade</button>
                  {josser && !pact && (
                    <button className="chip" disabled={busy || me.pickpocketTurn === view.turn} onClick={() => act({ type: "pickpocket", target: p.id })}>🃏 Pickpocket</button>
                  )}
                </div>
              )}
              {p.id !== view.me && myTurn && (
                <div className="loan-row">
                  <span className="small">🐼 Loan pandas from {regionName(loanFrom)}</span>
                  <Stepper value={Math.min(loanN, Math.max(1, loanAvail))} min={1} max={Math.max(1, loanAvail)} onChange={setLoanN} label="pandas to loan" />
                  <button className="btn small" disabled={busy || loanAvail < 1} onClick={() => act({ type: "offerLoan", to: p.id, region: loanFrom, count: Math.min(loanN, loanAvail) })}>
                    Offer loan
                  </button>
                </div>
              )}
              {trading === p.id && <TradeBuilder ctx={ctx} to={p.id} onDone={() => setTrading(null)} />}
            </div>
          );
        })}
        {view.players.some((p) => p.bot) && <p className="muted small">🤖 Computer players answer offers at the start of their turn.</p>}
        <p className="muted small">Loaned pandas earn both sides 1 🐼 PandaCoin per panda every turn and come with a pact. Breaking a pact makes you an Oathbreaker (half PandaCoin for 3 rounds).</p>
      </section>

      {outgoing.length > 0 && (
        <section className="act">
          <h3>📤 Your open offers</h3>
          {outgoing.map((o) => (
            <div key={o.id} className="offer">
              <p className="small">
                To <strong>{playerName(view, o.to)}</strong>:{" "}
                {o.kind === "trade" ? (
                  <>
                    <CostChips cost={o.give} /> for <CostChips cost={o.get} />
                  </>
                ) : o.kind === "pact" ? "pact" : `loan ${o.count} 🐼`}
              </p>
              {myTurn && <button className="btn ghost small" disabled={busy} onClick={() => act({ type: "cancelOffer", offerId: o.id })}>Withdraw</button>}
            </div>
          ))}
        </section>
      )}

      {view.loans.length > 0 && (
        <section className="act">
          <h3>🐼🤝 Panda loans</h3>
          {view.loans.map((l) => (
            <p key={l.id} className="small">
              {playerName(view, l.from)} → {playerName(view, l.to)}: {l.count} panda{l.count === 1 ? "" : "s"} since round {l.sinceRound}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function TradeBuilder({ ctx, to, onDone }: { ctx: Ctx; to: string; onDone: () => void }) {
  const { view, busy, act } = ctx;
  const me = meOf(view);
  const [give, setGive] = useState<Cost>({});
  const [get, setGet] = useState<Cost>({});
  return (
    <div className="trade-builder">
      <div className="trade-cols">
        <div>
          <p className="small"><strong>You give</strong></p>
          {GOODS.map((g) => (
            <label key={g} className="trade-line">
              <span>{GOOD_INFO[g].icon}</span>
              <Stepper value={give[g] ?? 0} max={me.goods?.[g] ?? 0} onChange={(n) => setGive({ ...give, [g]: n })} label={GOOD_INFO[g].label} />
            </label>
          ))}
        </div>
        <div>
          <p className="small"><strong>You get</strong></p>
          {GOODS.map((g) => (
            <label key={g} className="trade-line">
              <span>{GOOD_INFO[g].icon}</span>
              <Stepper value={get[g] ?? 0} max={20} onChange={(n) => setGet({ ...get, [g]: n })} label={GOOD_INFO[g].label} />
            </label>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <button className="btn small" disabled={busy} onClick={async () => (await act({ type: "offerTrade", to, give, get })) && onDone()}>Send offer</button>
        <button className="btn ghost small" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bank

export function BankPanel({ ctx }: { ctx: Ctx }) {
  const { view, myTurn, busy, act } = ctx;
  const me = meOf(view);
  const [give, setGive] = useState<Resource>("bamboo");
  const [get, setGet] = useState<Resource>("iron");
  const [buyGood, setBuyGood] = useState<Resource>("stone");
  const [buyN, setBuyN] = useState(1);
  const rate = view.prices.bankRate;
  const price = view.prices.buyPrice;
  const maxBuy = Math.max(1, Math.min(20, Math.floor((me.goods?.coin ?? 0) / price)));
  return (
    <div className="panel-body">
      <h2>World Bank</h2>
      <section className="act">
        <h3>🛒 Buy resources with Coin ({price} 🪙 each)</h3>
        <p className="muted small">Missing one card for a gondola or an army? Buy it. A Market drops the price to 2 🪙.</p>
        <div className="bank-row">
          <select value={buyGood} onChange={(e) => setBuyGood(e.target.value as Resource)} aria-label="Resource to buy">
            {RESOURCES.map((g) => (
              <option key={g} value={g}>{GOOD_INFO[g].icon} {GOOD_INFO[g].label}</option>
            ))}
          </select>
          <Stepper value={Math.min(buyN, maxBuy)} min={1} max={maxBuy} onChange={setBuyN} label="how many to buy" />
          <button
            className="btn small"
            disabled={!myTurn || busy || (me.goods?.coin ?? 0) < price * Math.min(buyN, maxBuy)}
            onClick={() => act({ type: "buy", good: buyGood, count: Math.min(buyN, maxBuy) })}
          >
            Buy for {price * Math.min(buyN, maxBuy)} 🪙
          </button>
        </div>
      </section>
      <section className="act">
        <h3>🔁 Trade resources ({rate}:1)</h3>
        <p className="muted small">
          Swap any resource for any other, 🪨 Stone included. Markets drop the rate to 3:1, and Ping the Panda Diplomat gets you 2:1. NACAM
          ogres also quarry Stone for you each turn.
        </p>
        <div className="bank-row">
          <select value={give} onChange={(e) => setGive(e.target.value as Resource)} aria-label="Give">
            {RESOURCES.map((g) => (
              <option key={g} value={g}>{rate} {GOOD_INFO[g].icon} {GOOD_INFO[g].label}</option>
            ))}
          </select>
          <span>→</span>
          <select value={get} onChange={(e) => setGet(e.target.value as Resource)} aria-label="Get">
            {RESOURCES.map((g) => (
              <option key={g} value={g}>1 {GOOD_INFO[g].icon} {GOOD_INFO[g].label}</option>
            ))}
          </select>
          <button className="btn small" disabled={!myTurn || busy || give === get || (me.goods?.[give] ?? 0) < rate} onClick={() => act({ type: "bankTrade", give, get })}>Trade</button>
        </div>
      </section>
      <section className="act">
        <h3>💱 Currency exchange</h3>
        {EXCHANGE.map((x) => (
          <div key={`${x.from}-${x.to}`} className="bank-row">
            <span>
              {x.pay} {GOOD_INFO[x.from].icon} {GOOD_INFO[x.from].label} → {x.get} {GOOD_INFO[x.to].icon} {GOOD_INFO[x.to].label}
            </span>
            <button className="btn small" disabled={!myTurn || busy || (me.goods?.[x.from] ?? 0) < x.pay} onClick={() => act({ type: "exchange", from: x.from, to: x.to })}>
              Exchange
            </button>
          </div>
        ))}
      </section>
      <section className="act">
        <h3>📜 Price list</h3>
        <ul className="price-list small">
          <li>🚡 Gondola line <CostChips cost={view.prices.gondola} /></li>
          {UNIT_TYPES.map((t) => (
            <li key={t}>
              {UNITS[t].icon} {UNITS[t].label} <CostChips cost={t === "armedPanda" ? UNITS.armedPanda.cost : view.prices.units[t]} />
            </li>
          ))}
          {BUILDING_TYPES.map((b) => (
            <li key={b}>
              {BUILDINGS[b].icon} {BUILDINGS[b].label} <CostChips cost={BUILDINGS[b].cost} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- log

const LOG_FILTERS: Record<string, { label: string; types?: string[]; mine?: boolean }> = {
  all: { label: "All" },
  battles: { label: "⚔️ Battles", types: ["battle", "capture", "thunder", "heroCaptured", "heroFled", "asylum"] },
  diplomacy: { label: "🤝 Diplomacy", types: ["offer", "pact", "loan", "betrayal", "trade", "decline", "pickpocket"] },
  world: { label: "🌍 World", types: ["world", "roll", "join", "leave", "skip"] },
  mine: { label: "🙋 Mine", mine: true },
};

export function LogPanel({
  events,
  me,
  onPick,
  onWatch,
  loadOlder,
  olderDone,
}: {
  events: GameEvent[];
  me: string;
  onPick: (e: GameEvent) => void;
  onWatch: (e: GameEvent) => void;
  loadOlder: () => Promise<void>;
  olderDone: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const f = LOG_FILTERS[filter];
  const list = useMemo(() => {
    const kept = [...events]
      .reverse()
      .filter((e) => e.type !== "endTurn")
      .filter((e) => (f.types ? f.types.includes(e.type) : true) && (f.mine ? e.actor === me : true));
    return kept.map((e, i) => ({ e, header: i === 0 || kept[i - 1].round !== e.round }));
  }, [events, f, me]);
  return (
    <div className="panel-body">
      <h2>Everything that happened</h2>
      <div className="dest-list" role="group" aria-label="Filter">
        {Object.entries(LOG_FILTERS).map(([k, v]) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{v.label}</button>
        ))}
      </div>
      <ol className="log">
        {list.map(({ e, header }) => {
          return (
            <li key={e.seq} className={`log-${e.type}`}>
              {header && <p className="log-round">Round {e.round}</p>}
              <div className="log-row">
                <button type="button" onClick={() => onPick(e)} disabled={!e.regions.length}>{e.text}</button>
                {canReplay(e) && (
                  <button type="button" className="chip" onClick={() => onWatch(e)}>▶ Watch</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!olderDone ? (
        <button
          className="btn ghost small"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await loadOlder();
            setLoading(false);
          }}
        >
          {loading ? "Loading…" : "Load older events"}
        </button>
      ) : (
        <p className="muted small">That&rsquo;s everything since the world began.</p>
      )}
    </div>
  );
}

export const GOOD_KEYS: Good[] = GOODS;
