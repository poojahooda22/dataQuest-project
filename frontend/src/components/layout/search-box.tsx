import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// The global indicator search — lives in the top bar (header), drives the dashboard filter.
// Debounced ~250ms so typing stays smooth and the SGRID filters after a pause (R-SCALE §B7).
export function SearchBox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [input, setInput] = useState(value);
  useEffect(() => setInput(value), [value]); // external resets flow back in
  useEffect(() => {
    const id = setTimeout(() => onChange(input), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is a stable setter; debounce on input only
  }, [input]);

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search indicators..."
        aria-label="Search indicators"
        className="pl-8"
      />
    </div>
  );
}
