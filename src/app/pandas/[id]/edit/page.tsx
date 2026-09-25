import { notFound } from "next/navigation";
import { deletePanda } from "@/app/actions";
import { PandaForm } from "@/components/PandaForm";
import { TopBar } from "@/components/TopBar";
import { editorGate } from "@/components/EditorGate";
import { hasAuth } from "@/lib/auth/server";
import { getPanda, getZoos } from "@/lib/roster";

export default async function EditPage({ params }: PageProps<"/pandas/[id]/edit">) {
  const blocked = await editorGate();
  const panda = await getPanda(Number((await params).id));
  if (!panda) notFound();

  return (
    <>
      <TopBar signedIn={!blocked} authEnabled={hasAuth()} showAdd={false} />
      <main className="page">
        <h1>Edit {panda.name}</h1>
        <p className="lede">
          Switch the status to &ldquo;here now&rdquo; when a panda arrives, and they&rsquo;ll join the count.
          {panda.updatedByName && <> Last updated by {panda.updatedByName}.</>}
        </p>
        {blocked ?? (
          <>
            <PandaForm panda={panda} zoos={await getZoos()} />
            <details style={{ marginTop: 32 }}>
              <summary>Remove {panda.name} from the site</summary>
              <form action={deletePanda} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={panda.id} />
                <button className="btn danger" type="submit">Yes, remove {panda.name}</button>
              </form>
            </details>
          </>
        )}
      </main>
    </>
  );
}
