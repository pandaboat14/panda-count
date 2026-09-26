"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameView } from "@/game/engine";
import type { ChatMessage } from "@/lib/game/chat";
import { Avatar } from "../Avatar";

export type Channel = "all" | string; // "all" or another player's id

export const inChannel = (m: ChatMessage, ch: Channel, me: string) =>
  ch === "all" ? m.to === null : (m.from === me && m.to === ch) || (m.from === ch && m.to === me);

export const channelOf = (m: ChatMessage, me: string): Channel => (m.to === null ? "all" : m.from === me ? m.to : m.from);

export function ChatPanel({
  view,
  messages,
  avatars,
  channel,
  setChannel,
  unread,
  send,
}: {
  view: GameView;
  messages: ChatMessage[];
  avatars: Record<string, string>;
  channel: Channel;
  setChannel: (c: Channel) => void;
  unread: Record<string, number>;
  send: (to: string | null, body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const list = useMemo(() => messages.filter((m) => inChannel(m, channel, view.me)), [messages, channel, view.me]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [list.length, channel]);
  const others = view.players.filter((p) => p.id !== view.me);
  const who = (id: string) => view.players.find((p) => p.id === id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    if (await send(channel === "all" ? null : channel, draft)) setDraft("");
    setSending(false);
  };

  return (
    <div className="panel-body chat">
      <div className="chat-channels" role="tablist" aria-label="Who to talk to">
        <button role="tab" aria-selected={channel === "all"} className={`chip${channel === "all" ? " on" : ""}`} onClick={() => setChannel("all")}>
          🌍 Everyone{unread.all ? <span className="dot-count inline">{unread.all}</span> : null}
        </button>
        {others.map((p) => (
          <button key={p.id} role="tab" aria-selected={channel === p.id} className={`chip${channel === p.id ? " on" : ""}`} onClick={() => setChannel(p.id)}>
            <Avatar value={avatars[p.id]} userId={p.id} size={18} /> {p.name}
            {unread[p.id] ? <span className="dot-count inline">{unread[p.id]}</span> : null}
          </button>
        ))}
      </div>
      <p className="muted small">
        {channel === "all" ? "Everyone in this world can read this." : `🔒 Private: only you and ${who(channel)?.name ?? "them"} can read this.`}
      </p>
      <ol className="chat-list">
        {list.length === 0 && <li className="muted small">No messages yet. Say hi, or start some diplomacy.</li>}
        {list.map((m) => {
          const p = who(m.from);
          const mine = m.from === view.me;
          return (
            <li key={m.id} className={mine ? "mine" : ""}>
              <Avatar value={avatars[m.from]} userId={m.from} size={28} />
              <div>
                <span className="chat-meta">
                  <strong style={{ color: p?.color }}>{mine ? "You" : p?.name ?? "A Kird who left"}</strong>{" "}
                  {new Date(m.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </span>
                <p>{m.body}</p>
              </div>
            </li>
          );
        })}
        <div ref={bottom} />
      </ol>
      {others.length === 0 && channel === "all" && <p className="muted small">You&rsquo;re alone in this world. Invite the Kirds to chat.</p>}
      <form className="chat-form" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          maxLength={600}
          rows={2}
          placeholder={channel === "all" ? "Message everyone…" : `Message ${who(channel)?.name ?? ""} privately…`}
          aria-label="Message"
        />
        <button className="btn small" disabled={sending || !draft.trim()}>Send</button>
      </form>
    </div>
  );
}
