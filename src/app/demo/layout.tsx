/**
 * /demo layout. No-op wrapper — navigation lives in the global
 * Header pill (see `components/header.tsx`) and the demo route is
 * open to anyone with the URL.
 */

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Audun — Demo",
  description:
    "Audun creditor portal demo — portfolio, claims, debtors, and per-claim conversation timeline.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function DemoLayout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}
