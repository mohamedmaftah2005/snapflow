import type { Metadata } from "next";
import BillingOps from "@/components/admin/BillingOps";

export const metadata: Metadata = { title: "Billing — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <BillingOps />;
}
