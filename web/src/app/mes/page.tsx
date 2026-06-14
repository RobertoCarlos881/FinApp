import { getPeriods, getBudgetMonth, getIncomeMonth } from "@/lib/queries";
import { monthLabel, money, currentPeriod } from "@/lib/format";
import { saveBudgets, saveIncomes } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import MonthNav from "@/components/MonthNav";

export const dynamic = "force-dynamic";

const isPeriod = (s?: string) => !!s && /^\d{4}-\d{2}-01$/.test(s);
const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
const btnCls =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700";

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const periods = await getPeriods();
  const period = isPeriod(mes) ? mes! : (periods[periods.length - 1] ?? currentPeriod());

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <NavBar active="mes" mes={period} user={user} />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Presupuesto e ingresos</h1>
          <p className="text-sm text-zinc-500">{monthLabel(period)}</p>
        </div>
        <MonthNav basePath="/mes" selected={period} existing={periods} />
      </header>

      <Presupuestos period={period} />
      <Ingresos period={period} />
    </main>
  );
}

async function Presupuestos({ period }: { period: string }) {
  const rows = await getBudgetMonth(period);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <section className="mb-8 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Presupuesto por categoría
      </h2>
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">
          Crea categorías en{" "}
          <a href="/config" className="font-medium text-blue-600 hover:text-blue-700">Configuración</a>{" "}
          para asignarles presupuesto.
        </p>
      )}
      <form action={saveBudgets}>
        <input type="hidden" name="period" value={period} />
        <div className="grid grid-cols-1 gap-2">
          {rows.map((r) => (
            <label key={r.categoryId} className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{r.category}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name={`cat_${r.categoryId}`}
                defaultValue={r.amount}
                className={`${inputCls} max-w-40`}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500">
            Total presupuestado: <b className="text-zinc-700 dark:text-zinc-300">{money(total)}</b>
          </span>
          <button type="submit" className={btnCls}>
            Guardar presupuestos
          </button>
        </div>
      </form>
    </section>
  );
}

async function Ingresos({ period }: { period: string }) {
  const rows = await getIncomeMonth(period);
  const total = rows.reduce((s, r) => s + r.slots.reduce((a, sl) => a + sl.amount, 0), 0);
  return (
    <section className="mb-8 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Ingresos del mes
      </h2>
      <p className="mb-4 text-xs text-zinc-400">
        Cada trabajo muestra sus pagos del mes según su frecuencia (semanal, quincenal o mensual).
      </p>
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">
          Agrega tus trabajos en{" "}
          <a href="/config" className="font-medium text-blue-600 hover:text-blue-700">Configuración</a>.
        </p>
      )}
      <form action={saveIncomes}>
        <input type="hidden" name="period" value={period} />
        <div className="grid grid-cols-1 gap-4">
          {rows.map((r) => {
            const subtotal = r.slots.reduce((a, sl) => a + sl.amount, 0);
            return (
              <div key={r.sourceId} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium">
                    {r.source} <span className="text-xs text-zinc-400">· {r.person}</span>
                  </span>
                  <span className="text-xs tabular-nums text-zinc-500">{money(subtotal)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {r.slots.map((sl) => (
                    <label key={sl.slot} className="block">
                      <span className="mb-1 block text-xs text-zinc-400">{sl.label}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name={`src_${r.sourceId}_s${sl.slot}`}
                        defaultValue={sl.amount}
                        aria-label={`${r.source} ${sl.label}`}
                        className={inputCls}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500">
            Total ingresos: <b className="text-zinc-700 dark:text-zinc-300">{money(total)}</b>
          </span>
          <button type="submit" className={btnCls}>
            Guardar ingresos
          </button>
        </div>
      </form>
    </section>
  );
}
