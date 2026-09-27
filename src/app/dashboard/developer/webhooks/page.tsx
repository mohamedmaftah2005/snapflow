import type { Metadata } from "next";
import Webhooks from "@/components/developer/Webhooks";

export const metadata: Metadata = {
  title: "Webhooks — SnapFlow",
  robots: { index: false },
};

export default function Page() {
  return <Webhooks />;
}
