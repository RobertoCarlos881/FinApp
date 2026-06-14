import { requireUser } from "@/lib/auth";
import {
  getPeriods,
  getPersonOptions,
  getBalances,
  settleUp,
  getSettlements,
  getDebts,
} from "@/lib/queries";
import { money, monthLabel, currentPeriod } from "@/lib/format";
import { addSettlement, deleteSettlement, addDebt, payDebt, deleteDebt } from "@/app/actions";
import NavBar from "@/components/NavBar";
import MonthNav from "@/components/MonthNav";

export const dynamic = "force-dynamic";

const isPeriod = (s?: string) => !!s && /^\d{4}-\d{2}-01$/.test(s);
const inp =
  "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
const btn = "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700";
const btnGhost =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300";

export default async function SaldosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const periods = await getPeriods();
  const period = isPeriod(mes) ? mes! : (periods[periods.length - 1] ?? currentPeriod());

  const [people, balances, settlements, debts] = await Promise.all([
    getPersonOptions(),
    getBalances(period),
    getSettlements(period),
    getDebts(),
  ]);
  const suggestions = settleUp(balances);
  const payable = debts.filter((d) => d.direction === "payable");
  const receivable = debts.filter((d) => d.direction === "receivable");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <NavBar active="saldos" mes={period} user={user} />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Saldos</h1>
          <p className="text-sm text-zinc-500">{monthLabel(period)}</p>
        </div>
        <MonthNav basePath="/saldos" selected={period} existing={periods} />
      </header>

      {/* ---------------- Liquidaciones entre miembros ---------------- */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Entre ustedes (quién pagó vs lo que le tocó)
      </h2>
      <section className="mb-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2.5 font-medium">Persona</th>
              <th className="px-4 py-2.5 text-right font-medium">Pagó</th>
              <th className="px-4 py-2.5 text-right font-medium">Le tocó</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {balances.map((b) => (
              <tr key={b.personId}>
                <td className="px-4 py-2.5 font-medium">{b.person}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{money(b.paid)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{money(b.responsible)}</td>
                <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${b.net < 0 ? "text-rose-600" : b.net > 0 ? "text-emerald-600" : ""}`}>
                  {b.net > 0 ? `le deben ${money(b.net)}` : b.net < 0 ? `debe ${money(-b.net)}` : "a mano"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {suggestions.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950">
          <p className="mb-1 font-medium text-blue-700 dark:text-blue-300">Para quedar a mano:</p>
          <ul className="space-y-0.5 text-blue-700 dark:text-blue-300">
            {suggestions.map((s, i) => (
              <li key={i}>• {s.from} le da {money(s.amount)} a {s.to}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Registrar un pago entre miembros */}
      <section className="mb-8 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-xs font-medium text-zinc-500">Registrar un pago entre ustedes</p>
        <form action={addSettlement} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value={period} />
          <select name="fromId" required className={inp} aria-label="De">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="self-center text-xs text-zinc-400">le pagó a</span>
          <select name="toId" required className={inp} aria-label="Para">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input name="amount" type="number" step="0.01" min="0" placeholder="Monto" required className={`${inp} w-28`} />
          <input name="note" placeholder="Nota (opcional)" className={`${inp} flex-1 min-w-32`} />
          <button className={btn}>Registrar</button>
        </form>
        {settlements.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>{s.from} → {s.to}: <b className="tabular-nums">{money(s.amount)}</b>{s.note ? <span className="text-zinc-400"> · {s.note}</span> : null}</span>
                <form action={deleteSettlement}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-xs text-zinc-400 hover:text-rose-600">Borrar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Deudas y por cobrar ---------------- */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Deudas y dinero por cobrar
      </h2>
      <section className="mb-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <form action={addDebt} className="flex flex-wrap items-end gap-2">
          <select name="personId" required className={inp} aria-label="Persona">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="direction" defaultValue="payable" className={inp}>
            <option value="payable">debe a</option>
            <option value="receivable">le deben (por cobrar)</option>
          </select>
          <input name="counterparty" placeholder="¿A quién? (ej. Papás)" required className={`${inp} min-w-32`} />
          <input name="amount" type="number" step="0.01" min="0" placeholder="Monto" required className={`${inp} w-28`} />
          <input name="note" placeholder="Nota" className={`${inp} flex-1 min-w-28`} />
          <button className={btn}>Agregar</button>
        </form>
      </section>

      <DebtList title="Lo que deben" rows={payable} />
      <DebtList title="Lo que les deben (por cobrar)" rows={receivable} />
    </main>
  );
}

function DebtList({
  title,
  rows,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getDebts>>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{d.counterparty}</span>
                  <span className="text-xs text-zinc-400"> · {d.person}</span>
                  {d.note ? <span className="block text-xs text-zinc-400">{d.note}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                  {money(d.paid)} de {money(d.amount)}
                </td>
                <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${d.remaining > 0 ? "" : "text-emerald-600"}`}>
                  {d.remaining > 0 ? `faltan ${money(d.remaining)}` : "saldado"}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {d.remaining > 0 && (
                    <form action={payDebt} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={d.id} />
                      <input name="abono" type="number" step="0.01" min="0" placeholder="abono"
                        className="w-20 rounded border border-zinc-200 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
                      <button className="text-xs font-medium text-blue-600 hover:text-blue-700">Abonar</button>
                    </form>
                  )}
                  <form action={deleteDebt} className="ml-2 inline">
                    <input type="hidden" name="id" value={d.id} />
                    <button className="text-xs text-zinc-400 hover:text-rose-600">Borrar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
