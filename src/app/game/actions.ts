"use server";

import { redirect } from "next/navigation";
import { hasDatabase } from "@/db";
import { getUser } from "@/lib/auth/server";
import { displayName } from "@/lib/game/names";
import { createNewGame, gameIdForCode } from "@/lib/game/store";

export type LobbyState = { error?: string };

export async function createGameAction(_prev: LobbyState, form: FormData): Promise<LobbyState> {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in?redirectTo=/game");
  if (!hasDatabase()) return { error: "The game needs the database set up." };
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "The Kirds' World";
  const id = await createNewGame(name, { id: user.id, name: displayName(user), email: user.email });
  redirect(`/game/${id}`);
}

export async function joinByCodeAction(_prev: LobbyState, form: FormData): Promise<LobbyState> {
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Invite codes are 6 letters and numbers." };
  if (!(await gameIdForCode(code))) return { error: "No game with that code." };
  redirect(`/game/join/${code}`);
}
