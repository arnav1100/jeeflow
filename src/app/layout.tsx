import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "JEEFlow — Plan Smart. Study Consistently.",
  description:
    "A personalized, adaptive JEE Main study planner for Physics, Chemistry and Mathematics.",
  manifest: "/manifest.webmanifest",
  applicationName: "JEEFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JEEFlow",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#38BDF8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#F7FBFF] font-sans text-[#0F172A] antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
