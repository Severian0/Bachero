"use client";

// Three boards, one strip. A tab is the console's filter chip with a destination
// instead of a filter: same pill, same tint, same 120ms.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/backlog", label: "Backlog" },
  { href: "/history", label: "History" },
] as const;

export function TabStrip() {
  const pathname = usePathname();
  return (
    <nav className="tabstrip" aria-label="Sections">
      {TABS.map((tab) => {
        const current = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tab"
            aria-current={current ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
