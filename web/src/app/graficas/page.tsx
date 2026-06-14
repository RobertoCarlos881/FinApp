import { requireUser } from "@/lib/auth";
import { getPeriods, getMonthlyTrend, getCategoryBreakdown } from "@/lib/queries";
import { money, monthLabel, currentPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import MonthNav from "@/components/MonthNav";

export const dynamic = "force-dynamic";

const isPeriod = (s?: string) => !!s && /^\d{4}-\d{2}-01$/.test(s);

const PALETTE = [
  "#2563EB", "#DB2777", "#059669", "#D97706", "#7C3AED",
  "#0891B2", "#DC2626", "#65A30D", "#C026D3", "#475569",
];

export default async function GraficasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const periods = await getPeriods();
  const period = isPeriod(mes) ? mes! : (periods[periods.length - 1] ?? currentPeriod());

  const [trend, breakdown] = await Promise.all([
    getMonthlyTrend(),
    getCategoryBreakdown(period),
  ]);

  const trendMax = Math.max(1, ...trend.map((t) => Math.max(t.income, t.gastos)));
  const last = trend.slice(-12);
  const totalSpent = breakdown.reduce((s, b) => s + b.spent, 0);
  const maxSlice = Math.max(1, ...breakdown.map((b) => b.spent));

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8">
      <NavBar active="graficas" mes={period} user={user} />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gráficas</h1>
          <p className="text-sm text-zinc-500">{monthLabel(period)}</p>
        </div>
        <MonthNav basePath="/graficas" selected={period} existing={periods} />
      </header>

      {/* Tendencia ingresos vs gastos */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Ingresos vs Gastos por mes
      </h2>
      <section className="mb-8 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        {last.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Aún no hay datos para graficar.</p>
        ) : (
          <>
            <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ height: 200 }}>
              {last.map((t) => (
                <div key={t.period} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      className="w-3.5 rounded-t bg-emerald-500"
                      style={{ height: `${(t.income / trendMax) * 100}%` }}
                      title={`Ingresos ${money(t.income)}`}
                    />
                    <div
                      className="w-3.5 rounded-t bg-rose-500"
                      style={{ height: `${(t.gastos / trendMax) * 100}%` }}
                      title={`Gastos ${money(t.gastos)}`}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400">{monthLabel(t.period).split(" ")[0].slice(0, 3)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-emerald-500" /> Ingresos</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-rose-500" /> Gastos</span>
            </div>
          </>
        )}
      </section>

      {/* Sobrante por mes */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Sobrante por mes
      </h2>
      <section className="mb-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {last.map((t) => (
              <tr key={t.period}>
                <td className="px-4 py-2 text-zinc-500">{monthLabel(t.period)}</td>
                <td className={`px-4 py-2 text-right font-medium tabular-nums ${t.sobrante < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {money(t.sobrante)}
                </td>
              </tr>
            ))}
            {last.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-zinc-500">Sin datos</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Desglose por categoría */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Gastos por categoría · {monthLabel(period)}
      </h2>
      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        {breakdown.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No hay gastos en este mes.</p>
        ) : (
          <div className="space-y-3">
            {breakdown.map((b, i) => (
              <div key={b.category}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{b.category}</span>
                  <span className="tabular-nums text-zinc-500">
                    {money(b.spent)} · {Math.round((b.spent / totalSpent) * 100)}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(b.spent / maxSlice) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-100 pt-3 text-sm font-medium dark:border-zinc-800">
              <span>Total</span>
              <span className="tabular-nums">{money(totalSpent)}</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
