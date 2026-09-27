import type { Metadata } from "next";
import Users from "@/components/admin/Users";

export const metadata: Metadata = { title: "Users — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <Users />;
}
