"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { savePanda, type FormState } from "@/app/actions";
import type { Panda } from "@/lib/types";

type Zoo = { name: string; location: string; url: string | null };

export function PandaForm({ panda, zoos }: { panda?: Panda; zoos: Zoo[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePanda, {});
  const [status, setStatus] = useState(panda?.status ?? "resident");
  const [zoo, setZoo] = useState({ name: panda?.zoo ?? "", location: panda?.location ?? "", url: panda?.zooUrl ?? "" });

  const pickZoo = (name: string) => {
    const known = zoos.find((z) => z.name === name);
    setZoo(known ? { name, location: known.location, url: known.url ?? "" } : { ...zoo, name });
  };

  return (
    <form action={action} className="panda-form">
      {panda && <input type="hidden" name="id" value={panda.id} />}
      {state.error && <p className="notice error" role="alert">{state.error}</p>}

      <fieldset>
        <legend>The panda</legend>
        <label>Name<input name="name" required maxLength={60} defaultValue={panda?.name} /></label>
        <label>Chinese name <span className="hint">optional</span><input name="chinese" maxLength={20} defaultValue={panda?.chinese} /></label>
        <label>
          Sex
          <select name="sex" defaultValue={panda?.sex ?? "Female"}>
            <option>Female</option>
            <option>Male</option>
          </select>
        </label>
        <label>
          Born <span className="hint">2021-08-04, or just 2021</span>
          <input name="born" required pattern="\d{4}(-\d{2}-\d{2})?" defaultValue={panda?.born} />
        </label>
        <label>Origin<input name="origin" defaultValue={panda?.origin ?? "Sichuan Province"} /></label>
        <label>Birthplace<input name="birthplace" defaultValue={panda?.birthplace} /></label>
        <label className="wide">
          Fun fact <span className="hint">shown on the trading card</span>
          <textarea name="fact" rows={3} maxLength={400} defaultValue={panda?.fact} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Where they live</legend>
        <label>
          Zoo
          <input name="zoo" required list="zoo-names" value={zoo.name} onChange={(e) => pickZoo(e.target.value)} />
          <datalist id="zoo-names">{zoos.map((z) => <option key={z.name} value={z.name} />)}</datalist>
        </label>
        <label>City<input name="location" required value={zoo.location} onChange={(e) => setZoo({ ...zoo, location: e.target.value })} /></label>
        <label className="wide">
          Zoo&rsquo;s panda page <span className="hint">optional link</span>
          <input name="zooUrl" type="url" value={zoo.url} onChange={(e) => setZoo({ ...zoo, url: e.target.value })} />
        </label>
        <label>
          Status
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value as Panda["status"])}>
            <option value="resident">Here now (counts)</option>
            <option value="incoming">On the way</option>
          </select>
        </label>
        {status === "resident" && (
          <label>Arrived<input name="arrived" type="date" required defaultValue={panda?.arrived ?? ""} /></label>
        )}
      </fieldset>

      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : panda ? "Save changes" : "Add panda"}</button>
        <Link className="btn ghost" href="/">Cancel</Link>
      </div>
    </form>
  );
}
