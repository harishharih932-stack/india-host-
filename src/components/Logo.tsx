import { Box } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Box className={compact ? "h-5 w-5 text-foreground" : "h-6 w-6 text-foreground"} />
      <span className="text-base font-semibold tracking-tight">indihost</span>
    </span>
  );
}
