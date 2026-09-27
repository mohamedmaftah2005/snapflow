import type { Metadata } from "next";
import Settings from "@/components/dashboard/Settings";

export const metadata: Metadata = {
  title: "Settings — SnapFlow",
  robots: { index: false },
};

export default function SettingsPage() {
  return <Settings />;
}
