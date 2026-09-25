import type { Metadata } from "next";
import localFont from "next/font/local";
import "@neondatabase/auth-ui/css";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { hasAuth } from "@/lib/auth/server";

// Bundled (latin subset, from Fontsource) so builds don't depend on reaching Google Fonts.
const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-400.woff2", weight: "400" },
    { path: "./fonts/fraunces-600.woff2", weight: "600" },
    { path: "./fonts/fraunces-800.woff2", weight: "800" },
  ],
  variable: "--font-fraunces",
});
const karla = localFont({
  src: [
    { path: "./fonts/karla-400.woff2", weight: "400" },
    { path: "./fonts/karla-600.woff2", weight: "600" },
    { path: "./fonts/karla-700.woff2", weight: "700" },
  ],
  variable: "--font-karla",
});
const bricolage = localFont({ src: "./fonts/bricolage-800.woff2", weight: "800", variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: "Panda Count",
  description: "A running count of every giant panda living in the United States, with a trading card for each one.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${karla.variable} ${bricolage.variable}`}>
      <body>{hasAuth() ? <AuthProvider>{children}</AuthProvider> : children}</body>
    </html>
  );
}
