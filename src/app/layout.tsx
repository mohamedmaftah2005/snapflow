import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ThemeScript from "@/components/layout/ThemeScript";
import Attribution from "@/components/growth/Attribution";
import { ConsentBanner, PageViewTracker } from "@/components/analytics/Consent";
import { siteConfig } from "@/lib/config/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://snapflow.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${siteConfig.name} — Download public TikTok videos simply`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} — Download public TikTok videos simply`,
    description: siteConfig.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — Download public TikTok videos simply`,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-(--color-paper) text-(--color-ink-900)">
        <ThemeScript />
        <a href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-(--color-ink-950) focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-(--color-paper)">
          Skip to content
        </a>
        <Header />
        <div id="main-content" className="flex flex-1 flex-col">{children}</div>
        <Footer />
        <Suspense>
          <Attribution />
        </Suspense>
        <PageViewTracker />
        <ConsentBanner />
      </body>
    </html>
  );
}
