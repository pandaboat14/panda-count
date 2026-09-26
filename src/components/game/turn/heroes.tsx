"use client";

// 🦸 Heroes: hire one, move one, or use a hero's power (Casey's thunder, the Josserkid's pickpocket), step by step.

import { emptyUnits, unitTotal, type Units } from "@/game/engine";
import { HEROES, THUNDER_COOLDOWN, type UnitType } from "@/game/rules";
import { pick, type PageOf } from "@/game/turnFlow";
import { afford, barred, frontFirst, heroMoves, heroOptions, meIn, myRegions, pickpocketTargets, regionIn, thunderTargets, unitsOf } from "@/game/turnOptions";
import { SanctionNote } from "../panels";
import { ThirstNote } from "./attack";
import { CostChips } from "../bits";
import { AffordBadge } from "./build";
import { Badge, Choice, Empty, Frame, Group, Hub, Review, Stale, UnitsLine, ownerColor, ownerLabel, useTurn } from "./kit";

export function Heroes() {
  const t = useTurn();
  const heroes = heroOptions(t.view);
  const me = meIn(t.view);
  const goods = me.goods;
  const name = (id: string | null) => t.view.players.find((p) => p.id === id)?.name ?? "someone";
  const mine = heroes.filter((h) => h.owner === t.view.me);
  const free = heroes.filter((h) => !h.owner);
  const taken = heroes.filter((h) => h.owner && h.owner !== t.view.me);
  const thunderWait = (me.thunderReadyTurn ?? 0) > t.view.turn;
  const striking = barred(t.view, "heroes");
  return (
    <Hub icon="🦸" title="Heroes" sub="One of each in the whole world. A hero adds to every die in battles fought from or in his region." tone="hero">
      <SanctionNote view={t.view} sanction="heroes">
        no hero will sign up with a war criminal, and yours add nothing in battle and won&rsquo;t use their powers
      </SanctionNote>
      {mine.length > 0 && (
        <Group title="⭐ Your heroes">
          {mine.map((h) => {
            const info = HEROES[h.id];
            const moves = heroMoves(t.view, h.id);
            return (
              <article key={h.id} className={`hero-card${h.id === "casey" ? " legendary" : ""}`}>
                <div className="hero-icon" aria-hidden="true">
                  {info.icon}
                </div>
                <div>
                  <h3>
                    {info.name} <span className="muted">{info.title}</span>
                  </h3>
                  <p className="small">
                    📍 {h.region ? t.name(h.region) : "In the Hall"} · +{info.combatBonus} on every die
                  </p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn small"
                      disabled={h.moved || !moves.length}
                      title={h.moved ? "Heroes move once a turn" : !moves.length ? "No line of yours leads to another of your regions" : undefined}
                      onClick={() => t.go({ step: "heroTo", hero: h.id })}
                    >
                      🚡 Move him{h.moved ? " (moved)" : ""}
                    </button>
                    {h.id === "casey" && (
                      <button type="button" className="btn small danger" disabled={thunderWait || striking} onClick={() => t.go({ step: "thunderTarget" })}>
                        ⚡ Thunder{striking ? " (on strike)" : thunderWait ? ` (ready turn ${me.thunderReadyTurn})` : ""}
                      </button>
                    )}
                    {h.id === "josserkid" && (
                      <button type="button" className="btn small" disabled={me.pickpocketTurn === t.view.turn || striking} onClick={() => t.go({ step: "pickpocketWho" })}>
                        🃏 Pickpocket{striking ? " (on strike)" : me.pickpocketTurn === t.view.turn ? " (done this turn)" : ""}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </Group>
      )}
      <Group title="🪙 For hire" note={free.length ? "Pick one to hire. He arrives in a region of yours." : undefined}>
        {!free.length && <p className="small muted">Every hero has been hired.</p>}
        {free.map((h) => (
          <Choice
            key={h.id}
            icon={HEROES[h.id].icon}
            title={
              <>
                {HEROES[h.id].name} <span className="muted small">{HEROES[h.id].title}</span>
              </>
            }
            badge={striking ? <Badge kind="off">🪧 won&rsquo;t sign up</Badge> : <AffordBadge a={h.afford} />}
            sub={HEROES[h.id].power}
            disabled={striking}
            onClick={() => t.go({ step: "hireWhere", hero: h.id })}
          >
            <span className="choice-note">
              <CostChips cost={h.cost} have={goods} />
            </span>
          </Choice>
        ))}
      </Group>
      {taken.length > 0 && (
        <Group title="⚔️ Fighting for others">
          {taken.map((h) => (
            <p key={h.id} className="small">
              {HEROES[h.id].icon} <strong>{HEROES[h.id].name}</strong> fights for {name(h.owner)}
              {h.region ? ` in ${t.name(h.region)}` : ""}.
            </p>
          ))}
        </Group>
      )}
    </Hub>
  );
}

export function HireWhere({ page }: { page: PageOf<"hireWhere"> }) {
  const t = useTurn();
  const info = HEROES[page.hero];
  const places = frontFirst(
    t.view,
    myRegions(t.view).map((r) => r.id),
  );
  return (
    <Frame page={page} question={`Where should ${info.name} arrive?`} help={`He adds +${info.combatBonus} to every die in battles fought from or in his region. Borders first.`}>
      <div className="choice-list">
        {places.map((id) => (
          <Choice
            key={id}
            icon={id === meIn(t.view).capital ? "👑" : "🏠"}
            title={t.name(id)}
            sub={<UnitsLine u={regionIn(t.view, id)?.units} none="no troops" />}
            onClick={() => {
              const next = pick(page, id, t.view);
              if (next) t.go(next);
            }}
          />
        ))}
      </div>
    </Frame>
  );
}

export function HireReview({ page }: { page: PageOf<"hireReview"> }) {
  const t = useTurn();
  const info = HEROES[page.hero];
  const cost = t.view.prices.heroes[page.hero];
  const owner = t.view.heroes[page.hero].owner;
  const why = owner
    ? `${info.name} already fights for ${owner === t.view.me ? "you" : t.view.players.find((p) => p.id === owner)?.name}.`
    : barred(t.view, "heroes")
      ? "🪧 Heroes on strike: no hero will sign up with a war criminal."
      : regionIn(t.view, page.region)?.owner !== t.view.me
        ? `${t.name(page.region)} isn't yours any more.`
        : null;
  return (
    <Frame page={page} question={`Hire ${info.name}?`} help="Check it over, then hire.">
      <Review
        title={
          <>
            🦸 Hire {info.icon} <strong>{info.name}</strong> in <strong>{t.name(page.region)}</strong>
          </>
        }
        cost={cost}
        afford={afford(t.view, cost)}
        blocked={why}
        label={`${info.icon} Hire ${info.name}`}
        onGo={() => t.run({ type: "recruitHero", hero: page.hero, region: page.region }, { cost })}
      >
        <p className="review-effect">{info.power}</p>
      </Review>
    </Frame>
  );
}

export function HeroTo({ page }: { page: PageOf<"heroTo"> }) {
  const t = useTurn();
  const info = HEROES[page.hero];
  const hero = t.view.heroes[page.hero];
  const moves = heroMoves(t.view, page.hero);
  return (
    <Frame page={page} question={`Move ${info.name} to where?`} help="Heroes ride your gondola lines to your own regions, once a turn.">
      {hero.movedTurn === t.view.turn ? (
        <Stale why={`${info.name} has already moved this turn.`} />
      ) : !moves.length ? (
        <Empty>No line of yours joins {hero.region ? t.name(hero.region) : "his region"} to another of your regions.</Empty>
      ) : (
        <div className="choice-list">
          {moves.map((id) => (
            <Choice
              key={id}
              icon="🏠"
              title={t.name(id)}
              sub={<UnitsLine u={regionIn(t.view, id)?.units} none="no troops" />}
              onClick={() => {
                const next = pick(page, id, t.view);
                if (next) t.go(next);
              }}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

export function HeroReview({ page }: { page: PageOf<"heroReview"> }) {
  const t = useTurn();
  const info = HEROES[page.hero];
  const from = t.view.heroes[page.hero].region;
  const why = !heroMoves(t.view, page.hero).includes(page.to) ? `${info.name} can't ride to ${t.name(page.to)} now.` : null;
  return (
    <Frame page={page} question={`Move ${info.name}?`}>
      <Review
        title={
          <>
            {info.icon} Move <strong>{info.name}</strong> from {from ? t.name(from) : "?"} to <strong>{t.name(page.to)}</strong>
          </>
        }
        blocked={why}
        label={`${info.icon} Move him`}
        onGo={() => t.run({ type: "moveHero", hero: page.hero, to: page.to })}
      >
        <p className="small">Battles fought from or in {t.name(page.to)} get his +{info.combatBonus}. He can&rsquo;t move again this turn.</p>
      </Review>
    </Frame>
  );
}

// Thunder destroys the 3 strongest units there.
function struck(units: Units): Units {
  const u = { ...units };
  const out = emptyUnits();
  for (let i = 0; i < 3; i++) {
    const k = (["cam", "armedPanda", "nacam", "panda"] as UnitType[]).find((x) => u[x] > 0);
    if (!k) break;
    u[k] -= 1;
    out[k] += 1;
  }
  return out;
}

export function ThunderTarget({ page }: { page: PageOf<"thunderTarget"> }) {
  const t = useTurn();
  const targets = thunderTargets(t.view)
    .map((id) => regionIn(t.view, id)!)
    .sort((a, b) => Number(Boolean(b.owner)) - Number(Boolean(a.owner)) || unitTotal(unitsOf(b)) - unitTotal(unitsOf(a)));
  return (
    <Frame page={page} question="Where should Casey strike?" help="Any region you can see that isn't yours or a friend's. Thunder destroys its 3 strongest units.">
      <div className="choice-list">
        {targets.map((r) => (
          <Choice
            key={r.id}
            swatch={ownerColor(t, r)}
            icon="⚡"
            title={t.name(r.id)}
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
            {unitTotal(unitsOf(r)) > 0 && (
              <span className="choice-note">
                Would destroy <UnitsLine u={struck(unitsOf(r))} />
              </span>
            )}
          </Choice>
        ))}
      </div>
    </Frame>
  );
}

export function ThunderReview({ page }: { page: PageOf<"thunderReview"> }) {
  const t = useTurn();
  const r = regionIn(t.view, page.target);
  const me = meIn(t.view);
  const why =
    t.view.heroes.casey.owner !== t.view.me
      ? "Casey doesn't fight for you."
      : barred(t.view, "heroes")
        ? "🪧 Heroes on strike: Casey won't throw thunder for a war criminal."
        : (me.thunderReadyTurn ?? 0) > t.view.turn
        ? `Casey's thunder recharges until turn ${me.thunderReadyTurn}.`
        : !thunderTargets(t.view).includes(page.target)
          ? `Casey can't strike ${t.name(page.target)} now.`
          : null;
  return (
    <Frame page={page} question="Call down the thunder?">
      {!r ? (
        <Stale why="That region is gone." />
      ) : (
        <Review
          title={
            <>
              ⚡ Strike <strong>{t.name(page.target)}</strong> ({ownerLabel(t, r)})
            </>
          }
          danger
          blocked={why}
          label="⚡ Call down thunder"
          onGo={() => t.run({ type: "thunder", target: page.target })}
        >
          <p>
            Destroys <UnitsLine u={struck(unitsOf(r))} none="nothing but grass" />.
          </p>
          <p className="small">Then Casey recharges for {THUNDER_COOLDOWN} rounds.</p>
          <ThirstNote target={page.target} />
        </Review>
      )}
    </Frame>
  );
}

export function PickpocketWho({ page }: { page: PageOf<"pickpocketWho"> }) {
  const t = useTurn();
  return (
    <Frame page={page} question="Whose pocket?" help="The Josserkid steals 1 random resource from a Kird whose land you can see, once a turn.">
      <div className="choice-list">
        {pickpocketTargets(t.view).map((p) => {
          const player = t.view.players.find((x) => x.id === p.id)!;
          return (
            <Choice
              key={p.id}
              swatch={player.color}
              icon="🃏"
              title={player.name}
              sub={p.ok ? `${player.cards} resource card${player.cards === 1 ? "" : "s"} in their pockets` : p.why}
              disabled={!p.ok}
              badge={p.ok ? null : <Badge kind="off">can&rsquo;t</Badge>}
              onClick={() => t.go({ step: "pickpocketReview", target: p.id })}
            />
          );
        })}
      </div>
    </Frame>
  );
}

export function PickpocketReview({ page }: { page: PageOf<"pickpocketReview"> }) {
  const t = useTurn();
  const who = t.view.players.find((p) => p.id === page.target);
  const me = meIn(t.view);
  const target = pickpocketTargets(t.view).find((p) => p.id === page.target);
  const why = t.view.heroes.josserkid.owner !== t.view.me ? "The Josserkid doesn't work for you." : me.pickpocketTurn === t.view.turn ? "He already struck this turn." : !target?.ok ? target?.why ?? "Not possible." : null;
  return (
    <Frame page={page} question="Pick their pocket?">
      <Review
        title={
          <>
            🃏 Pickpocket <strong>{who?.name ?? "them"}</strong>
          </>
        }
        blocked={why}
        label="🃏 Pick their pocket"
        onGo={() => t.run({ type: "pickpocket", target: page.target })}
      >
        <p className="small">Steals 1 random resource. Only you and {who?.name ?? "they"} will know.</p>
      </Review>
    </Frame>
  );
}
