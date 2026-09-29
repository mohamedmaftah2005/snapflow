import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SnapFlow",
  robots: { index: false },
};

/** Public registration is closed — SnapFlow needs no account. */
export default function RegisterPage() {
  redirect("/");
}
