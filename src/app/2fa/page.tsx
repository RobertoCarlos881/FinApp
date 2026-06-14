import Link from "next/link";
import QRCode from "qrcode";
import { requireUser, totpUri } from "@/lib/auth";
import { getDb } from "@/db/client";
import { start2fa, enable2fa, disable2fa } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

const inp =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
const btn =
  "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700";

export default async function TwoFAPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;

  const db = await getDb();
  const r = await db.query<{ totp_secret: string | null; totp_enabled: boolean }>(
    "SELECT totp_secret, totp_enabled FROM app_user WHERE id = $1",
    [user.id],
  );
  const secret = r.rows[0]?.totp_secret ?? null;
  const enabled = Boolean(r.rows[0]?.totp_enabled);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Verificación en 2 pasos</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Protege tu cuenta con una app como Google Authenticator o Authy.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {enabled ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-900 dark:bg-emerald-950">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ La verificación en 2 pasos está activada
          </p>
          <form action={disable2fa} className="mt-4">
            <button className="text-xs text-zinc-500 underline hover:text-rose-600">
              Desactivar 2FA
            </button>
          </form>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            Ir al tablero →
          </Link>
        </div>
      ) : !secret ? (
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Genera tu código para vincular la app de autenticación.
          </p>
          <form action={start2fa}>
            <button className={btn}>Activar 2FA</button>
          </form>
          <Link href="/" className="mt-4 block text-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            Ahora no, ir al tablero
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>Abre tu app de autenticación.</li>
            <li>Escanea este código QR.</li>
            <li>Escribe el código de 6 dígitos que aparece.</li>
          </ol>
          <div className="mb-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={await QRCode.toDataURL(totpUri(secret, user.email), { margin: 1, width: 200 })}
              alt="Código QR para 2FA"
              className="rounded-lg border border-zinc-200 dark:border-zinc-700"
              width={200}
              height={200}
            />
          </div>
          <details className="mb-4 text-center text-xs text-zinc-400">
            <summary className="cursor-pointer">¿No puedes escanear? Ver clave</summary>
            <code className="mt-1 block break-all font-mono text-zinc-500">{secret}</code>
          </details>
          <form action={enable2fa} className="space-y-3">
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              autoFocus
              className={`${inp} text-center tracking-widest`}
            />
            <button className={btn}>Verificar y activar</button>
          </form>
        </div>
      )}
    </main>
  );
}
