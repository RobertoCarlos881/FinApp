import Link from "next/link";
import { registerAction } from "@/app/auth-actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inp =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; modo?: string }>;
}) {
  const { error, invite, modo } = await searchParams;
  const mode = invite ? "invite" : modo === "unir" ? "join" : "new";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        {mode === "new" ? "Crear cuenta" : "Unirme a un hogar"}
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        {mode === "invite"
          ? "Te invitaron a un hogar. Crea tu cuenta para unirte."
          : mode === "join"
            ? "Ingresa el código de invitación que te compartieron."
            : "Tu hogar privado para administrar tus finanzas."}
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <form action={registerAction} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Tu nombre (así aparecerás en la app)
          </span>
          <input type="text" name="name" required className={inp} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Correo</span>
          <input type="email" name="email" required className={inp} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Contraseña (8+ caracteres)</span>
          <input type="password" name="password" required minLength={8} className={inp} />
        </label>

        {mode === "new" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Nombre del hogar</span>
              <input type="text" name="householdName" placeholder="Ej. Nuestra casa" className={inp} />
            </label>
            <fieldset className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <legend className="px-1 text-xs font-medium text-zinc-500">¿Cómo manejan los gastos?</legend>
              <label className="flex items-start gap-2 py-1 text-sm">
                <input type="radio" name="mode" value="individual" defaultChecked className="mt-1" />
                <span>
                  <b>Individual</b> — cada gasto es de una persona, sin dividir.
                  <span className="block text-xs text-zinc-400">Ideal para solo ver quién gastó qué.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 py-1 text-sm">
                <input type="radio" name="mode" value="shared" className="mt-1" />
                <span>
                  <b>Compartido</b> — pueden dividir gastos entre los miembros.
                  <span className="block text-xs text-zinc-400">Luego eliges si por partes iguales o por %.</span>
                </span>
              </label>
            </fieldset>
            <p className="text-xs text-zinc-400">
              Podrás invitar a otras personas y cambiar esto después, en la sección Hogar.
            </p>
          </>
        )}

        {mode === "invite" && <input type="hidden" name="invite" value={invite} />}

        {mode === "join" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Código de invitación</span>
            <input type="text" name="invite" required placeholder="pega aquí el código" className={inp} />
          </label>
        )}

        <SubmitButton
          pendingText="Creando cuenta…"
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {mode === "new" ? "Crear cuenta y hogar" : "Unirme al hogar"}
        </SubmitButton>
      </form>

      <div className="mt-5 space-y-1 text-center text-sm text-zinc-500">
        {mode === "new" && (
          <p>
            ¿Te invitaron?{" "}
            <Link href="/registro?modo=unir" className="font-medium text-blue-600 hover:text-blue-700">
              Unirme con un código
            </Link>
          </p>
        )}
        {mode === "join" && (
          <p>
            ¿Quieres tu propio hogar?{" "}
            <Link href="/registro" className="font-medium text-blue-600 hover:text-blue-700">
              Crear hogar nuevo
            </Link>
          </p>
        )}
        <p>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
