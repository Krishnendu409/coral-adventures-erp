import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { getConfig } from "@/server/domain/settings/configRepository";

export async function generateMetadata(): Promise<Metadata> {
  const name = getConfig("business_name") ?? "Coral Adventures";
  return {
    title: `${name} — Operations & Business Intelligence`,
    description: `The offline-first operations, analytics, and decision-support platform for ${name} catamaran cruises.`,
    icons: { icon: "/brand/logo-256.png" },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
