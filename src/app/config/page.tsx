import {
  getCategoriesAll,
  getAccountsAll,
  getIncomeSourcesAll,
  getInstallmentsAll,
  getFixedExpensesAll,
  getAccountCutoffs,
  getCategoryOptions,
  getPersonOptions,
} from "@/lib/queries";
import {
  addCategory,
  updateCategory,
  addAccount,
  updateAccount,
  addIncomeSource,
  updateIncomeSource,
  addInstallment,
  updateInstallment,
  deleteInstallment,
  addFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  setAccountCutoff,
  deleteAccountCutoff,
} from "@/app/actions";
import NavBar from "@/components/NavBar";
import { requireUser } from "@/lib/auth";
import { monthLabel } from "@/lib/format";
import { CategoryRow, AccountRow, SourceRow, InstallmentRow, FixedExpenseRow } from "./EditableRows";

export const dynamic = "force-dynamic";

const inp =
  "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
const btn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700";

const MODES: [string, string][] = [
  ["cap", "Tope (se descuenta)"],
  ["planned", "Planeado (suma de partidas)"],
  ["tracking", "Seguimiento (sin tope)"],
];
const KINDS: [string, string][] = [
  ["credit_card", "Crédito"],
  ["debit", "Débito"],
  ["cash", "Efectivo"],
];
const FREQS: [string, string][] = [
  ["weekly", "Semanal"],
  ["biweekly", "Quincenal"],
  ["monthly", "Mensual"],
];
const BASES: [string, string][] = [
  ["per_payment", "monto por pago"],
  ["monthly", "total del mes"],
];

export default async function ConfigPage() {
  const user = await requireUser();
  const [categories, accounts, sources, installments, recurring, catOptions, people] = await Promise.all([
    getCategoriesAll(),
    getAccountsAll(),
    getIncomeSourcesAll(),
    getInstallmentsAll(),
    getFixedExpensesAll(),
    getCategoryOptions(),
    getPersonOptions(),
  ]);
  const cutoffs = await getAccountCutoffs();

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8">
      <NavBar active="config" user={user} />
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Configuración</h1>

      {/* ---------------- Categorías ---------------- */}
      <Section title="Categorías">
        <form action={addCategory} className="mb-4 flex flex-wrap items-end gap-2">
          <input name="name" placeholder="Nueva categoría" required className={inp} />
          <select name="budgetMode" defaultValue="tracking" className={inp}>
            {MODES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className={btn}>Agregar</button>
        </form>
        <div className="space-y-2">
          {categories.map((c) => (
            <CategoryRow key={c.id} c={c} action={updateCategory} />
          ))}
        </div>
      </Section>

      {/* ---------------- Cuentas ---------------- */}
      <Section title="Cuentas y tarjetas">
        <form action={addAccount} className="mb-4 flex flex-wrap items-end gap-2">
          <select name="personId" required className={inp}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input name="name" placeholder="Nombre (ej. AMEX)" required className={inp} />
          <input name="bank" placeholder="Banco" className={inp} />
          <select name="kind" defaultValue="credit_card" className={inp}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input name="cutoffDay" type="number" min="1" max="31" placeholder="Corte" className={`${inp} w-20`} />
          <button className={btn}>Agregar</button>
        </form>
        <div className="space-y-2">
          {accounts.map((a) => (
            <AccountRow key={a.id} a={a} people={people} action={updateAccount} />
          ))}
        </div>

        {/* Cambios de fecha de corte (tarjetas de crédito) */}
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium text-zinc-500">Cambios de fecha de corte</p>
          <p className="mb-3 text-xs text-zinc-400">
            En tarjetas de crédito, un gasto cuenta en el mes que se paga (según el corte). Si el corte cambió, regístralo aquí desde qué mes aplica.
          </p>
          <form action={setAccountCutoff} className="mb-3 flex flex-wrap items-end gap-2">
            <select name="accountId" required className={inp}>
              {accounts.filter((a) => a.kind === "credit_card").map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.person})</option>
              ))}
            </select>
            <label className="text-xs text-zinc-500">Desde<input name="effectiveFrom" type="month" required className={`${inp} ml-1`} /></label>
            <input name="cutoffDay" type="number" min="1" max="31" placeholder="Día de corte" required className={`${inp} w-28`} />
            <button className={btn}>Registrar</button>
          </form>
          <ul className="space-y-1 text-sm">
            {cutoffs.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <span>
                  <b>{c.account}</b>{" "}
                  <span className="text-xs text-zinc-400">· desde {monthLabel(c.effectiveFrom)} · corte día {c.cutoffDay}</span>
                </span>
                <form action={deleteAccountCutoff}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-zinc-400 hover:text-rose-600">Borrar</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ---------------- Trabajos / ingresos ---------------- */}
      <Section title="Trabajos (fuentes de ingreso)">
        <form action={addIncomeSource} className="mb-4 flex flex-wrap items-end gap-2">
          <select name="personId" required className={inp}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input name="name" placeholder="Trabajo (ej. SEP)" required className={inp} />
          <select name="frequency" defaultValue="biweekly" className={inp} title="¿Cada cuándo te pagan?">
            {FREQS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input name="expected" type="number" step="0.01" min="0" placeholder="Monto" className={`${inp} w-28`} />
          <select name="basis" defaultValue="per_payment" className={inp} title="¿El monto es por pago o el total del mes?">
            {BASES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className={btn}>Agregar</button>
        </form>
        <div className="space-y-2">
          {sources.map((s) => (
            <SourceRow key={s.id} s={s} people={people} action={updateIncomeSource} />
          ))}
        </div>
      </Section>

      {/* ---------------- Gastos recurrentes ---------------- */}
      <Section title="Gastos recurrentes (cada mes)">
        <p className="mb-3 text-xs text-zinc-400">
          Se repiten solos cada mes y cuentan en el disponible. Puedes ajustar el monto de un mes en la sección Gastos.
        </p>
        <form action={addFixedExpense} className="mb-4 flex flex-wrap items-end gap-2">
          <input name="name" placeholder="Ej. Internet" required className={inp} />
          <select name="categoryId" required className={inp}>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="amount" type="number" step="0.01" min="0" placeholder="Monto/mes" required className={`${inp} w-28`} />
          <select name="ownerId" defaultValue="" className={inp} title="Dueño (vacío = dividido)">
            <option value="">Dividido</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label className="text-xs text-zinc-500">Desde<input name="startPeriod" type="month" required className={`${inp} ml-1`} /></label>
          <label className="text-xs text-zinc-500">Hasta<input name="endPeriod" type="month" className={`${inp} ml-1`} /></label>
          <button className={btn}>Agregar</button>
        </form>
        {catOptions.length === 0 && (
          <p className="text-sm text-zinc-500">Primero crea categorías arriba.</p>
        )}
        <div className="space-y-2">
          {recurring.map((f) => (
            <FixedExpenseRow key={f.id} f={f} categories={catOptions} people={people} action={updateFixedExpense} onDelete={deleteFixedExpense} />
          ))}
        </div>
      </Section>

      {/* ---------------- Meses sin intereses ---------------- */}
      <Section title="Meses sin intereses">
        <form action={addInstallment} className="mb-4 flex flex-wrap items-end gap-2">
          <input name="name" placeholder="Compra (ej. Consola)" required className={inp} />
          <input name="monthly" type="number" step="0.01" min="0" placeholder="Mensualidad" required className={`${inp} w-32`} />
          <label className="text-xs text-zinc-500">Desde<input name="firstPeriod" type="month" required className={`${inp} ml-1`} /></label>
          <label className="text-xs text-zinc-500">Termina<input name="endPeriod" type="month" required className={`${inp} ml-1`} /></label>
          <select name="ownerId" defaultValue="" className={inp}>
            <option value="">Dueño (opcional)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className={btn}>Agregar</button>
        </form>
        <div className="space-y-2">
          {installments.map((m) => (
            <InstallmentRow key={m.id} m={m} people={people} action={updateInstallment} onDelete={deleteInstallment} />
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}
