import Link from "next/link";

const MESES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function period(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

/**
 * Navegación por año (‹ 2026 ›) y mes (Ene–Dic). Los meses con datos se ven
 * destacados; los vacíos siguen siendo clicables para poder crearlos.
 */
export default function MonthNav({
  basePath,
  selected,
  existing,
}: {
  basePath: string; // "/", "/gastos", "/mes"
  selected: string; // 'YYYY-MM-01'
  existing: string[]; // períodos con datos
}) {
  const year = Number(selected.slice(0, 4));
  const has = new Set(existing);
  const link = (p: string) => `${basePath}?mes=${p}`;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={link(period(year - 1, Number(selected.slice(5, 7)) - 1))}
          className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Año anterior"
        >
          ‹
        </Link>
        <span className="min-w-12 text-center font-semibold tabular-nums">{year}</span>
        <Link
          href={link(period(year + 1, Number(selected.slice(5, 7)) - 1))}
          className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Año siguiente"
        >
          ›
        </Link>
      </div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
        {MESES_CORTO.map((m, i) => {
          const p = period(year, i);
          const isSel = p === selected;
          const exists = has.has(p);
          return (
            <Link
              key={m}
              href={link(p)}
              className={`rounded-md px-2 py-1 text-center text-xs font-medium transition ${
                isSel
                  ? "bg-blue-600 text-white"
                  : exists
                    ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
                    : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {m}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
