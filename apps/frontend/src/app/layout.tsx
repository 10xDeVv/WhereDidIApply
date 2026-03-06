import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WhereDidIApply",
  description: "Scan your Gmail to track job applications automatically",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-[#09090b]">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#09090b]`}
      >
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <Providers>{children}</Providers>
      </body>
    </html>
  );
}
