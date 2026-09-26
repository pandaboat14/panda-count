"use client";

// 🏗️ Build, step by step: a building (Sanctuary, Gym, Market, Fort) or a gondola line, where, then confirm.

import { useEffect, useMemo, useState } from "react";
import { regionReports } from "@/game/army";
import { unitTotal } from "@/game/engine";
import { BUILDINGS, type BuildingType } from "@/game/rules";
import { pick, type PageOf } from "@/game/turnFlow";
import { afford, barred, buildOptions, lineSources, lineTargets, linesClosed, meIn, onStrike, regionIn, unitsOf, type Afford } from "@/game/turnOptions";
import { CostChips } from "../bits";
import { LineReview, NoNewLines } from "./attack";
import { Badge, Choice, Empty, Frame, Group, Review, Stale, UnitsLine, ownerColor, ownerLabel, useTurn } from "./kit";

// Pictures of each building in your colour, drawn in the browser with the board's own 3D models.
function useThumbs(owner: string) {
  const [thumbs, setThumbs] = useState<Partial<Record<BuildingType, string>>>({});
  useEffect(() => {
    let live = true;
    import("../thumbs")
      .then((m) => m.buildingThumbs(owner))
      .then((t) => live && setThumbs(t))
      .catch(() => {
        /* no WebGL: the icons stand in */
      });
    return () => {
      live = false;
    };
  }, [owner]);
  return thumbs;
}

function BuildingPic({ type, size = 56 }: { type: BuildingType; size?: number }) {
  const t = useTurn();
  const src = useThumbs(meIn(t.view).color)[type];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- drawn in the browser as a data URL
    <img className="build-thumb" src={src} alt="" width={size} height={size} />
  ) : (
    <span className="build-thumb" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {BUILDINGS[type].icon}
    </span>
  );
}

// What each building is for, in a line you can act on.
const WHY: Record<BuildingType, string> = {
  sanctuary: "Pays +2 🐼 PandaCoin every turn, wherever it stands.",
  gym: "Pays +1 💪 CamCoin every turn, and lets you train 💪 CAMs in that region.",
  market: "Pays +2 🪙 every turn, and makes the Bank cheaper everywhere (3:1 swaps, resources for 2 🪙).",
  fort: "Every defending die in that region gets +1. Best on a border that's under threat.",
};

export function AffordBadge({ a }: { a: Afford }) {
  if (a.status === "yes") return <Badge kind="ok">✅ can afford</Badge>;
  if (a.status === "buy") return <Badge kind="warn">🛒 buys what&rsquo;s missing</Badge>;
  return <Badge kind="bad">❌ short</Badge>;
}

export function BuildWhat({ page }: { page: PageOf<"buildWhat"> }) {
  const t = useTurn();
  const options = buildOptions(t.view);
  const goods = meIn(t.view).goods;
  const lineCost = t.view.prices.gondola;
  const lines = lineSources(t.view);
  const strike = onStrike(t.view);
  const ban = barred(t.view, "gondolas");
  return (
    <Frame page={page} question="What do you want to build?" help="Buildings pay you every turn or protect a region. Gondola lines let your troops travel.">
      <Group title="🏠 Buildings" note="One of each kind per region. They pay out every turn.">
        {options.map((o) => (
          <Choice
            key={o.building}
            icon={<BuildingPic type={o.building} />}
            pic
            title={`${BUILDINGS[o.building].icon} ${BUILDINGS[o.building].label}`}
            badge={o.where.length ? <AffordBadge a={o.afford} /> : <Badge kind="off">in every region</Badge>}
            sub={WHY[o.building]}
            disabled={!o.where.length}
            onClick={() => t.go({ step: "buildWhere", building: o.building })}
          >
            <span className="choice-note">
              <CostChips cost={o.cost} have={goods} />
              {o.where.length > 0 && ` · can go in ${o.where.length} of your regions`}
            </span>
            <HaveOne building={o.building} />
          </Choice>
        ))}
      </Group>
      <Group title="🚡 Gondola lines" note="The only way troops travel: a line joins one of your regions to a neighbour.">
        <Choice
          icon="🚡"
          title="Gondola line"
          badge={
            strike ? (
              <Badge kind="off">on strike this round</Badge>
            ) : ban ? (
              <Badge kind="off">🚧 gondola ban</Badge>
            ) : lines.length ? (
              <AffordBadge a={afford(t.view, lineCost)} />
            ) : (
              <Badge kind="off">all joined</Badge>
            )
          }
          sub={
            strike
              ? "The gondola workers are on strike this round. Lines open again next round."
              : ban
                ? "A war crimes sentence bans you from building lines. Your old lines still run."
                : "Join one of your regions to a neighbour, to move troops there or attack it."
          }
          disabled={strike || ban || !lines.length}
          onClick={() => t.go({ step: "lineFrom" })}
        >
          <span className="choice-note">
            <CostChips cost={lineCost} have={goods} />
            {lines.length > 0 && ` · ${lines.length} of your regions can start one`}
          </span>
        </Choice>
      </Group>
    </Frame>
  );
}

// Where you already have one.
function HaveOne({ building }: { building: BuildingType }) {
  const t = useTurn();
  const have = t.view.regions.filter((r) => r.owner === t.view.me && r.buildings?.includes(building)).map((r) => t.name(r.id));
  return <span className="choice-note muted">{have.length ? `You have one in ${have.join(", ")}` : "You don't have one yet"}</span>;
}

export function BuildWhere({ page }: { page: PageOf<"buildWhere"> }) {
  const t = useTurn();
  const b = BUILDINGS[page.building];
  const where = buildOptions(t.view).find((o) => o.building === page.building)!.where;
  const danger = useMemo(() => new Map(regionReports(t.view).map((r) => [r.region.id, r.danger])), [t.view]);
  const cap = meIn(t.view).capital;
  return (
    <Frame page={page} question={`Where should the ${b.label} go?`} help={`See-through ${b.label}s float over every region it could go in. Tap one on the globe, or pick below.`}>
      {!where.length && <Empty>Every one of your regions already has a {b.label}.</Empty>}
      <div className="choice-list">
        {where.map((id) => {
          const r = regionIn(t.view, id)!;
          const d = danger.get(id);
          return (
            <Choice
              key={id}
              icon={id === cap ? "👑" : "🏠"}
              title={t.name(id)}
              badge={d && d.win >= 0.2 ? <Badge kind={d.win >= 0.5 ? "bad" : "warn"}>⚠️ at risk</Badge> : null}
              sub={
                <>
                  <UnitsLine u={r.units} none="no troops" />
                  {r.buildings?.length ? ` · ${r.buildings.map((x) => BUILDINGS[x].icon).join(" ")}` : ""}
                </>
              }
              onClick={() => {
                const next = pick(page, id, t.view);
                if (next) t.go(next);
              }}
            >
              {d && d.win >= 0.2 && (
                <span className="choice-note">
                  {t.view.players.find((p) => p.id === d.owner)?.name} could take it from {t.name(d.from)} ({Math.round(d.win * 100)}%)
                </span>
              )}
            </Choice>
          );
        })}
      </div>
    </Frame>
  );
}

export function BuildReview({ page }: { page: PageOf<"buildReview"> }) {
  const t = useTurn();
  const b = BUILDINGS[page.building];
  const r = regionIn(t.view, page.region);
  const why = r?.owner !== t.view.me ? `${t.name(page.region)} isn't yours any more.` : r.buildings?.includes(page.building) ? `${t.name(page.region)} already has a ${b.label}.` : null;
  return (
    <Frame page={page} question={`Build the ${b.label}?`} help="Check it over, then build.">
      <Review
        title={
          <>
            🏗️ Build a {b.icon} <strong>{b.label}</strong> in <strong>{t.name(page.region)}</strong>
          </>
        }
        cost={b.cost}
        afford={afford(t.view, b.cost)}
        blocked={why}
        label={`🏗️ Build the ${b.label}`}
        onGo={() => t.run({ type: "build", region: page.region, building: page.building }, { cost: b.cost })}
      >
        <span className="review-pic">
          <BuildingPic type={page.building} size={72} />
        </span>
        <p className="review-effect">{WHY[page.building]}</p>
      </Review>
    </Frame>
  );
}

export function LineFrom({ page }: { page: PageOf<"lineFrom"> }) {
  const t = useTurn();
  const sources = lineSources(t.view);
  return (
    <Frame page={page} question="Start the line from which of your regions?" help="Tap one of your glowing regions, or pick one below.">
      {linesClosed(t.view) && (
        <p className="warn-line">
          ⚠️ <NoNewLines />
        </p>
      )}
      {!sources.length && <Empty>Every one of your regions is already joined to all its neighbours.</Empty>}
      <div className="choice-list">
        {sources.map((id) => {
          const ends = lineTargets(t.view, id);
          return (
            <Choice
              key={id}
              icon="🏠"
              title={t.name(id)}
              sub={`${ends.length} neighbour${ends.length === 1 ? "" : "s"} without a line: ${ends.map((r) => t.name(r.id)).join(", ")}`}
              onClick={() => {
                const next = pick(page, id, t.view);
                if (next) t.go(next);
              }}
            />
          );
        })}
      </div>
    </Frame>
  );
}

export function LineTo({ page }: { page: PageOf<"lineTo"> }) {
  const t = useTurn();
  const ends = lineTargets(t.view, page.from);
  if (regionIn(t.view, page.from)?.owner !== t.view.me) {
    return (
      <Frame page={page} question="Run the line to where?">
        <Stale why={`${t.name(page.from)} isn't yours any more.`} />
      </Frame>
    );
  }
  return (
    <Frame page={page} question={`Run the line from ${t.name(page.from)} to where?`} help="Its neighbours without a line. Tap a glowing one on the globe, or pick below.">
      <div className="choice-list">
        {ends.map((r) => {
          const mine = r.owner === t.view.me;
          const empty = !r.owner && !unitTotal(unitsOf(r));
          return (
            <Choice
              key={r.id}
              swatch={ownerColor(t, r)}
              icon={mine ? "🏠" : empty ? "🏳️" : "⚔️"}
              title={t.name(r.id)}
              badge={mine ? <Badge kind="ok">yours</Badge> : empty ? <Badge kind="info">empty</Badge> : <Badge kind="warn">not yours</Badge>}
              sub={
                <>
                  {ownerLabel(t, r)} · <UnitsLine u={r.units} none="no troops" />
                </>
              }
              onClick={() => {
                const next = pick(page, r.id, t.view);
                if (next) t.go(next);
              }}
            >
              <span className="choice-note">{mine ? "For moving troops between your regions" : empty ? "Then walk in and claim it" : "Opens the way to attack it"}</span>
            </Choice>
          );
        })}
      </div>
    </Frame>
  );
}

export function LineReviewPage({ page }: { page: PageOf<"lineReview"> }) {
  return (
    <Frame page={page} question="Build the gondola line?" help="Check it over, then build.">
      <LineReview from={page.from} to={page.to} />
    </Frame>
  );
}
