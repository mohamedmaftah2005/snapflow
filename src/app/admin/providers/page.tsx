import type { Metadata } from "next";
import Providers from "@/components/admin/Providers";

export const metadata: Metadata = { title: "Providers — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Providers />;
}
