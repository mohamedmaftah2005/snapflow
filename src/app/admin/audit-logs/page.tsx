import type { Metadata } from "next";
import AuditLogs from "@/components/admin/AuditLogs";

export const metadata: Metadata = { title: "Audit logs — Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <AuditLogs />;
}
