import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";
import StatusBar from "@/components/StatusBar";
import OfflineBanner from "@/components/OfflineBanner";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
export const metadata: Metadata = {
  title: "Logos Explorer",
  description: "Blockchain explorer and node monitor for the Logos network",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className="min-h-screen antialiased flex flex-col">
        <KeyboardShortcuts />
        <TopNav />
        <OfflineBanner />
        <main className="flex-1 pt-14">{children}</main>
        <StatusBar />
      </body>
    </html>
  );
}
