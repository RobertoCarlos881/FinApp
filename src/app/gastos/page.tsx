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
import { addExpense, deleteExpense, setFixedExpenseMonth, makeRecurring } from "@/app/actions";
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
  const personName = (id: number | null) =>
    id == null ? "dividido" : people.find((pp) => pp.id === id)?.name ?? "";

  // Agrupar por categoría (vista del mes): recurrentes + movimientos juntos.
  type Group = { category: string; total: number; recs: typeof recurring; txs: typeof expenses };
  const groups: Group[] = [];
  if (!viewAll) {
    const map = new Map<string, Group>();
    const getG = (cat: string) => {
      let g = map.get(cat);
      if (!g) {
        g = { category: cat, total: 0, recs: [], txs: [] };
        map.set(cat, g);
        groups.push(g);
      }
      return g;
    };
    for (const it of recurring) {
      const g = getG(it.category);
      g.recs.push(it);
      g.total += it.amount;
    }
    for (const e of expenses) {
      const g = getG(e.category);
      g.txs.push(e);
      g.total += e.amount;
    }
    groups.sort((a, b) => b.total - a.total);
  }

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

      {/* ---------- Vista del mes: una tabla por categoría ---------- */}
      {!viewAll &&
        (groups.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
            Aún no hay gastos en {monthLabel(period)}. Agrega el primero arriba.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.category} className="mb-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-baseline justify-between bg-zinc-50 px-4 py-2.5 dark:bg-zinc-900">
                <span className="text-sm font-semibold">{g.category}</span>
                <span className="text-sm font-medium tabular-nums text-zinc-500">{money(g.total)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {g.recs.map((it) => (
                    <tr key={`r-${it.kind}-${it.id}`} className="bg-blue-50/40 dark:bg-blue-950/20">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-xs text-blue-500">
                          {" "}· {it.kind === "msi" ? "meses sin intereses" : "recurrente"} · {personName(it.ownerId)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(it.amount)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {it.kind === "fixed" ? (
                          <form action={setFixedExpenseMonth} className="inline-flex items-center gap-1">
                            <input type="hidden" name="fixedId" value={it.id} />
                            <input type="hidden" name="period" value={period} />
                            <input name="amount" type="number" step="0.01" min="0" defaultValue={it.amount}
                              className="w-20 rounded border border-zinc-200 px-1.5 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
                            <button className="text-xs font-medium text-blue-600 hover:text-blue-700">Ajustar</button>
                          </form>
                        ) : (
                          <span className="text-xs text-zinc-400">fijo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {g.txs.map((e) => (
                    <tr key={`t-${e.id}`}>
                      <td className="px-4 py-2.5">
                        <span className="tabular-nums text-zinc-500">{e.date.slice(8)}/{e.date.slice(5, 7)}</span>{" "}
                        <span className="text-zinc-700 dark:text-zinc-200">{e.description ?? "—"}</span>
                        <span className="text-xs text-zinc-400">
                          {e.account ? ` · ${e.account}` : ""} · {e.owners}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(e.amount)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <form action={makeRecurring} className="inline">
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="text-xs text-emerald-600 transition hover:text-emerald-700" title="Convertir en gasto recurrente cada mes">↻ Recurrente</button>
                        </form>
                        <Link href={`/gastos/${e.id}/editar`} className="ml-3 text-xs text-blue-600 transition hover:text-blue-700">Editar</Link>
                        <form action={deleteExpense} className="ml-3 inline">
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="text-xs text-zinc-400 transition hover:text-rose-600" title="Borrar">Borrar</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        ))}

      {/* ---------- Vista "Todos los meses": lista plana ---------- */}
      {viewAll && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Todos los movimientos ({expenses.length})
          </h2>
          <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {expenses.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Aún no hay gastos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">Mes</th>
                    <th className="px-4 py-2.5 font-medium">Categoría</th>
                    <th className="px-4 py-2.5 font-medium">Descripción</th>
                    <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 tabular-nums text-zinc-500">{e.date.slice(8)}/{e.date.slice(5, 7)}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{monthLabel(e.period).split(" ")[0]}</td>
                      <td className="px-4 py-2.5 font-medium">{e.category}</td>
                      <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
                        {e.description ?? "—"}{e.account ? <span className="text-zinc-400"> · {e.account}</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(e.amount)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Link href={`/gastos/${e.id}/editar`} className="text-xs text-blue-600 transition hover:text-blue-700">Editar</Link>
                        <form action={deleteExpense} className="ml-3 inline">
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="text-xs text-zinc-400 transition hover:text-rose-600" title="Borrar">Borrar</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
