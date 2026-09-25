import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { WorldView } from "@/components/globe/WorldView";
import { getUser, hasAuth } from "@/lib/auth/server";
import { isEditor } from "@/lib/auth/editors";
import { getWorld } from "@/lib/world";

export const metadata = {
  title: "World · Panda Count",
  description: "Every giant panda on Earth on one globe: wild ranges in China, breeding centres, and zoos around the world.",
};

export default async function WorldPage() {
  await connection();
  const [world, user] = await Promise.all([getWorld(), getUser()]);
  return (
    <WorldView
      {...world}
      canEdit={Boolean(user && isEditor(user.email))}
      topBar={<TopBar signedIn={Boolean(user)} authEnabled={hasAuth()} tab="world" />}
    />
  );
}
