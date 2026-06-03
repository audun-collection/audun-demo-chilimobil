import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { Header } from "../components/header";
import { Footer } from "../components/footer";

// getaudun.com type system: EB Garamond display/serif, Inter sans,
// JetBrains Mono for eyebrows/labels. Exposed as CSS variables and
// wired into Tailwind's fontFamily (see tailwind.config.ts).
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-eb-garamond",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Audun — Inkasso for moderne selskaper",
  description:
    "Audun er AI-drevet inkasso. Skyldnerne dine får automatiske, høflige påminnelser; du ser hvert steg og bestemmer når vi går videre til rettslig.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html
      lang="nb"
      className={`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-10 pt-28">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
