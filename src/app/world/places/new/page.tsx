import { TopBar } from "@/components/TopBar";
import { editorGate } from "@/components/EditorGate";
import { PlaceForm } from "@/components/globe/PlaceForm";
import { hasAuth } from "@/lib/auth/server";

export const metadata = { title: "Add a place · Panda Count" };

export default async function NewPlacePage() {
  const blocked = await editorGate();
  return (
    <>
      <TopBar signedIn={!blocked} authEnabled={hasAuth()} showAdd={false} />
      <main className="page">
        <h1>Add a place</h1>
        <p className="lede">A zoo or breeding centre outside the US that has (or is getting) giant pandas. US zoos come from the USA tab.</p>
        {blocked ?? <PlaceForm />}
      </main>
    </>
  );
}
