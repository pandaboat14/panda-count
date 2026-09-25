import { createNeonAuth } from "@neondatabase/auth/next/server";

let instance: ReturnType<typeof createNeonAuth> | undefined;

export const hasAuth = () =>
  Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);

// Created on first use so builds and previews without Neon Auth env vars don't crash.
export function auth() {
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  return instance;
}

export async function getUser() {
  if (!hasAuth()) return null;
  try {
    const { data } = await auth().getSession();
    return data?.user ?? null;
  } catch (err) {
    // An auth outage shouldn't take the count down with it; everyone just looks signed out.
    console.error("Neon Auth getSession failed", err);
    return null;
  }
}
