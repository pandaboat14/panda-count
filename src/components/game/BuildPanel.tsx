"use client";

import { useEffect, useState } from "react";
import type { GameView } from "@/game/engine";
import { BUILDINGS, BUILDING_TYPES, type BuildingType } from "@/game/rules";
import { CostChips } from "./bits";
import { DoButton, meOf, regionName, type Ctx } from "./panels";

// The building you're placing and the region picked for it so far.
export type Placement = { type: BuildingType; site: string | null };

// Regions of yours that don't have this building yet.
export function sitesFor(view: GameView, type: BuildingType) {
  return view.regions.filter((r) => r.owner === view.me && !r.buildings?.includes(type)).map((r) => r.id);
}

// Pictures of each building, drawn in the browser with the board's own 3D models.
function useThumbs(owner: string) {
  const [thumbs, setThumbs] = useState<Partial<Record<BuildingType, string>>>({});
  useEffect(() => {
    let live = true;
    import("./thumbs")
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

function Thumb({ src, type, size }: { src?: string; type: BuildingType; size: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- drawn in the browser as a data URL
    <img className="build-thumb" src={src} alt="" width={size} height={size} />
  ) : (
    <span className="build-thumb" style={{ width: size, height: size }} aria-hidden="true">
      {BUILDINGS[type].icon}
    </span>
  );
}

// "What can I build, and how?": every building with what it does, what it costs and where you have one.
// Pick one and the globe lights up the regions it can go in; tap one and build.
export function BuildPanel({ ctx, placing, setPlacing }: { ctx: Ctx; placing: Placement | null; setPlacing: (p: Placement | null) => void }) {
  const { view, myTurn, over } = ctx;
  const me = meOf(view);
  const thumbs = useThumbs(me.color);

  if (placing) {
    const info = BUILDINGS[placing.type];
    const sites = sitesFor(view, placing.type);
    return (
      <div className="panel-body build-tab">
        <button type="button" className="linkish" onClick={() => setPlacing(null)}>
          ← All buildings
        </button>
        <div className="placing-head">
          <Thumb src={thumbs[placing.type]} type={placing.type} size={88} />
          <div>
            <p className="kicker">You&rsquo;re placing</p>
            <h3>
              {info.icon} {info.label}
            </h3>
            <p className="small">{info.blurb}</p>
            <CostChips cost={info.cost} have={me.goods} />
          </div>
        </div>
        {sites.length ? (
          <>
            <p className="small">
              <strong>Tap a glowing region on the globe</strong>, or pick one here:
            </p>
            <div className="dest-list">
              {sites.map((id) => (
                <button key={id} type="button" className={`chip${placing.site === id ? " on" : ""}`} onClick={() => setPlacing({ ...placing, site: id })}>
                  {regionName(view, id)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted small">Every region of yours already has one.</p>
        )}
        <div className="form-actions">
          {placing.site ? (
            <DoButton
              ctx={ctx}
              className="btn"
              cost={info.cost}
              action={{ type: "build", region: placing.site, building: placing.type }}
              onDone={() => setPlacing(null)}
            >
              Build in {regionName(view, placing.site)}
            </DoButton>
          ) : (
            <button type="button" className="btn" disabled>
              Pick a region first
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => setPlacing(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body build-tab">
      <h2>Build</h2>
      <p className="muted small">Buildings pay out every turn. Each of your regions can hold one of each.</p>
      <ol className="build-steps">
        <li>
          <b>1</b>Pick a building
        </li>
        <li>
          <b>2</b>Tap a glowing region
        </li>
        <li>
          <b>3</b>Watch it go up
        </li>
      </ol>
      {!myTurn && !over && <p className="muted small">You can build on your turn. Until then, here&rsquo;s what&rsquo;s on offer.</p>}
      {BUILDING_TYPES.map((type) => {
        const info = BUILDINGS[type];
        const have = view.regions.filter((r) => r.owner === view.me && r.buildings?.includes(type));
        const room = sitesFor(view, type).length;
        return (
          <article key={type} className="build-card">
            <Thumb src={thumbs[type]} type={type} size={80} />
            <div>
              <h3>
                {info.icon} {info.label}
              </h3>
              <p className="small">{info.blurb}</p>
              <CostChips cost={info.cost} have={me.goods} />
              <p className="muted small">
                {have.length ? `In ${have.map((r) => regionName(view, r.id)).join(", ")}` : "You don’t have one yet"}
                {" · "}
                {room ? `room in ${room} more` : "every region has one"}
              </p>
              <button
                type="button"
                className="btn small"
                disabled={!myTurn || ctx.busy || !room}
                onClick={() => setPlacing({ type, site: null })}
              >
                Place a {info.label}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
