import type { Metadata } from "next";
import Flags from "@/components/admin/Flags";

export const metadata: Metadata = { title: "Feature flags — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Flags />;
}
