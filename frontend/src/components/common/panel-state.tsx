import type { ReactNode } from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";

import { cn } from "@/lib/utils";

function PanelMessage({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children ? <p className="max-w-sm text-xs text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export function PanelLoading({ label = "Loading...", className }: { label?: string; className?: string }) {
  return (
    <PanelMessage
      className={className}
      icon={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
      title={label}
    />
  );
}

export function PanelError({ message, className }: { message?: string; className?: string }) {
  return (
    <PanelMessage className={className} icon={<AlertCircle className="size-5 text-destructive" />} title="Couldn't load">
      {message ?? "The data is unavailable right now. Check the API connection and try again."}
    </PanelMessage>
  );
}

export function PanelEmpty({
  title = "Nothing here yet",
  message,
  className,
}: {
  title?: string;
  message?: string;
  className?: string;
}) {
  return (
    <PanelMessage className={className} icon={<Search className="size-5 text-muted-foreground" />} title={title}>
      {message}
    </PanelMessage>
  );
}