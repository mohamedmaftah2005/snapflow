import type { Metadata } from "next";
import Abuse from "@/components/admin/Abuse";

export const metadata: Metadata = { title: "Abuse — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Abuse />;
}
