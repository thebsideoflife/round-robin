/**
 * Compatibility shim.
 *
 * StatCard/SectionHeading were duplicated here and re-implemented inline in
 * several routes. The canonical versions now live in ./primitives so spacing,
 * truncation and tap targets stay consistent.
 */
import { Metric, type Tone } from "@/components/primitives";
import type { ReactNode } from "react";

export { SectionHeading } from "@/components/primitives";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return <Metric label={label} value={value} hint={hint} tone={tone} />;
}
