import type { ReactNode } from "react";

// The sidebar shell is rendered once by app/(app)/layout.tsx, so pages under
// app/(app)/ render only their own content.

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-blue">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
