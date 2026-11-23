import Link from "next/link";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <nav className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link
          href="/"
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Ombra
        </Link>
        <Link
          href="/docs"
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Docs
        </Link>
        <Link
          href="/spike"
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Spike
        </Link>
      </nav>
      {children}
    </div>
  );
}
