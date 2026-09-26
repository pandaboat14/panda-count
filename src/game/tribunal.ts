// The Tribunal as one player sees it: who is on trial, which votes are still yours to cast, what binds a war
// criminal, and what an attack would do to your Bloodthirst. Worked out from the player's own view, so nothing
// hidden leaks (Bloodthirst and sentences are public; ballots are secret).
import { judgeAttack, type GameView, type Judgement } from "./engine";
import { SANCTION_INFO, TRIAL_AT, TRIAL_MIN_KIRDS, type Sanction } from "./rules";

// A trial needs a jury, so worlds with fewer Kirds have no Tribunal at all.
export const tribunalSits = (view: GameView) => view.players.length >= TRIAL_MIN_KIRDS;
export const onTrial = (view: GameView, pid: string | null | undefined) => view.trials.some((t) => t.accused === pid);
export const sanctionedIn = (view: GameView, pid: string | null | undefined, k: Sanction) =>
  Boolean(view.players.find((p) => p.id === pid)?.sentence?.sanctions.includes(k));
// Trials you can still vote in.
export const ballotsDue = (view: GameView) => view.trials.filter((t) => t.accused !== view.me && !t.myVote);

export const sanctionIcons = (ks: Sanction[]) => ks.map((k) => SANCTION_INFO[k].icon).join("");
export const sanctionLabels = (ks: Sanction[]) => ks.map((k) => `${SANCTION_INFO[k].icon} ${SANCTION_INFO[k].label}`).join(", ");

export const EXCUSE_TEXT: Record<NonNullable<Judgement["excuse"]>, string> = {
  defence: "they attacked you first, and an eye for an eye is no crime",
  threat: "stopping the Kird about to win is no crime",
  criminal: "bringing a war criminal to justice is no crime",
};

export type AttackCost = Judgement & { before: number; after: number; trial: boolean; charged: boolean };

// What attacking `owner`'s land would do to your Bloodthirst: null for natives, empty land or your own.
export function attackCost(view: GameView, owner: string | null | undefined): AttackCost | null {
  const me = view.players.find((p) => p.id === view.me);
  const victim = view.players.find((p) => p.id === owner);
  if (!me || !victim || victim.id === me.id) return null;
  const judged = judgeAttack(
    { regions: me.regions, grudges: me.grudges },
    { id: victim.id, regions: victim.regions, threat: view.threat === victim.id, criminal: Boolean(victim.sentence) },
    view.round,
  );
  const charged = onTrial(view, me.id);
  const after = me.bloodthirst + judged.points;
  return { ...judged, before: me.bloodthirst, after, charged, trial: judged.points > 0 && !charged && tribunalSits(view) && after >= TRIAL_AT };
}

// One line on what an attack means for your conscience, for the attack preview and Casey's thunder.
export function attackCostText(cost: AttackCost) {
  if (!cost.points) return `No Bloodthirst: ${EXCUSE_TEXT[cost.excuse!]}.`;
  const double = cost.points === 2 ? " (double: they hold less than half your regions)" : "";
  if (cost.charged) return `🩸 +${cost.points}${double}. You're already on trial, so it's added to the charges.`;
  if (cost.trial) return `🩸 +${cost.points}${double}, taking you to ${cost.after}/${TRIAL_AT}: this attack puts you on trial for war crimes.`;
  return `🩸 +${cost.points} Bloodthirst${double}, taking you to ${cost.after}/${TRIAL_AT}.`;
}
