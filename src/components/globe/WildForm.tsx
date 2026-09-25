"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveWildRange, type FormState } from "@/app/world/actions";
import type { WildRange } from "@/lib/types";

export function WildForm({ range }: { range: WildRange }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWildRange, {});
  return (
    <form action={action} className="panda-form">
      <input type="hidden" name="id" value={range.id} />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      <fieldset>
        <legend>{range.name} Mountains</legend>
        <label>Wild pandas (estimate)<input name="estimate" required inputMode="numeric" defaultValue={range.estimate} /></label>
        <label>Survey<input name="survey" required maxLength={120} defaultValue={range.survey} /></label>
        <label className="wide">Source link<input name="sourceUrl" type="url" defaultValue={range.sourceUrl ?? ""} /></label>
      </fieldset>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save estimate"}</button>
        <Link className="btn ghost" href="/world">Cancel</Link>
      </div>
    </form>
  );
}
