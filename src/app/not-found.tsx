import Link from "next/link";
import { PublicPage } from "@/components/PublicPage";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <PublicPage
      eyebrow="404"
      title="Nothing here."
      intro={<p>That page doesn&apos;t exist, or it moved. Try one of these instead.</p>}
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.12em]">
        <Link href="/" className="text-accent hover:underline">Home →</Link>
        <Link href="/about" className="text-accent hover:underline">About →</Link>
        <Link href="/invest" className="text-accent hover:underline">Invest →</Link>
        <Link href="/dashboard" className="text-accent hover:underline">Members →</Link>
      </div>
    </PublicPage>
  );
}
