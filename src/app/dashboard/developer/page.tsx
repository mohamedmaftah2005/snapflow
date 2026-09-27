import type { Metadata } from "next";
import Developer from "@/components/developer/Developer";

export const metadata: Metadata = {
  title: "Developer — SnapFlow",
  robots: { index: false },
};

export default function Page() {
  return <Developer />;
}
