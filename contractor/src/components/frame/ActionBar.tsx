// The footer bar: a statement of what is selected or outstanding on the left,
// and the one solid steel action on the right. Sticky, because on a phone the
// stop list runs past the bottom of the screen and the action must not go with it.

import type { ReactNode } from "react";

export function ActionBar({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="action-bar">
      <div className="min-w-0 text-[12px] leading-[1.4] text-ink-58 tabular">
        <div className="truncate text-[13px] font-semibold text-text">{title}</div>
        {detail !== undefined && <div className="truncate">{detail}</div>}
      </div>
      {children !== undefined && (
        <div className="flex flex-none items-center gap-2">{children}</div>
      )}
    </div>
  );
}
