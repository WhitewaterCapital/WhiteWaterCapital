import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

// Frame for simple public pages (About, Contact, Privacy, Terms, 404).
export function PublicPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <p className="font-mono text-sm text-accent">{`// ${eyebrow}`}</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">{title}</h1>
        {intro ? <div className="mt-4 max-w-xl text-muted">{intro}</div> : null}
        {children ? <div className="mt-10">{children}</div> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

// Long-form prose (legal pages).
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground/85 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_a]:text-accent [&_a]:underline">
      {children}
    </div>
  );
}
