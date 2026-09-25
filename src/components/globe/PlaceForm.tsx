"use client";

import Link from "next/link";
import { useActionState } from "react";
import { savePlace, type FormState } from "@/app/world/actions";
import type { WorldPlace } from "@/lib/types";

export function PlaceForm({ place }: { place?: WorldPlace }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePlace, {});
  return (
    <form action={action} className="panda-form">
      {place && <input type="hidden" name="id" value={place.id} />}
      {state.error && <p className="notice error" role="alert">{state.error}</p>}

      <fieldset>
        <legend>The place</legend>
        <label className="wide">Name<input name="name" required maxLength={100} defaultValue={place?.name} placeholder="Zoo Berlin" /></label>
        <label>City<input name="city" required maxLength={100} defaultValue={place?.city} /></label>
        <label>Country or region<input name="country" required maxLength={60} defaultValue={place?.country} /></label>
        <label>
          Kind
          <select name="kind" defaultValue={place?.kind ?? "zoo"}>
            <option value="zoo">Zoo</option>
            <option value="breeding_center">Breeding centre</option>
          </select>
        </label>
        <span />
        <label>
          Latitude <span className="hint">e.g. 52.5079</span>
          <input name="lat" required inputMode="decimal" defaultValue={place?.lat} />
        </label>
        <label>
          Longitude <span className="hint">e.g. 13.3377</span>
          <input name="lng" required inputMode="decimal" defaultValue={place?.lng} />
        </label>
        <p className="hint wide">
          Tip: in Google Maps, right-click the zoo and click the numbers at the top of the menu to copy them.
        </p>
      </fieldset>

      <fieldset>
        <legend>The pandas</legend>
        <label>How many are there now<input name="count" required inputMode="numeric" defaultValue={place?.count ?? ""} /></label>
        <label>On the way <span className="hint">announced, not arrived</span><input name="incoming" inputMode="numeric" defaultValue={place?.incoming ?? 0} /></label>
        <label className="wide">Names <span className="hint">optional, comma-separated</span><input name="names" maxLength={400} defaultValue={place?.names} /></label>
        <label className="wide">
          Note <span className="hint">optional, shown on the card</span>
          <textarea name="note" rows={2} maxLength={400} defaultValue={place?.note} />
        </label>
        <label>
          As of <span className="hint">2026-08 or 2026-08-15</span>
          <input name="asOf" required defaultValue={place?.asOf ?? new Date().toISOString().slice(0, 7)} />
        </label>
        <label>Source link<input name="sourceUrl" type="url" defaultValue={place?.sourceUrl ?? ""} placeholder="https://" /></label>
      </fieldset>

      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : place ? "Save changes" : "Add place"}</button>
        <Link className="btn ghost" href="/world">Cancel</Link>
      </div>
    </form>
  );
}
