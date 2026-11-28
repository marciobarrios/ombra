import Link from "next/link";

import { docsNavigation } from "../../lib/navigation";
import { ThemeControl } from "../theme-control";
import { DocsSidebar } from "./docs-sidebar";

const topLinkClassName =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 pt-12 pb-16">
      <header className="mb-10 flex items-center justify-between gap-5">
        <nav aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/" className={topLinkClassName}>
            Ombra
          </Link>
          <Link href="/docs" className={topLinkClassName}>
            Docs
          </Link>
          <Link href="/spike" className={topLinkClassName}>
            Spike
          </Link>
        </nav>
        <ThemeControl />
      </header>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
        <DocsSidebar groups={docsNavigation()} />
        <div className="max-w-3xl min-w-0">{children}</div>
      </div>
    </div>
  );
}
