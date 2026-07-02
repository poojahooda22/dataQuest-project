import type { ReactNode } from "react";

// The dashboard frame (Lumina shell pattern). The root is locked to the viewport
// (`h-screen overflow-hidden`) so the page itself never scrolls. The sidebar is a
// self-contained <aside> that owns its own height + internal scroll; the header is
// fixed (`shrink-0`); and ONLY <main> scrolls. That containment is what stops the
// sidebar from riding up when you scroll the dashboard.
export function AppShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background pl-8 px-4">
          {header}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
