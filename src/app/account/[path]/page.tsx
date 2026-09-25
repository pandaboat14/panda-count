import { notFound } from "next/navigation";
import { AccountView } from "@neondatabase/auth-ui";
import { accountViewPaths } from "@neondatabase/auth-ui/server";
import { TopBar } from "@/components/TopBar";
import { hasAuth } from "@/lib/auth/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(accountViewPaths).map((path) => ({ path }));
}

export default async function AccountPage({ params }: PageProps<"/account/[path]">) {
  if (!hasAuth()) notFound();
  const { path } = await params;
  return (
    <>
      <TopBar signedIn authEnabled />
      <main className="page">
        <AccountView path={path} />
      </main>
    </>
  );
}
