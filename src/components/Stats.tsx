"use client";

/** Blocos visuais do painel: indicador (número em destaque) e lista de barras horizontais. */

export function StatTile({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="card relative overflow-hidden p-4 sm:p-5">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-indigo-200">{icon}</span>
      </div>
      <div
        className={`mt-2 break-words font-display font-semibold tabular-nums tracking-tight ${
          value.length > 9 ? "text-xl sm:text-2xl xl:text-3xl" : "text-3xl"
        }`}
        data-stat-value
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function BarList({
  title,
  rows,
  onPick,
  emptyText,
}: {
  title: string;
  rows: { key: string; label: string; value: number }[];
  onPick: (key: string) => void;
  emptyText: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <section className="card p-4 sm:p-5" aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold text-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const pct = total ? Math.round((row.value / total) * 100) : 0;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => onPick(row.key)}
                  className="group grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-brand-3"
                  title={`${row.label}: ${row.value} lead${row.value === 1 ? "" : "s"} (${pct}%) — clique para filtrar`}
                >
                  <span className="truncate text-sm text-ink">{row.label}</span>
                  <span className="h-2 rounded-full bg-white/5">
                    <span
                      className="block h-2 rounded-full bg-brand-gradient transition-[width] duration-500"
                      style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-8 text-right text-sm tabular-nums text-muted">{row.value}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
