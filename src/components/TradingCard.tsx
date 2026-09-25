"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Panda } from "@/lib/types";
import { BACKDROPS, fmtDate } from "@/lib/format";

// Small illustrated panda face; each panda gets slight variations so the cards differ.
function PandaFace({ i }: { i: number }) {
  const tilt = [18, 24, 14, 28, 20, 16][i % 6];
  const ear = [15, 17, 14, 16, 18, 15][i % 6];
  const smile = [4, 6, 3, 5, 6, 4][i % 6];
  return (
    <svg viewBox="0 0 200 170" aria-hidden="true">
      <circle cx="52" cy="42" r={ear + 9} fill="#1c1b17" />
      <circle cx="148" cy="42" r={ear + 9} fill="#1c1b17" />
      <ellipse cx="100" cy="96" rx="74" ry="66" fill="#fdf8ef" stroke="#1c1b17" strokeWidth="3" />
      <ellipse cx="70" cy="90" rx="17" ry="24" fill="#1c1b17" transform={`rotate(${tilt} 70 90)`} />
      <ellipse cx="130" cy="90" rx="17" ry="24" fill="#1c1b17" transform={`rotate(${-tilt} 130 90)`} />
      <circle cx="73" cy="88" r="6" fill="#fdf8ef" /><circle cx="74" cy="87" r="3" fill="#1c1b17" />
      <circle cx="127" cy="88" r="6" fill="#fdf8ef" /><circle cx="126" cy="87" r="3" fill="#1c1b17" />
      <ellipse cx="100" cy="118" rx="10" ry="7" fill="#1c1b17" />
      <path
        d={`M100 125 v6 M100 131 q-9 ${smile} -16 0 M100 131 q9 ${smile} 16 0`}
        stroke="#1c1b17" strokeWidth="3" fill="none" strokeLinecap="round"
      />
      <ellipse cx="58" cy="122" rx="9" ry="5" fill="#e9b8a8" opacity=".7" />
      <ellipse cx="142" cy="122" rx="9" ry="5" fill="#e9b8a8" opacity=".7" />
    </svg>
  );
}

type Props = {
  panda: Panda | null;
  index: number;
  residents: Panda[];
  canEdit: boolean;
  onClose: () => void;
};

export function TradingCardDialog({ panda, index, residents, canEdit, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (panda && !d.open) d.showModal();
    if (!panda && d.open) d.close();
  }, [panda]);

  const reduce = typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Tilt + holo sheen following the pointer.
  const onPointerMove = (e: React.PointerEvent) => {
    const c = card.current;
    if (!c || reduce) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty("--mx", `${x * 100}%`);
    c.style.setProperty("--my", `${y * 100}%`);
    c.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 10}deg)`;
  };

  const isRes = panda?.status === "resident";
  const n = residents.length;
  const number = panda && isRes
    ? `No. ${String(residents.indexOf(panda) + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`
    : "Incoming";

  return (
    <dialog
      ref={dialog}
      className="card-dialog"
      aria-label={panda ? `${panda.name}'s trading card` : undefined}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => { if (card.current) card.current.style.transform = ""; }}
    >
      {panda && (
        <>
          <button className="close" aria-label="Close card" onClick={onClose}>&times;</button>
          <article className="tcard" ref={card}>
            <div className="tcard-inner">
              <div className="tcard-top">
                <div className="tcard-name">{panda.name}<span className="tcard-cn">{panda.chinese}</span></div>
                <div className="tcard-no">{number}</div>
              </div>
              <div className="portrait" style={{ background: BACKDROPS[index % BACKDROPS.length] }}>
                <PandaFace i={index} />
              </div>
              <div className="tcard-type">Giant Panda · {panda.sex}</div>
              <ul className="stats">
                <li><span className="k">Origin</span><span>{panda.origin}, China<br /><small>{panda.birthplace}</small></span></li>
                <li><span className="k">Zoo</span><span>{panda.zoo}</span></li>
                <li><span className="k">Location</span><span>{panda.location}</span></li>
                <li><span className="k">Born</span><span>{fmtDate(panda.born)}</span></li>
                <li><span className="k">Arrived</span><span>{isRes ? fmtDate(panda.arrived) : "Coming soon"}</span></li>
              </ul>
              {panda.fact && <p className="fact">{panda.fact}</p>}
            </div>
            <div className="tcard-foot"><span>Panda Count.net</span><span>Ailuropoda melanoleuca</span></div>
          </article>
          {canEdit && (
            <div className="card-edit">
              <Link className="btn ghost" href={`/pandas/${panda.id}/edit`}>Edit {panda.name}</Link>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
