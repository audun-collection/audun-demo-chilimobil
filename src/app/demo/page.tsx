import { redirect } from "next/navigation";

/** /demo → Besparelse (eneste gjenværende fane). */
export default function DemoIndexPage(): never {
  redirect("/demo/besparelse");
}
