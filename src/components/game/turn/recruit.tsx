"use client";

// 🪖 Recruit, step by step: which unit, where, how many, then confirm.

import { useState } from "react";
import type { Action, Units } from "@/game/engine";
import { UNITS } from "@/game/rules";
import { pick, type PageOf } from "@/game/turnFlow";
import { RECRUIT_KINDS, afford, barred, meIn, recruitCost, recruitLimit, recruitPlaces, regionIn, scaleCost, unitsOf, type RecruitKind } from "@/game/turnOptions";
import { CostChips, Stepper } from "../bits";
import { SanctionNote } from "../panels";
import { Badge, Choice, Delta, Empty, Frame, Review, Stale, UnitsLine, useTurn } from "./kit";

export const KIND_INFO: Record<RecruitKind, { icon: string; name: string; one: string; many: string; role: string }> = {
  panda: { icon: "🐼", name: "Pandas", one: "panda", many: "pandas", role: "Cheap, stubborn defenders. Every 3 pandas you own earn 1 🐼 PandaCoin a turn." },
  nacam: { icon: "👹", name: "NACAM Ogres", one: "NACAM ogre", many: "NACAM ogres", role: "Hard hitters for the price. 1 🪙 wages a turn each, and each may quarry 🪨 Stone." },
  cam: { icon: "💪", name: "CAMs", one: "CAM", many: "CAMs", role: "Great at attack and defence. They only train at a CAM Gym." },
  arm: { icon: "🛡️", name: "Arm pandas", one: "armed panda", many: "armed pandas", role: "Give pandas you already have a spear and a helmet: attack +1, defence +2." },
};

const stats = (k: RecruitKind) => {
  const u = UNITS[k === "arm" ? "armedPanda" : k];
  return `attack +${u.attack} · defence +${u.defense}`;
};

export function RecruitWhat({ page }: { page: PageOf<"recruitWhat"> }) {
  const t = useTurn();
  const goods = meIn(t.view).goods;
  return (
    <Frame
      page={page}
      question={page.region ? `Recruit what in ${t.name(page.region)}?` : "What do you want to recruit?"}
      help="New troops rest this turn and can fight on your next one. In battle, each unit adds its bonus to its die."
    >
      <SanctionNote view={t.view} sanction="arms" />
      <div className="choice-list">
        {RECRUIT_KINDS.map((k) => {
          const info = KIND_INFO[k];
          const places = recruitPlaces(t.view, k).filter((id) => !page.region || id === page.region);
          const max = recruitLimit(t.view, k, page.region);
          const why = !places.length
            ? k === "cam"
              ? page.region
                ? `${t.name(page.region)} has no CAM Gym`
                : "Build a 🏋️ CAM Gym first"
              : k === "arm"
                ? "No pandas to arm there"
                : "Nowhere to recruit"
            : barred(t.view, "arms")
              ? "🚫 arms embargo"
              : !max
                ? "Can't afford one yet"
                : null;
          return (
            <Choice
              key={k}
              icon={info.icon}
              title={info.name}
              badge={why ? <Badge kind={places.length ? "bad" : "off"}>{why}</Badge> : <Badge kind="ok">up to {max}</Badge>}
              sub={info.role}
              disabled={!places.length || barred(t.view, "arms")}
              onClick={() => t.go(page.region ? { step: "recruitCount", unit: k, region: page.region } : { step: "recruitWhere", unit: k })}
            >
              <span className="choice-note">
                {stats(k)} · each <CostChips cost={recruitCost(t.view, k)} have={goods} />
              </span>
            </Choice>
          );
        })}
      </div>
    </Frame>
  );
}

export function RecruitWhere({ page }: { page: PageOf<"recruitWhere"> }) {
  const t = useTurn();
  const info = KIND_INFO[page.unit];
  const places = recruitPlaces(t.view, page.unit);
  const cap = meIn(t.view).capital;
  return (
    <Frame page={page} question={`Where should the ${info.many} ${page.unit === "arm" ? "be armed" : "join"}?`} help="Tap one of your glowing regions, or pick one below. Busy borders come first.">
      {!places.length && <Empty>{page.unit === "cam" ? "You need a 🏋️ CAM Gym to train CAMs. Build one first." : "There's nowhere to do that right now."}</Empty>}
      <div className="choice-list">
        {places.map((id) => {
          const r = regionIn(t.view, id)!;
          return (
            <Choice
              key={id}
              icon={id === cap ? "👑" : "🏠"}
              title={t.name(id)}
              sub={
                page.unit === "arm" ? (
                  `${r.units?.panda ?? 0} 🐼 here to arm`
                ) : (
                  <>
                    Has <UnitsLine u={r.units} none="no troops" />
                  </>
                )
              }
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

// A region's troops after recruiting (or arming) n.
function afterRecruit(t: ReturnType<typeof useTurn>, kind: RecruitKind, region: string, n: number): Units {
  const u = unitsOf(regionIn(t.view, region));
  if (kind === "arm") {
    u.panda -= n;
    u.armedPanda += n;
  } else u[kind] += n;
  return u;
}

const actionFor = (kind: RecruitKind, region: string, count: number): Action =>
  kind === "arm" ? { type: "arm", region, count } : { type: "recruit", region, unit: kind, count };

function staleRecruit(t: ReturnType<typeof useTurn>, kind: RecruitKind, region: string) {
  if (regionIn(t.view, region)?.owner !== t.view.me) return `${t.name(region)} isn't yours any more.`;
  if (!recruitPlaces(t.view, kind).includes(region)) return kind === "cam" ? `${t.name(region)} has no CAM Gym.` : `There are no pandas to arm in ${t.name(region)}.`;
  return null;
}

export function RecruitCount({ page }: { page: PageOf<"recruitCount"> }) {
  const t = useTurn();
  const info = KIND_INFO[page.unit];
  const max = recruitLimit(t.view, page.unit, page.region);
  const [n, setN] = useState(() => page.count ?? Math.max(1, Math.min(max, 3)));
  const stale = staleRecruit(t, page.unit, page.region);
  if (stale) {
    return (
      <Frame page={page} question="How many?">
        <Stale why={stale} />
      </Frame>
    );
  }
  const count = Math.min(n, Math.max(1, max));
  const cost = scaleCost(recruitCost(t.view, page.unit), count);
  return (
    <Frame page={page} question={`How many ${info.many}?`}>
      <p className="flow-help">
        Each one costs <CostChips cost={recruitCost(t.view, page.unit)} have={meIn(t.view).goods} />. {max > 0 ? `You can afford up to ${max}.` : ""}
      </p>
      {max === 0 ? (
        <Empty>
          You can&rsquo;t afford one yet.{" "}
          <button type="button" className="btn small" onClick={() => t.go({ step: "bank" })}>
            🏦 Visit the Bank
          </button>
        </Empty>
      ) : (
        <>
          <div className="count-pick">
            <Stepper value={count} min={1} max={max} onChange={setN} label={info.many} />
            <span className="count-big" aria-hidden="true">
              {count} {info.icon}
            </span>
            <span className="troop-quick">
              {[1, 5].filter((x) => x < max).map((x) => (
                <button key={x} type="button" className="chip" onClick={() => setN(x)}>
                  {x}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => setN(max)}>
                Max {max}
              </button>
            </span>
          </div>
          <p className="review-cost-inline">
            Total: <CostChips cost={cost} have={meIn(t.view).goods} />
          </p>
          <Delta id={page.region} before={regionIn(t.view, page.region)?.units} after={afterRecruit(t, page.unit, page.region, count)} />
          <button type="button" className="btn next" onClick={() => t.go({ step: "recruitReview", unit: page.unit, region: page.region, count }, { ...page, count })}>
            Next: check it →
          </button>
        </>
      )}
    </Frame>
  );
}

export function RecruitReview({ page }: { page: PageOf<"recruitReview"> }) {
  const t = useTurn();
  const info = KIND_INFO[page.unit];
  const cost = scaleCost(recruitCost(t.view, page.unit), page.count);
  const stale = staleRecruit(t, page.unit, page.region);
  return (
    <Frame page={page} question={page.unit === "arm" ? "Arm them?" : "Recruit them?"} help="Check it over, then recruit.">
      {stale ? (
        <Stale why={stale} />
      ) : (
        <Review
          title={
            <>
              {info.icon} {page.unit === "arm" ? "Arm" : "Recruit"} <strong>{page.count}</strong> {page.unit === "arm" ? (page.count === 1 ? "panda" : "pandas") : page.count === 1 ? info.one : info.many} in{" "}
              <strong>{t.name(page.region)}</strong>
            </>
          }
          cost={cost}
          afford={afford(t.view, cost)}
          label={page.unit === "arm" ? `🛡️ Arm ${page.count}` : `🪖 Recruit ${page.count}`}
          onGo={() => t.run(actionFor(page.unit, page.region, page.count), { cost })}
        >
          <Delta id={page.region} before={regionIn(t.view, page.region)?.units} after={afterRecruit(t, page.unit, page.region, page.count)} />
          <p className="small">{page.unit === "arm" ? "Armed pandas keep their place: if they were ready to move, they still are." : "New troops rest this turn: they can move or attack on your next turn."}</p>
        </Review>
      )}
    </Frame>
  );
}
