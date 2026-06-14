// Utilidades de formato compartidas (seguras para cliente y servidor).

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function money(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Normaliza un DATE de Postgres (string o Date) a 'YYYY-MM-DD'. */
export function isoDate(d: string | Date): string {
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

/** 'Mayo 2026' a partir de un 'YYYY-MM-01'. */
export function monthLabel(d: string | Date): string {
  const iso = isoDate(d);
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

/** Período (primer día) del mes actual, 'YYYY-MM-01'. */
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
