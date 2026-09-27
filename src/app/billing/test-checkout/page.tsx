import { notFound } from "next/navigation";
import { env } from "@/lib/config/env";
import TestCheckoutClient from "./client";

export const metadata = { title: "Test checkout — SnapFlow", robots: { index: false } };

/** Dev-only hosted-checkout stand-in. Never exists in production. */
export default async function TestCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  if (env.billingProvider !== "test" || process.env.NODE_ENV === "production") notFound();
  const { session } = await searchParams;
  if (!session) notFound();
  return <TestCheckoutClient session={session} />;
}
