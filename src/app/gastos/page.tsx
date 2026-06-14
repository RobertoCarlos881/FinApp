import Link from "next/link";
import {
  getPeriods,
  getCategoryOptions,
  getAccountOptions,
  getPersonOptions,
  getExpenses,
  getHousehold,
  getRecurringForMonth,
} from "@/lib/queries";
import { money, monthLabel, currentPeriod } from "@/lib/format";
import { addExpense, deleteExpense, setFixedExpenseMonth } from "@/app/actions";
import ExpenseForm from "./ExpenseForm";
import NavBar from "@/components/NavBar";
import MonthNav from "@/components/MonthNav";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const isPeriod = (s?: string) => !!s && /^\d{4}-\d{2}-01$/.test(s);

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const periods = await getPeriods();
  const viewAll = mes === "todos";
  const period = isPeriod(mes) ? mes! : (periods[periods.length - 1] ?? currentPeriod());

  const [categories, accounts, people, expenses, household, recurring] = await Promise.all([
    getCategoryOptions(),
    getAccountOptions(),
    getPersonOptions(),
    getExpenses(viewAll ? "all" : period),
    getHousehold(),
    viewAll ? Promise.resolve([]) : getRecurringForMonth(period),
  ]);

  const defaultDate = `${period.slice(0, 7)}-15`;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <NavBar active="gastos" mes={period} user={user} />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <p className="text-sm text-zinc-500">{viewAll ? "Todos los meses" : monthLabel(period)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MonthNav basePath="/gastos" selected={period} existing={periods} />
          <Link
            href="/gastos?mes=todos"
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              viewAll
                ? "bg-blue-600 text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            Ver todos los meses
          </Link>
        </div>
      </header>

      {/* Formulario para agregar */}
      <section className="mb-8 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Agregar gasto
        </h2>
        {categories.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Primero crea categorías en{" "}
            <a href="/config" className="font-medium text-blue-600 hover:text-blue-700">
              Configuración
            </a>{" "}
            para poder registrar gastos.
          </p>
        ) : (
          <ExpenseForm
            categories={categories}
            accounts={accounts}
            people={people}
            splitMode={household.splitMode}
            defaultSplit={household.defaultSplit}
            action={addExpense}
            defaultDate={defaultDate}
            submitLabel="Agregar gasto"
            resetOnSubmit
          />
        )}
      </section>

      {/* Recurrentes y MSI del mes (automáticos) */}
      {!viewAll && recurring.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Automáticos de {monthLabel(period)} (recurrentes y meses sin intereses)
          </h2>
          <section className="mb-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recurring.map((it) => (
                  <tr key={`${it.kind}-${it.id}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{it.name}</span>
                      <span className="text-xs text-zinc-400">
                        {" "}· {it.category}
                        {it.kind === "msi" ? " · MSI" : ""}
                        {it.ownerId == null ? " · dividido" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(it.amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {it.kind === "fixed" ? (
                        <form action={setFixedExpenseMonth} className="inline-flex items-center gap-1">
                          <input type="hidden" name="fixedId" value={it.id} />
                          <input type="hidden" name="period" value={period} />
                          <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={it.amount}
                            className="w-24 rounded border border-zinc-200 px-1.5 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                          />
                          <button className="text-xs font-medium text-blue-600 hover:text-blue-700">Ajustar mes</button>
                        </form>
                      ) : (
                        <span className="text-xs text-zinc-400">fijo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* Lista de gastos */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {viewAll ? "Todos los movimientos" : `Movimientos de ${monthLabel(period)}`} ({expenses.length})
      </h2>
      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {expenses.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Aún no hay gastos. Agrega el primero arriba.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                {viewAll && <th className="px-4 py-2.5 font-medium">Mes</th>}
                <th className="px-4 py-2.5 font-medium">Categoría</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="px-4 py-2.5 font-medium">Dueño</th>
                <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-500">
                    {e.date.slice(8)}/{e.date.slice(5, 7)}
                  </td>
                  {viewAll && (
                    <td className="px-4 py-2.5 text-zinc-500">{monthLabel(e.period).split(" ")[0]}</td>
                  )}
                  <td className="px-4 py-2.5 font-medium">{e.category}</td>
                  <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
                    {e.description ?? "—"}
                    {e.account ? <span className="text-zinc-400"> · {e.account}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{e.owners}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(e.amount)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Link
                      href={`/gastos/${e.id}/editar`}
                      className="text-xs text-blue-600 transition hover:text-blue-700"
                    >
                      Editar
                    </Link>
                    <form action={deleteExpense} className="ml-3 inline">
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="text-xs text-zinc-400 transition hover:text-rose-600"
                        title="Borrar"
                      >
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
