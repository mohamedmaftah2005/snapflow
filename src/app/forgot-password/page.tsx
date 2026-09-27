import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Forgot password — SnapFlow",
  robots: { index: false },
};

export default function ForgotPage() {
  return <AuthForm mode="forgot" />;
}
