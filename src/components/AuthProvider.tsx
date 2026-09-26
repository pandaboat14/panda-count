"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { authClient } from "@/lib/auth/client";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      // Emailed links (password reset, verification) must point back at this site. Without an absolute
      // base URL the library sends a relative path, which Neon resolves against its own domain.
      baseURL={typeof window === "undefined" ? process.env.NEXT_PUBLIC_SITE_URL : window.location.origin}
      credentials={{ forgotPassword: true }}
      defaultTheme="light"
      redirectTo="/"
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
