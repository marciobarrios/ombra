"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import type { NavGroup } from "../../lib/navigation";

const focusRing =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

function NavLinks({
  groups,
  current,
  idPrefix,
}: {
  groups: readonly NavGroup[];
  current: string;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((group) => {
        const labelId = `${idPrefix}-${group.id}`;

        return (
          <div key={group.id}>
            <p
              id={labelId}
              className="px-3 font-display text-xs tracking-[0.18em] text-foreground/70 uppercase"
            >
              {group.title}
            </p>
            <ul aria-labelledby={labelId} className="mt-2 flex flex-col">
              {group.entries.map((entry) => {
                const active = entry.path === current;

                return (
                  <li key={entry.path}>
                    <Link
                      href={entry.path}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-md px-3 py-2.5 text-sm leading-5 transition-colors lg:py-1.5 ${focusRing} ${
                        active
                          ? "bg-foreground/[0.06] font-medium text-foreground"
                          : "text-foreground/70 hover:text-foreground"
                      }`}
                    >
                      {entry.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The docs pages, grouped. A sticky column on wide screens; on narrow ones a disclosure
 * above the page that shows where you are and closes once you pick a page.
 */
export function DocsSidebar({ groups }: { groups: readonly NavGroup[] }) {
  const current = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);

  const here = groups
    .flatMap((group) => group.entries)
    .find((entry) => entry.path === current)?.title;

  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [current]);

  return (
    <>
      <details
        ref={menu}
        className="group mb-10 rounded-xl border border-foreground/10 bg-card lg:hidden"
      >
        <summary
          className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 text-sm [&::-webkit-details-marker]:hidden ${focusRing}`}
        >
          <span>
            <span className="text-foreground/70">Docs</span>
            {here ? <span className="ml-2 font-medium">{here}</span> : null}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-foreground/70 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <nav aria-label="Docs" className="border-t border-foreground/10 px-1 py-4">
          <NavLinks groups={groups} current={current} idPrefix="docs-menu" />
        </nav>
      </details>
      <nav
        aria-label="Docs"
        className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] self-start overflow-y-auto pb-8 lg:block"
      >
        <NavLinks groups={groups} current={current} idPrefix="docs-sidebar" />
      </nav>
    </>
  );
}
