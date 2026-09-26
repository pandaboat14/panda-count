import { defaultAvatar, isAvatar, type AvatarKind } from "@/lib/avatars";

const INK = "#1c1b17";
const FACE = "#fdf8ef";

function Face({ kind }: { kind: AvatarKind }) {
  switch (kind) {
    case "panda":
      return (
        <>
          <circle cx="22" cy="22" r="11" fill={INK} />
          <circle cx="78" cy="22" r="11" fill={INK} />
          <ellipse cx="50" cy="54" rx="36" ry="32" fill={FACE} />
          <ellipse cx="36" cy="50" rx="9" ry="12" fill={INK} transform="rotate(20 36 50)" />
          <ellipse cx="64" cy="50" rx="9" ry="12" fill={INK} transform="rotate(-20 64 50)" />
          <circle cx="37" cy="49" r="3" fill={FACE} />
          <circle cx="63" cy="49" r="3" fill={FACE} />
          <ellipse cx="50" cy="66" rx="5" ry="3.5" fill={INK} />
          <path d="M50 69 v3 M50 72 q-5 3 -9 0 M50 72 q5 3 9 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      );
    case "redpanda":
      return (
        <>
          <path d="M14 18 L30 30 L20 40 Z M86 18 L70 30 L80 40 Z" fill="#b8431f" />
          <ellipse cx="50" cy="55" rx="36" ry="30" fill="#d9632b" />
          <ellipse cx="34" cy="60" rx="12" ry="10" fill={FACE} />
          <ellipse cx="66" cy="60" rx="12" ry="10" fill={FACE} />
          <path d="M40 36 q10 -8 20 0" stroke={FACE} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="38" cy="50" r="4" fill={INK} />
          <circle cx="62" cy="50" r="4" fill={INK} />
          <ellipse cx="50" cy="64" rx="5" ry="3.5" fill={INK} />
        </>
      );
    case "ogre":
      return (
        <>
          <ellipse cx="16" cy="48" rx="8" ry="12" fill="#6f8a3a" />
          <ellipse cx="84" cy="48" rx="8" ry="12" fill="#6f8a3a" />
          <rect x="18" y="20" width="64" height="66" rx="26" fill="#7f9a46" />
          <path d="M30 40 L46 44 M70 40 L54 44" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="38" cy="50" r="4" fill={INK} />
          <circle cx="62" cy="52" r="3" fill={INK} />
          <ellipse cx="50" cy="60" rx="8" ry="6" fill="#5d7430" />
          <path d="M34 72 q16 8 32 0" stroke={INK} strokeWidth="3" fill="none" />
          <path d="M38 72 l3 -9 l3 9 M58 72 l3 -9 l3 9" fill={FACE} />
          <circle cx="68" cy="34" r="3" fill="#5d7430" />
        </>
      );
    case "cam":
      return (
        <>
          <path d="M20 40 q30 -32 60 0 q-6 -14 -30 -16 q-24 2 -30 16 Z" fill="#e8b64a" />
          <path d="M22 42 q0 34 28 44 q28 -10 28 -44 Z" fill="#e9b893" />
          <rect x="26" y="44" width="20" height="10" rx="4" fill={INK} />
          <rect x="54" y="44" width="20" height="10" rx="4" fill={INK} />
          <path d="M46 48 h8" stroke={INK} strokeWidth="3" />
          <path d="M40 70 q10 6 20 0" stroke="#8a4a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M28 76 q22 16 44 0" stroke="#c98f6a" strokeWidth="3" fill="none" />
          <path d="M74 30 l4 -6 l2 8 Z" fill="#fffaf3" />
        </>
      );
    case "viking":
      return (
        <>
          <path d="M20 36 q-12 -20 -4 -30 q4 16 16 22 Z M80 36 q12 -20 4 -30 q-4 16 -16 22 Z" fill="#f2ead7" />
          <path d="M22 44 q28 -30 56 0 Z" fill="#8a8f98" />
          <rect x="47" y="20" width="6" height="24" fill="#6f747d" />
          <ellipse cx="50" cy="56" rx="26" ry="22" fill="#e9b893" />
          <circle cx="41" cy="54" r="3.5" fill="#2b6fd6" />
          <circle cx="59" cy="54" r="3.5" fill="#2b6fd6" />
          <path d="M26 62 q24 40 48 0 q-8 8 -24 8 q-16 0 -24 -8 Z" fill="#d9a441" />
          <path d="M44 66 q6 4 12 0" stroke="#8a4a2a" strokeWidth="2.5" fill="none" />
          <path d="M70 22 l-8 14 h8 l-10 16" stroke="#ffd43b" strokeWidth="3" fill="none" strokeLinejoin="round" />
        </>
      );
    case "gondola":
      return (
        <>
          <path d="M6 22 L94 34" stroke={INK} strokeWidth="3" />
          <path d="M50 28 v14" stroke={INK} strokeWidth="3" />
          <rect x="24" y="42" width="52" height="40" rx="10" fill="#d64a2b" />
          <rect x="30" y="50" width="16" height="14" rx="3" fill="#cfe7f5" />
          <rect x="54" y="50" width="16" height="14" rx="3" fill="#cfe7f5" />
          <circle cx="38" cy="58" r="4" fill={FACE} />
          <circle cx="36" cy="55" r="2" fill={INK} />
          <circle cx="40" cy="55" r="2" fill={INK} />
          <rect x="24" y="70" width="52" height="4" fill="#a8391f" />
        </>
      );
    case "robot":
      return (
        <>
          <path d="M50 10 v12" stroke={INK} strokeWidth="3" />
          <circle cx="50" cy="9" r="5" fill="#d64a2b" />
          <rect x="12" y="44" width="8" height="18" rx="3" fill="#8a8f98" />
          <rect x="80" y="44" width="8" height="18" rx="3" fill="#8a8f98" />
          <rect x="20" y="22" width="60" height="62" rx="14" fill="#b9c2cc" />
          <rect x="28" y="36" width="44" height="22" rx="8" fill={INK} />
          <circle cx="40" cy="47" r="5" fill="#7ee0c3" />
          <circle cx="60" cy="47" r="5" fill="#7ee0c3" />
          <rect x="34" y="66" width="32" height="8" rx="3" fill="#8a8f98" />
          <path d="M42 66 v8 M50 66 v8 M58 66 v8" stroke="#b9c2cc" strokeWidth="2" />
        </>
      );
  }
}

export function Avatar({ value, userId, size = 32, title }: { value?: string | null; userId?: string; size?: number; title?: string }) {
  const v = isAvatar(value) ? value : defaultAvatar(userId ?? "kird");
  const [kind, color] = v.split(":") as [AvatarKind, string];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="avatar" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx="50" cy="50" r="50" fill={color} />
      <g transform="translate(6 6) scale(.88)">
        <Face kind={kind} />
      </g>
    </svg>
  );
}
