import type { Metadata } from "next";
import UserDetail from "@/components/admin/UserDetail";

export const metadata: Metadata = { title: "User — Admin", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetail id={id} />;
}
