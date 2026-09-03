// The board screens' frame: header, tab strip, then panels separated by
// hairlines. The route and stop screens use `AppHeader` directly — a crew
// halfway through a job does not need three other boards one tap away.

import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { TabStrip } from "./TabStrip";

export function AppFrame({
  subtitle,
  children,
}: {
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader subtitle={subtitle} />
      <TabStrip />
      <main className="measure flex-1">{children}</main>
    </>
  );
}
