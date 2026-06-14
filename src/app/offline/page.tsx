// Página de respaldo cuando no hay conexión (la cachea el service worker).
// Es pública (sin sesión) para que el SW la pueda guardar.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center px-5 py-10 text-center">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Sin conexión</h1>
      <p className="text-sm text-zinc-500">
        No hay internet en este momento. Revisa tu conexión e intenta de nuevo.
      </p>
    </main>
  );
}
