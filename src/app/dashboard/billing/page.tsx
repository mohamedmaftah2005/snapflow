import type { Metadata } from "next";
import { Suspense } from "react";
import Billing from "@/components/dashboard/Billing";

export const metadata: Metadata = {
  title: "Billing — SnapFlow",
  robots: { index: false },
};

export default function BillingPage() {
  return (
    <Suspense>
      <Billing />
    </Suspense>
  );
}
