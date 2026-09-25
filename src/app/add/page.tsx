import { PandaForm } from "@/components/PandaForm";
import { TopBar } from "@/components/TopBar";
import { editorGate } from "@/components/EditorGate";
import { hasAuth } from "@/lib/auth/server";
import { getZoos } from "@/lib/roster";

export const metadata = { title: "Add a panda · Panda Count" };

export default async function AddPage() {
  const blocked = await editorGate();
  return (
    <>
      <TopBar signedIn={!blocked} authEnabled={hasAuth()} showAdd={false} />
      <main className="page">
        <h1>Add a panda</h1>
        <p className="lede">New arrival, or one that&rsquo;s been announced? Pandas marked &ldquo;here now&rdquo; go straight into the count.</p>
        {blocked ?? <PandaForm zoos={await getZoos()} />}
      </main>
    </>
  );
}
