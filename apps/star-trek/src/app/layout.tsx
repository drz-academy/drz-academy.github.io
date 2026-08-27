import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const siteUrl = "https://seap-udea.github.io/apps/star-trek";
const shareImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Nave Daedalus con el logo de Dr. Z Academy en un tanque de combustible",
};
const description =
  "Diseña un plan de vuelo interestelar con aceleración propia constante y observa la cinemática relativista desde el puente de mando.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Star trek",
  description,
  openGraph: {
    title: "Star trek",
    description,
    type: "website",
    locale: "es_ES",
    url: "./",
    siteName: "Star trek",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Star trek",
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
        className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
