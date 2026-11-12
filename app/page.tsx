import Dashboard from "@/components/dashboard";
import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // Keep already-created PayPal checkout return links working.
  if (query.checkout === "return" || query.checkout === "cancel") return <Dashboard />;
  redirect("/cabinet");
}
