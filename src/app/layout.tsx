import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { Header } from "../components/header";
import { Footer } from "../components/footer";

export const metadata: Metadata = {
  title: "Solvva — Inkasso for moderne selskaper",
  description:
    "Solvva er AI-drevet inkasso. Skyldnerne dine får automatiske, høflige påminnelser; du ser hvert steg og bestemmer når vi går videre til rettslig.",
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
    <html lang="nb">
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
