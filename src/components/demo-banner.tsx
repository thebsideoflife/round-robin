import { useEffect, useState } from "react";
import { Info } from "lucide-react";

/**
 * Shown for the whole session after someone enters via /demo, so a viewer is
 * never confused about whether they are looking at real data.
 */
export function DemoBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(sessionStorage.getItem("rr.demo") === "1");
  }, []);
  if (!on) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 border-b border-signal/30 bg-signal-soft px-4 py-2 text-[0.8125rem] text-signal-deep lg:px-6"
    >
      <Info className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Demo workspace — sample data. Anything you change here is not real.
      </span>
    </div>
  );
}
