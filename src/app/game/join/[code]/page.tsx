import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { displayName } from "@/lib/game/names";
import { getUser } from "@/lib/auth/server";
import { gameIdForCode, joinGame } from "@/lib/game/store";

export default async function JoinPage({ params }: PageProps<"/game/join/[code]">) {
  await connection();
  const code = (await params).code.toUpperCase();
  const user = await getUser();
  if (!user) redirect(`/auth/sign-up?redirectTo=/game/join/${code}`);
  const id = await gameIdForCode(code);
  if (!id) notFound();
  await joinGame(id, { id: user.id, name: displayName(user) });
  redirect(`/game/${id}`);
}
