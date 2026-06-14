import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";

/** Barra de navegación principal. `active` marca la sección actual. */
export default function NavBar({
  active,
  mes,
  user,
}: {
  active: string;
  mes?: string;
  user: { name: string };
}) {
  const q = mes ? `?mes=${mes}` : "";
  const items: [string, string, string][] = [
    ["tablero", "Tablero", `/${q}`],
    ["gastos", "Gastos", `/gastos${q}`],
    ["mes", "Mes", `/mes${q}`],
    ["saldos", "Saldos", `/saldos${q}`],
    ["graficas", "Gráficas", `/graficas${q}`],
    ["config", "Configuración", `/config`],
    ["hogar", "Hogar", `/hogar`],
  ];
  return (
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
      <div className="flex flex-wrap gap-1 text-sm">
        {items.map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              active === key
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Link href="/2fa" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          {user.name}
        </Link>
        <form action={logoutAction}>
          <button className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:text-rose-600">
            Salir
          </button>
        </form>
      </div>
    </nav>
  );
}
