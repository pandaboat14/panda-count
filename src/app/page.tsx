import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { PandaWorld } from "@/components/world/PandaWorld";
import { hasAuth, getUser } from "@/lib/auth/server";
import { isEditor } from "@/lib/auth/editors";
import { getRoster } from "@/lib/roster";

export default async function Home() {
  await connection();
  const [{ pandas, lastUpdated }, user] = await Promise.all([getRoster(), getUser()]);

  return (
    <PandaWorld
      pandas={pandas}
      lastUpdated={lastUpdated}
      canEdit={Boolean(user && isEditor(user.email))}
      topBar={<TopBar signedIn={Boolean(user)} authEnabled={hasAuth()} tab="usa" />}
    />
  );
}
