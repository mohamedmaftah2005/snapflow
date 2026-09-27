import type { Metadata } from "next";
import System from "@/components/admin/System";

export const metadata: Metadata = { title: "System — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <System />;
}
