import {
  getPeriods,
  getOverview,
  getCategories,
  getCaps,
  getPeople,
  getInstallments,
  getAlerts,
} from "@/lib/queries";
import { money, monthLabel, currentPeriod } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import MonthNav from "@/components/MonthNav";

export const dynamic = "force-dynamic";

const isPeriod = (s?: string) => !!s && /^\d{4}-\d{2}-01$/.test(s);

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const periods = await getPeriods();
  const period = isPeriod(mes) ? mes! : (periods[periods.length - 1] ?? currentPeriod());

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <NavBar active="tablero" mes={period} user={user} />

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FinApp</h1>
          <p className="text-sm text-zinc-500">{monthLabel(period)}</p>
        </div>
        <MonthNav basePath="/" selected={period} existing={periods} />
      </header>

      <DashboardBody period={period} />
    </main>
  );
}

async function DashboardBody({ period }: { period: string }) {
  const [overview, categories, caps, people, installments, alerts] = await Promise.all([
    getOverview(period),
    getCategories(period),
    getCaps(period),
    getPeople(period),
    getInstallments(period),
    getAlerts(period),
  ]);

  return (
    <>
      {/* Avisos */}
      {alerts.length > 0 && (
        <section className="mb-6 space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                a.level === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                  : a.level === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                    : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
              }`}
            >
              <span>{a.level === "danger" ? "⚠️" : a.level === "warning" ? "🔔" : "ℹ️"}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </section>
      )}

      {/* Resumen del mes */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Ingresos" value={overview.ingresos} tone="pos" />
        <Stat label="Gastos" value={overview.gastos} tone="neg" />
        <Stat
          label="Sobrante"
          value={overview.sobrante}
          tone={overview.sobrante >= 0 ? "pos" : "alert"}
        />
      </section>

      {/* Disponible por persona */}
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {people.map((pers) => (
          <div
            key={pers.person}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{pers.person}</span>
              <span className="text-xs text-zinc-500">disponible de su salario</span>
            </div>
            <p
              className={`mt-1 text-2xl font-bold ${
                pers.available < 0 ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {money(pers.available)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              ingreso {money(pers.income)} · su parte de gastos {money(pers.spent)}
            </p>
          </div>
        ))}
      </section>

      {/* Topes que se descuentan: Gasolina y Comida */}
      {caps.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Topes del mes (se descuentan)
          </h2>
          <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {caps.map((c) => {
              const pct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0;
              const over = c.remaining < 0;
              return (
                <div
                  key={c.category}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{c.category}</span>
                    <span
                      className={`text-sm font-medium ${over ? "text-rose-600" : "text-emerald-600"}`}
                    >
                      {over ? "excedido " : "disponible "} {money(c.remaining)}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-emerald-500"}`}
                      style={{ width: `${over ? 100 : pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {money(c.spent)} de {money(c.budget)}
                  </p>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* Vista general por categoría */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Presupuesto vs Real por categoría
      </h2>
      {categories.length === 0 ? (
        <section className="mb-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Aún no hay categorías. Crea las tuyas en{" "}
          <a href="/config" className="font-medium text-blue-600 hover:text-blue-700">
            Configuración
          </a>
          .
        </section>
      ) : (
      <section className="mb-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2.5 font-medium">Categoría</th>
              <th className="px-4 py-2.5 text-right font-medium">Presupuesto</th>
              <th className="px-4 py-2.5 text-right font-medium">Real</th>
              <th className="px-4 py-2.5 text-right font-medium">Resta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categories.map((c) => (
              <tr key={c.category}>
                <td className="px-4 py-2.5 font-medium">{c.category}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {money(c.budget)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(c.spent)}</td>
                <td
                  className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                    c.remaining < 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {money(c.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}

      {/* Meses sin intereses vivos */}
      {installments.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Meses sin intereses activos
          </h2>
          <section className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {installments.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-2.5 text-sm dark:border-zinc-800"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-zinc-500">
                  {money(m.monthly)}/mes · termina{" "}
                  <b className="text-zinc-700 dark:text-zinc-300">{monthLabel(m.endPeriod)}</b>
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pos" | "neg" | "alert";
}) {
  const color =
    tone === "alert"
      ? "text-rose-600"
      : tone === "neg"
        ? "text-zinc-900 dark:text-white"
        : "text-emerald-600";
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{money(value)}</p>
    </div>
  );
}
