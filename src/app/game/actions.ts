"use server";

import { redirect } from "next/navigation";
import { hasDatabase } from "@/db";
import { BOT_LEVELS, type BotLevel } from "@/game/engine";
import { GOAL_CHOICES } from "@/game/rules";
import { getUser } from "@/lib/auth/server";
import { displayName } from "@/lib/game/names";
import { revalidatePath } from "next/cache";
import { createNewGame, deleteGame, endGame, gameIdForCode, leaveGame } from "@/lib/game/store";

export type LobbyState = { error?: string };

export async function createGameAction(_prev: LobbyState, form: FormData): Promise<LobbyState> {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in?redirectTo=/game");
  if (!hasDatabase()) return { error: "The game needs the database set up." };
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "The Kirds' World";
  // Each extra seat is "human" (invite someone later) or a computer difficulty.
  const seats = form.getAll("seat").map(String).slice(0, 7);
  const bots = seats.filter((v): v is BotLevel => (BOT_LEVELS as string[]).includes(v));
  // "endless" or one of the region goals; anything else falls back to endless.
  const goalRaw = Number(form.get("goal"));
  const goal = (GOAL_CHOICES as readonly number[]).includes(goalRaw) ? goalRaw : null;
  const id = await createNewGame(name, { id: user.id, name: displayName(user), email: user.email }, bots, goal);
  redirect(`/game/${id}`);
}

export async function joinByCodeAction(_prev: LobbyState, form: FormData): Promise<LobbyState> {
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Invite codes are 6 letters and numbers." };
  if (!(await gameIdForCode(code))) return { error: "No game with that code." };
  redirect(`/game/join/${code}`);
}

async function lobbyStep(form: FormData, step: (id: number, userId: string) => Promise<void>) {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in?redirectTo=/game");
  await step(Number(form.get("id")), user.id);
  revalidatePath("/game");
  redirect("/game");
}

export async function leaveGameAction(form: FormData) {
  await lobbyStep(form, leaveGame);
}

export async function endGameAction(form: FormData) {
  await lobbyStep(form, endGame);
}

export async function deleteGameAction(form: FormData) {
  await lobbyStep(form, deleteGame);
}
