import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Create account — SnapFlow",
  description: "Create a free SnapFlow account. No card required.",
  alternates: { canonical: "/register" },
  robots: { index: false },
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
