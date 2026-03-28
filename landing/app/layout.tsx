import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LensAI — See the Web. Understand Everything.",
  description:
    "LensAI is the AI layer for your eyes. Select any region on screen and get instant expert analysis — code review, translation, diagram analysis, and more. Powered by NVIDIA NIM.",
  keywords: [
    "AI browser extension",
    "visual AI",
    "screen analysis",
    "code review extension",
    "AI translation",
    "Chrome extension",
    "NVIDIA NIM",
    "knowledge graph",
    "developer tools",
    "screenshot analysis",
  ],
  authors: [{ name: "LensAI" }],
  creator: "LensAI",
  publisher: "LensAI",
  metadataBase: new URL("https://lensai.dev"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://lensai.dev",
    title: "LensAI — See the Web. Understand Everything.",
    description:
      "The AI layer for your eyes. Select anything on screen, get instant expert explanation, code review, translation, or diagram analysis.",
    siteName: "LensAI",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LensAI — AI-powered visual understanding for the web",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LensAI — See the Web. Understand Everything.",
    description:
      "The AI layer for your eyes. Select anything on screen, get instant expert explanation.",
    creator: "@lensai_dev",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${syne.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
