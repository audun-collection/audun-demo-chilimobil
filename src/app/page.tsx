import { redirect } from "next/navigation";

/**
 * Root → Besparelse. The demo only serves the Svea-vs-Audun savings
 * comparison; all other tabs have been removed.
 */
export default function RootPage(): never {
  redirect("/demo/besparelse");
}
