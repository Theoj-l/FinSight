import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ChatWidget } from "@/app/components/chat/chat-widget";
import { TourProvider } from "@/app/components/tour/tour-context";
import { CurrencyProvider } from "@/lib/currency-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinSight — Financial insight for TSH Group",
  description:
    "FinSight turns TSH Group's financial and operational data into clear, forward-looking insight.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // globals.css sets scroll-behavior: smooth for in-page links. This tells
      // Next 16 to jump (not glide) to the top when changing pages.
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TourProvider>
          <CurrencyProvider>{children}</CurrencyProvider>
          <ChatWidget />
        </TourProvider>
      </body>
    </html>
  );
}
