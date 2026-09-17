import type { ActivityDay } from "@/lib/data";

function level(count: number) {
  if (count === 0) return "bg-grid-0";
  if (count === 1) return "bg-grid-1";
  if (count <= 3) return "bg-grid-2";
  if (count <= 6) return "bg-grid-3";
  return "bg-grid-4";
}

export function ContributionGrid({ days }: { days: ActivityDay[] }) {
  const weeks: ActivityDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-1">
            {week.map((day) => (
              <span
                key={day.day}
                title={`${day.day} · ${day.count} event(s)`}
                className={`h-3 w-3 rounded-sm ${level(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
