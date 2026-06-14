import Link from "next/link";
import { loginAction } from "@/app/auth-actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inp =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; need2fa?: string; email?: string }>;
}) {
  const { error, need2fa, email } = await searchParams;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">FinApp</h1>
      <p className="mb-6 text-sm text-zinc-500">Inicia sesión para continuar.</p>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <form action={loginAction} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Correo</span>
          <input type="email" name="email" defaultValue={email ?? ""} required className={inp} autoFocus={!need2fa} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Contraseña</span>
          <input type="password" name="password" required className={inp} />
        </label>

        {need2fa && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Código de verificación (2 pasos)
            </span>
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              autoFocus
              className={`${inp} tracking-widest`}
            />
          </label>
        )}

        <SubmitButton
          pendingText="Entrando…"
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {need2fa ? "Verificar y entrar" : "Entrar"}
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        ¿Primera vez?{" "}
        <Link href="/registro" className="font-medium text-blue-600 hover:text-blue-700">
          Crear cuenta
        </Link>
      </p>
    </main>
  );
}
