import "server-only";

// Sends through Resend (https://resend.com). Without RESEND_API_KEY this quietly does nothing.
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }) {
  if (!emailEnabled()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Panda Diplomacy <turns@pandacount.net>",
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) console.error("Resend failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
