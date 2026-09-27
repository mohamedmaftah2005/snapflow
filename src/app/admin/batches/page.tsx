import type { Metadata } from "next";
import Batches from "@/components/admin/Batches";

export const metadata: Metadata = { title: "Batches — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Batches />;
}
