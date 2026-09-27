import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Create account — SnapFlow",
  description: "Create a free SnapFlow account for usage tracking and history.",
  alternates: { canonical: "/register" },
  robots: { index: false },
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
