import { redirect } from "next/navigation";

/**
 * Root → demo. Until there's a marketing landing page, the root URL
 * lands straight on the creditor portfolio dashboard.
 */
export default function RootPage(): never {
  redirect("/demo");
}
