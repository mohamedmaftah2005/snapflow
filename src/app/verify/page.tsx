import type { Metadata } from "next";
import VerifyPage from "@/components/auth/VerifyPage";

export const metadata: Metadata = {
  title: "Verify email — SnapFlow",
  robots: { index: false },
};

export default async function VerifyRoute({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyPage token={token} />;
}
