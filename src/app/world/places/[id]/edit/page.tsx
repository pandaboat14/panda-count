import { notFound } from "next/navigation";
import { deletePlace } from "@/app/world/actions";
import { TopBar } from "@/components/TopBar";
import { editorGate } from "@/components/EditorGate";
import { PlaceForm } from "@/components/globe/PlaceForm";
import { hasAuth } from "@/lib/auth/server";
import { getPlace } from "@/lib/world";

export default async function EditPlacePage({ params }: PageProps<"/world/places/[id]/edit">) {
  const blocked = await editorGate();
  const place = await getPlace(Number((await params).id));
  if (!place) notFound();

  return (
    <>
      <TopBar signedIn={!blocked} authEnabled={hasAuth()} showAdd={false} />
      <main className="page">
        <h1>Update {place.name}</h1>
        <p className="lede">Births, deaths, arrivals and returns to China: change the count, then update “as of” and the source.</p>
        {blocked ?? (
          <>
            <PlaceForm place={place} />
            <details style={{ marginTop: 32 }}>
              <summary>Remove {place.name} from the map</summary>
              <form action={deletePlace} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={place.id} />
                <button className="btn danger" type="submit">Yes, remove it</button>
              </form>
            </details>
          </>
        )}
      </main>
    </>
  );
}
