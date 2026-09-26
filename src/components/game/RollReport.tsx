"use client";

import type { CSSProperties, ReactNode } from "react";
import type { GameView, PlayerView } from "@/game/engine";
import { REGION_BY_ID } from "@/game/regions";
import { GOODS, GOOD_INFO, RAID_THRESHOLD, type Cost, type Good } from "@/game/rules";
import { cardCount, type Payout, type RollShow } from "@/game/rollReport";
import { GOOD_COLORS, inkOn } from "./colors";

const regionName = (id: string) => REGION_BY_ID.get(id)?.name ?? id;
const an = (n: number) => (n === 8 || n === 11 ? "an" : "a");

function andList(items: ReactNode[]) {
  return items.map((item, i) => (
    <span key={i}>
      {i > 0 && (i === items.length - 1 ? " and " : ", ")}
      {item}
    </span>
  ));
}

function Chip({ good, n, loss = false }: { good: Good; n: number; loss?: boolean }) {
  return (
    <span className={`good-chip${loss ? " loss" : ""}`} style={{ "--res": GOOD_COLORS[good] } as CSSProperties}>
      <b>
        {loss || n < 0 ? "−" : "+"}
        {Math.abs(n)}
      </b>
      <span aria-hidden="true">{GOOD_INFO[good].icon}</span>
      <span className="lbl">{GOOD_INFO[good].label}</span>
    </span>
  );
}

function Chips({ cost, loss }: { cost: Cost; loss?: boolean }) {
  return GOODS.filter((g) => cost[g]).map((g) => <Chip key={g} good={g} n={cost[g]!} loss={loss} />);
}

function Who({ p, me }: { p: PlayerView; me: string }) {
  return (
    <span className="who" style={{ "--c": p.color } as CSSProperties}>
      <span className="dot" />
      {p.id === me ? "You" : `${p.bot ? "🤖 " : ""}${p.name}`}
    </span>
  );
}

// Where a player's gains came from: the regions the viewer can see, or the fog.
function sources(pays: Payout[]) {
  const named = pays.filter((p) => p.region).map((p) => regionName(p.region!));
  if (pays.some((p) => !p.region)) named.push("from the fog");
  return named.join(", ");
}

// What the dice did to one player, for their row (and yours).
function Outcome({ show, pid, me, pays }: { show: RollShow; pid: string; me: string; pays: Payout[] }) {
  if (show.total === 7) {
    const lost = show.raided?.[pid] ?? 0;
    if (!lost) return <span className="safe">Safe</span>;
    if (pid === me && show.raid) {
      return (
        <>
          <Chips cost={show.raid.lost} loss />
          <span className="r-src">
            lost {lost} of {show.raid.held} cards
          </span>
        </>
      );
    }
    return (
      <>
        <span className="good-chip loss">
          <b>−{lost}</b> cards
        </span>
        <span className="r-src">half {pid === me ? "your" : "their"} hand</span>
      </>
    );
  }
  const got = show.got?.[pid];
  if (!got || !cardCount(got)) return <span className="none">nothing this time</span>;
  return (
    <>
      <Chips cost={got} />
      <span className="r-src">{sources(pays.filter((p) => p.player === pid))}</span>
    </>
  );
}

// "8 pays out on Sichuan (yours) and Japan (Mei)…", in plain words, without giving away the fog.
function Where({ show, view, pays }: { show: RollShow; view: GameView; pays: Payout[] }) {
  if (show.total === 7) return <>Nobody collects on a 7. Anyone holding more than {RAID_THRESHOLD} resource cards loses half, picked at random.</>;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const paid = pays.filter((p) => p.region);
  const foggy = [...new Set(pays.filter((p) => !p.region).map((p) => p.player))].map((id) => byId.get(id)).filter((p): p is PlayerView => Boolean(p));
  const open = view.regions.filter((r) => !r.fog && !r.owner && r.token === show.total);
  const owner = (pid: string) => (pid === view.me ? "yours" : (byId.get(pid)?.name ?? "someone"));
  return (
    <>
      {paid.length > 0 && (
        <>
          <b>{show.total}</b> pays out on{" "}
          {andList(
            paid.map((p) => (
              <>
                {regionName(p.region!)}{" "}
                <span className="own" style={{ "--c": byId.get(p.player)?.color } as CSSProperties}>
                  ({owner(p.player)})
                </span>
              </>
            )),
          )}
          .{" "}
        </>
      )}
      {foggy.length > 0 && <>{andList(foggy.map((p) => (p.id === view.me ? "You" : p.name)))} {foggy.length > 1 ? "collect" : "collects"} from land hidden in the fog. </>}
      {!paid.length && !foggy.length && <>Nobody collects on {an(show.total)} <b>{show.total}</b> this time. </>}
      {open.length > 0 && (
        <span className="muted">
          {open.length <= 2
            ? `${open.map((r) => regionName(r.id)).join(" and ")} ${open.length > 1 ? "show" : "shows"} ${show.total} too, but nobody holds ${open.length > 1 ? "them" : "it"} yet.`
            : `${open.length} unclaimed regions show ${show.total} too; nobody collects there.`}{" "}
        </span>
      )}
      {show.blight && <span className="muted">Bamboo blight: bamboo regions pay nothing this round.</span>}
    </>
  );
}

// The written result: the throw, where it paid, what you get, and what everyone else got.
export function RollReport({ show, view, payouts }: { show: RollShow; view: GameView; payouts: Payout[] }) {
  const players = [...view.players].sort((a, b) => a.seat - b.seat);
  const seven = show.total === 7;
  const known = seven ? show.raided !== null : show.got !== null;
  const color = view.players.find((p) => p.id === show.roller)?.color ?? "#d64a2b";
  const myColor = view.players.find((p) => p.id === view.me)?.color;
  const die = { background: color, color: inkOn(color) };
  const inc = show.income;
  const income: Cost = inc ? { coin: inc.coin, pandaCoin: inc.pandaCoin, camCoin: inc.camCoin } : {};
  return (
    <div className="dice-report">
      <div className="r-roll">
        <span className="sr-only">
          Rolled {show.roll[0]} and {show.roll[1]}: {show.total}.
        </span>
        <span className="r-dice" aria-hidden="true">
          <span className="die-chip" style={die}>{show.roll[0]}</span>
          <span className="op">+</span>
          <span className="die-chip" style={die}>{show.roll[1]}</span>
          <span className="op">=</span>
          <span className="r-total">{show.total}</span>
        </span>
        {seven && (
          <p className="raid-banner">
            OGRE RAID! <span aria-hidden="true">👹</span>
          </p>
        )}
      </div>
      {known ? (
        <p className="r-where">
          <Where show={show} view={view} pays={payouts} />
        </p>
      ) : (
        show.lines.map((l) => (
          <p className="r-where" key={l}>
            {l}
          </p>
        ))
      )}
      {(known || inc || show.incomeText) && (
        <section className="r-card you-card" style={{ "--c": myColor } as CSSProperties}>
          <h3>You get</h3>
          {known && (
            <div className="r-line">
              <span className="r-label">From the dice</span>
              <div className="r-val">{seven ? <span className="none">nothing on a 7</span> : <Outcome show={show} pid={view.me} me={view.me} pays={payouts} />}</div>
            </div>
          )}
          {known && seven && (
            <div className="r-line">
              <span className="r-label">Ogre raid</span>
              <div className="r-val">
                <Outcome show={show} pid={view.me} me={view.me} pays={payouts} />
              </div>
            </div>
          )}
          {inc && (
            <>
              <div className="r-line r-turn">
                <span className="r-label">Turn harvest</span>
                <div className="r-val">
                  {cardCount(inc.harvest) ? <Chips cost={inc.harvest} /> : <span className="none">nothing</span>}
                  {inc.quarried > 0 && (
                    <>
                      <span className="r-note">+ ogre quarry</span>
                      <Chip good="stone" n={inc.quarried} />
                    </>
                  )}
                </div>
              </div>
              <div className="r-line">
                <span className="r-label">Turn income</span>
                <div className="r-val">
                  <Chips cost={income} />
                  {inc.wages > 0 && <span className="r-note">after {inc.wages} 🪙 ogre wages</span>}
                  {inc.deserted > 0 && (
                    <span className="r-note warn">
                      {inc.deserted} unpaid ogre{inc.deserted === 1 ? "" : "s"} deserted!
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
          {show.incomeText && <p className="r-note">Your turn: {show.incomeText}</p>}
        </section>
      )}
      {known && (
        <section className="r-card">
          <h3>{seven ? "Everyone after the raid" : "Everyone from this roll"}</h3>
          <ul className="everyone">
            {players.map((p) => (
              <li key={p.id}>
                <Who p={p} me={view.me} />
                <div className="r-val">
                  <Outcome show={show} pid={p.id} me={view.me} pays={payouts} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
