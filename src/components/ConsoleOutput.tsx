/** Black terminal panel that shows the live compression log. */
export function ConsoleOutput({ lines, title = "compression log" }: { lines: string[]; title?: string }) {
  if (lines.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-canvas-subtle px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <pre className="max-h-64 overflow-auto bg-console px-3 py-2 num text-xs leading-relaxed text-console-foreground">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line.startsWith(">") ? line : `> ${line}`}</div>
        ))}
      </pre>
    </div>
  );
}
