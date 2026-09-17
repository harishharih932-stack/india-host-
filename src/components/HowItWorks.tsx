const PHASES = [
  {
    tag: "A",
    title: "Strip",
    body: "Removes comments and pointless whitespace. Off by default so your files stay byte-exact.",
  },
  {
    tag: "B",
    title: "Dictionary",
    body: "Common code words (function, return, className…) are swapped for one short symbol each.",
  },
  {
    tag: "C",
    title: "Bit-pack",
    body: "Counts how many different characters the file uses and stores each one in the fewest bits possible.",
  },
  {
    tag: "D",
    title: "Window pack",
    body: "Finds repeated chunks of text and stores them once, then writes the result as printable base91 text.",
  },
];

export function HowItWorks() {
  return (
    <section className="gh-card p-4">
      <h2 className="text-sm font-semibold text-foreground">How the compression works</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Every phase runs, is measured in real bytes, and is only kept if it actually made the file
        smaller. Nothing here is estimated.
      </p>
      <ul className="mt-3 space-y-2">
        {PHASES.map((phase) => (
          <li key={phase.tag} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-canvas-subtle num text-xs font-semibold">
              {phase.tag}
            </span>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{phase.title} — </span>
              {phase.body}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Phases B, C and D are fully reversible, so opening a file always gives you back the exact
        original code.
      </p>
    </section>
  );
}
