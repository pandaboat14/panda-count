import { notFound } from "next/navigation";
import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";
import { TopBar } from "@/components/TopBar";
import { hasAuth } from "@/lib/auth/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({ params }: PageProps<"/auth/[path]">) {
  if (!hasAuth()) notFound();
  const { path } = await params;
  return (
    <>
      <TopBar signedIn={false} authEnabled={false} />
      <main className="auth-wrap">
        <AuthView path={path} />
      </main>
    </>
  );
}
