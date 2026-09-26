"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/server";
import { isAvatar } from "@/lib/avatars";
import { setAvatar } from "@/lib/game/profiles";

export async function chooseAvatar(form: FormData) {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in?redirectTo=/profile");
  const avatar = String(form.get("avatar") ?? "");
  if (!isAvatar(avatar)) return;
  await setAvatar(user.id, avatar);
  revalidatePath("/profile");
  const back = String(form.get("back") ?? "");
  if (back.startsWith("/game")) redirect(back);
}
