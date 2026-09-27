import type { Metadata } from "next";
import Jobs from "@/components/admin/Jobs";

export const metadata: Metadata = { title: "Jobs — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Jobs />;
}
