import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://seap-udea.github.io/apps/lighting-black-holes";
const description =
  "Simula cómo se curva la luz alrededor de un agujero negro: coloca láseres y observa el lente gravitacional.";
const shareImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Diagrama de rayos de luz curvados por un agujero negro",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Óptica de agujeros negros",
  description,
  icons: {
    icon: `${siteUrl}/icon.png`,
    apple: `${siteUrl}/apple-icon.png`,
  },
  openGraph: {
    title: "Óptica de agujeros negros",
    description,
    type: "website",
    locale: "es_ES",
    url: "./",
    siteName: "Óptica de agujeros negros",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Óptica de agujeros negros",
    description,
    images: [shareImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
