import type { Metadata } from "next";
import ApiAccess from "@/components/admin/ApiAccess";

export const metadata: Metadata = { title: "API access — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <ApiAccess />;
}
