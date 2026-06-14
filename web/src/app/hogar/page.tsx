import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getHousehold, getMembers } from "@/lib/queries";
import {
  renameHousehold,
  regenerateInvite,
  joinHouseholdAction,
  updateHouseholdSplit,
} from "@/app/actions";
import NavBar from "@/components/NavBar";

export const dynamic = "force-dynamic";

const inp =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
const btn = "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700";
const btnGhost =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300";

export default async function HogarPage({
  searchParams,
}: {
  searchParams: Promise<{ nuevo?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { nuevo, error } = await searchParams;
  const [household, members] = await Promise.all([getHousehold(), getMembers()]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const inviteUrl = household.inviteCode
    ? `${proto}://${host}/registro?invite=${household.inviteCode}`
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <NavBar active="hogar" user={user} />
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{household.name}</h1>
      <p className="mb-6 text-sm text-zinc-500">Tu hogar y sus miembros.</p>

      {nuevo && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          ¡Hogar creado! Comparte el enlace de abajo para que tu pareja (u otros) se unan.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Invitar */}
      <section className="mb-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Invitar a tu hogar
        </h2>
        <p className="mb-2 text-sm text-zinc-500">
          Comparte este enlace. Quien lo abra y se registre, entra a TU hogar y ve los mismos datos.
        </p>
        <input readOnly value={inviteUrl ?? "—"} className={`${inp} mb-3 font-mono text-xs`} />
        <form action={regenerateInvite}>
          <button className={btnGhost}>Generar un enlace nuevo</button>
          <span className="ml-2 text-xs text-zinc-400">(invalida el anterior)</span>
        </form>
      </section>

      {/* Miembros */}
      <section className="mb-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Miembros ({members.length})
        </h2>
        <ul className="space-y-1 text-sm">
          {members.map((m, i) => (
            <li key={i} className="flex justify-between">
              <span className="font-medium">{m.person}</span>
              <span className="text-zinc-400">{m.email ?? "sin cuenta vinculada"}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Manejo de gastos */}
      <section className="mb-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Manejo de gastos
        </h2>
        <form action={updateHouseholdSplit} className="space-y-4">
          <fieldset>
            <label className="flex items-start gap-2 py-1 text-sm">
              <input type="radio" name="splitMode" value="individual"
                defaultChecked={household.splitMode === "individual"} className="mt-1" />
              <span><b>Individual</b> — cada gasto es de una persona, sin dividir.</span>
            </label>
            <label className="flex items-start gap-2 py-1 text-sm">
              <input type="radio" name="splitMode" value="shared"
                defaultChecked={household.splitMode === "shared"} className="mt-1" />
              <span><b>Compartido</b> — se pueden dividir gastos entre miembros.</span>
            </label>
          </fieldset>

          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="mb-2 text-xs font-medium text-zinc-500">
              Si es compartido, ¿cómo se reparte por defecto al dividir?
            </p>
            <label className="flex items-center gap-2 py-1 text-sm">
              <input type="radio" name="defaultSplit" value="equal"
                defaultChecked={household.defaultSplit === "equal"} /> Partes iguales
            </label>
            <label className="flex items-center gap-2 py-1 text-sm">
              <input type="radio" name="defaultSplit" value="percent"
                defaultChecked={household.defaultSplit === "percent"} /> Por porcentajes:
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {members.map((m) => (
                <label key={m.personId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{m.person}</span>
                  <span className="flex items-center gap-1">
                    <input type="number" step="0.01" min="0" max="100" name={`pct_${m.personId}`}
                      defaultValue={m.pct ?? ""} placeholder="—" className={`${inp} max-w-24`} />
                    %
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button className={btn}>Guardar manejo de gastos</button>
        </form>
      </section>

      {/* Renombrar */}
      <section className="mb-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Nombre del hogar
        </h2>
        <form action={renameHousehold} className="flex gap-2">
          <input name="name" defaultValue={household.name} className={inp} />
          <button className={btn}>Guardar</button>
        </form>
      </section>

      {/* Unirse a otro hogar */}
      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Unirme a otro hogar
        </h2>
        <p className="mb-3 text-xs text-zinc-400">
          Si te pasaron un código, únete a ese hogar. (Dejarás de ver el hogar actual.)
        </p>
        <form action={joinHouseholdAction} className="flex gap-2">
          <input name="invite" placeholder="código de invitación" className={inp} />
          <button className={btnGhost}>Unirme</button>
        </form>
      </section>
    </main>
  );
}
