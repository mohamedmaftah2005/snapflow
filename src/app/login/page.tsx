import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign in — SnapFlow",
  description: "Sign in to your SnapFlow account.",
  alternates: { canonical: "/login" },
  robots: { index: false },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { expired?: string };
}) {
  const notice =
    searchParams?.expired === "1"
      ? "Your session expired. Please sign in again."
      : undefined;
  return <AuthForm mode="login" notice={notice} />;
}
