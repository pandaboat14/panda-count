"use client";

import { UserButton } from "@neondatabase/auth-ui";

export function UserMenu() {
  return (
    <UserButton
      size="icon"
      additionalLinks={[
        { href: "/profile", label: "🐼 Your avatar", signedIn: true },
        { href: "/game", label: "🎲 Your games", signedIn: true },
      ]}
    />
  );
}
