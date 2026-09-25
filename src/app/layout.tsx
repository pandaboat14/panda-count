import type { Metadata } from "next";
import { Bricolage_Grotesque, Fraunces, Karla } from "next/font/google";
import "@neondatabase/auth-ui/css";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { hasAuth } from "@/lib/auth/server";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--font-fraunces" });
const karla = Karla({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-karla" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: "800", variable: "--font-bricolage" });

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
