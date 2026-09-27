import type { Metadata } from "next";
import DownloadDetail from "@/components/dashboard/DownloadDetail";

export const metadata: Metadata = {
  title: "Download details — SnapFlow",
  robots: { index: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DownloadDetail id={id} />;
}
