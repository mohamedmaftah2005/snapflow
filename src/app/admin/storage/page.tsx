import type { Metadata } from "next";
import Storage from "@/components/admin/Storage";

export const metadata: Metadata = { title: "Storage — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Storage />;
}
