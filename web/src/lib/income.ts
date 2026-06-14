// Cálculo de los "pagos" (slots) de un trabajo dentro de un mes, según su
// frecuencia. Pura (sirve en servidor y cliente).

export type Frequency = "weekly" | "biweekly" | "monthly";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
};

/** Número de semanas que toca un mes (filas de un calendario: 4–6). */
function weeksInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=Dom .. 6=Sáb
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.ceil((firstWeekday + daysInMonth) / 7);
}

/** Lista de pagos del mes: [{slot, label}]. */
export function incomeSlots(frequency: Frequency, period: string): { slot: number; label: string }[] {
  if (frequency === "monthly") return [{ slot: 1, label: "Mensual" }];
  if (frequency === "biweekly")
    return [
      { slot: 1, label: "1ª quincena" },
      { slot: 2, label: "2ª quincena" },
    ];
  // weekly
  const n = weeksInMonth(period);
  return Array.from({ length: n }, (_, i) => ({ slot: i + 1, label: `Semana ${i + 1}` }));
}
