import type { Metadata } from "next";
import Queues from "@/components/admin/Queues";

export const metadata: Metadata = { title: "Queues — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Queues />;
}
