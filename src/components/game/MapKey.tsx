"use client";

// A key to the globe: whose colour is whose, what's on each hex, and what the markers mean.

import { useState } from "react";
import type { GameView } from "@/game/engine";
import { GOOD_INFO, RESOURCES } from "@/game/rules";
import { NATIVE_COLORS, RESOURCE_COLORS } from "./colors";
import { FlagIcon, initialOf } from "./Flag";

export function MapKey({ view, allNames, setAllNames }: { view: GameView; allNames: boolean; setAllNames: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const me = view.players.find((p) => p.id === view.me)!;
  const others = view.players.filter((p) => p.id !== view.me);
  return (
    <div className="glossary map-key">
      <button type="button" className="glossary-toggle" aria-expanded={open} aria-controls="map-key" onClick={() => setOpen(!open)}>
        {open ? "▴ Hide the map key" : "🗺️ Map key"}
      </button>
      {open && (
        <div id="map-key" className="glossary-list">
          <div>
            <p className="key-head">Whose land</p>
            <ul className="key-list">
              <li>
                <FlagIcon color={me.color} mine size={18} /> <strong>Yours</strong>: your flag, a thick glowing border with a white edge, and a
                name tag (a green dot means troops there are ready to move)
              </li>
              {others.map((p) => (
                <li key={p.id}>
                  <FlagIcon color={p.color} mine={false} initial={initialOf(p.name)} size={18} /> {p.bot ? "🤖 " : ""}
                  {p.name}
                </li>
              ))}
              <li>
                <span className="swatch" style={{ background: NATIVE_COLORS.pandas }} /> <span className="swatch" style={{ background: NATIVE_COLORS.nacams }} />{" "}
                <span className="swatch" style={{ background: NATIVE_COLORS.cams }} /> <span className="swatch" style={{ background: NATIVE_COLORS.wild }} /> Natives: Panda
                Nation, NACAM Ogres, CAMs, wild pandas
              </li>
              <li>
                <span className="swatch" style={{ background: "#8c939b" }} /> Grey with a cloud: fog, you can&rsquo;t see inside
              </li>
            </ul>
          </div>
          <div>
            <p className="key-head">On each hex</p>
            <ul className="key-list">
              <li>
                {RESOURCES.map((g) => (
                  <span key={g} className="swatch" style={{ background: RESOURCE_COLORS[g] }} title={GOOD_INFO[g].label} />
                ))}{" "}
                Its fill is what it produces: {RESOURCES.map((g) => GOOD_INFO[g].icon).join(" ")}
              </li>
              <li>The number is its dice number. Red 6 and 8 come up most often.</li>
              <li>The figures are the army there, with a badge saying how many. Zoom in to see the whole squad.</li>
              <li>Buildings stand on it, each with a pin: 🏯 Sanctuary, 🏋️ Gym, 🏪 Market; walls all round mean a 🏰 Fort.</li>
            </ul>
          </div>
          <div>
            <p className="key-head">Markers</p>
            <ul className="key-list">
              <li>
                <span className="ring-dot" style={{ background: "#22d3ee" }} /> Light-blue pin: the region you&rsquo;re looking at.
              </li>
              <li>
                Rings you can tap for the step you&rsquo;re on: <span className="ring-dot" style={{ borderColor: "#ffc53d" }} /> gold, one of yours;{" "}
                <span className="ring-dot" style={{ borderColor: "#3b8cff" }} /> blue, your land to send troops to;{" "}
                <span className="ring-dot" style={{ borderColor: "#ff4d4f" }} /> red, to invade;{" "}
                <span className="ring-dot dashed" /> dashed, a gondola line has to go there first;{" "}
                <span className="ring-dot" style={{ borderColor: "#b566ff" }} /> purple, thunder.
              </li>
              <li>Glowing arrow: the attack or move you&rsquo;re planning.</li>
              <li>Cables between masts, with a cabin: gondola lines, in their builder&rsquo;s colour.</li>
            </ul>
          </div>
          <label className="key-toggle">
            <input type="checkbox" checked={allNames} onChange={(e) => setAllNames(e.target.checked)} /> Show every region&rsquo;s name
          </label>
        </div>
      )}
    </div>
  );
}
