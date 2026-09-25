import { notFound } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { editorGate } from "@/components/EditorGate";
import { WildForm } from "@/components/globe/WildForm";
import { hasAuth } from "@/lib/auth/server";
import { getWildRange } from "@/lib/world";

export default async function EditWildPage({ params }: PageProps<"/world/wild/[id]/edit">) {
  const blocked = await editorGate();
  const range = await getWildRange(Number((await params).id));
  if (!range) notFound();

  return (
    <>
      <TopBar signedIn={!blocked} authEnabled={hasAuth()} showAdd={false} />
      <main className="page">
        <h1>Update the {range.name} estimate</h1>
        <p className="lede">When China publishes its next national survey, update each range here.</p>
        {blocked ?? <WildForm range={range} />}
      </main>
    </>
  );
}
