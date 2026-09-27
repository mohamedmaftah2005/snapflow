import type { Metadata } from "next";
import JobDetail from "@/components/admin/JobDetail";

export const metadata: Metadata = { title: "Job — Admin", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetail id={id} />;
}
