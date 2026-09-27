import type { Metadata } from "next";
import AdminDashboard from "@/components/admin/Dashboard";

export const metadata: Metadata = { title: "Admin Dashboard", robots: { index: false, follow: false } };

export default function Page() {
  return <AdminDashboard />;
}
