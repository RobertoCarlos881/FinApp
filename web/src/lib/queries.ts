import { getDb } from "@/db/client";
import { getHouseholdId } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { incomeSlots, type Frequency } from "@/lib/income";

// PGlite (como pg) devuelve NUMERIC como string; este helper lo pasa a número.
const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// --------------------------- Recurrentes (gastos fijos + MSI) ---------------------------
export type RecurringItem = {
  kind: "fixed" | "msi";
  id: number;
  name: string;
  categoryId: number | null;
  category: string;
  amount: number;
  ownerId: number | null;
  splits: { personId: number; amount: number }[];
};

/**
 * Gastos automáticos del mes (NO se capturan a mano): gastos recurrentes
 * (fixed_expense) activos + mensualidades de Meses sin intereses (installment_plan)
 * activos. Cada uno cuenta en gastos/categoría/disponible. El monto de un
 * recurrente se puede ajustar por mes (fixed_expense_month).
 */
export async function getRecurringForMonth(period: string): Promise<RecurringItem[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const persons = (
    await db.query<{ id: number }>(
      "SELECT id FROM person WHERE household_id = $1 AND active ORDER BY id",
      [hid],
    )
  ).rows.map((r) => Number(r.id));

  const fixed = await db.query<Record<string, unknown>>(
    `SELECT f.id, f.name, f.category_id, c.name AS category, f.default_owner_id AS owner_id,
            COALESCE(fm.amount, f.amount) AS amount
       FROM fixed_expense f
       JOIN category c ON c.id = f.category_id
       LEFT JOIN fixed_expense_month fm ON fm.fixed_expense_id = f.id AND fm.period = $1
      WHERE f.household_id = $2 AND f.active
        AND f.start_period <= $1 AND (f.end_period IS NULL OR f.end_period >= $1)`,
    [period, hid],
  );
  const msi = await db.query<Record<string, unknown>>(
    `SELECT i.id, i.name, i.category_id, c.name AS category, i.owner_id, i.monthly_amount AS amount
       FROM installment_plan i
       LEFT JOIN category c ON c.id = i.category_id
      WHERE i.household_id = $2 AND i.first_period <= $1 AND i.end_period >= $1`,
    [period, hid],
  );

  const splitOf = (ownerId: number | null, amount: number) => {
    if (ownerId != null) return [{ personId: ownerId, amount }];
    if (persons.length === 0) return [];
    const per = round2(amount / persons.length);
    return persons.map((pid, i) => ({
      personId: pid,
      amount: i === persons.length - 1 ? round2(amount - per * (persons.length - 1)) : per,
    }));
  };

  const items: RecurringItem[] = [];
  for (const f of fixed.rows) {
    const ownerId = f.owner_id != null ? Number(f.owner_id) : null;
    const amount = num(f.amount);
    items.push({
      kind: "fixed",
      id: Number(f.id),
      name: String(f.name),
      categoryId: f.category_id != null ? Number(f.category_id) : null,
      category: String(f.category),
      amount,
      ownerId,
      splits: splitOf(ownerId, amount),
    });
  }
  for (const m of msi.rows) {
    const ownerId = m.owner_id != null ? Number(m.owner_id) : null;
    const amount = num(m.amount);
    items.push({
      kind: "msi",
      id: Number(m.id),
      name: String(m.name),
      categoryId: m.category_id != null ? Number(m.category_id) : null,
      category: m.category ? String(m.category) : "Meses sin intereses",
      amount,
      ownerId,
      splits: splitOf(ownerId, amount),
    });
  }
  return items;
}

export type CategoryRow = {
  categoryId: number;
  category: string;
  budgetMode: "cap" | "planned" | "tracking";
  budget: number;
  spent: number;
  remaining: number;
};

export type PersonRow = {
  person: string;
  income: number;
  spent: number;
  available: number;
};

export type Installment = { name: string; monthly: number; endPeriod: string };
export type Option = { id: number; name: string; pct?: number | null };

/** Meses con presupuesto cargado (del hogar). */
export async function getPeriods(): Promise<string[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<{ period: Date }>(
    `SELECT DISTINCT period FROM budget WHERE household_id = $1 ORDER BY period`,
    [hid],
  );
  return r.rows.map((x) => isoDate(x.period));
}

/** Totales del mes: ingresos, gastos y sobrante. */
export async function getOverview(period: string) {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<{ ingresos: string; gastos: string }>(
    `SELECT
        (SELECT COALESCE(SUM(amount),0) FROM income
          WHERE period = $1 AND household_id = $2) AS ingresos,
        (SELECT COALESCE(SUM(amount),0) FROM transaction
          WHERE period = $1 AND household_id = $2) AS gastos`,
    [period, hid],
  );
  const rec = await getRecurringForMonth(period);
  const recTotal = rec.reduce((s, i) => s + i.amount, 0);
  const ingresos = num(r.rows[0].ingresos);
  const gastos = round2(num(r.rows[0].gastos) + recTotal); // incluye recurrentes + MSI
  return { ingresos, gastos, sobrante: round2(ingresos - gastos) };
}

/** Presupuesto vs Real por categoría (todas las activas del hogar). */
export async function getCategories(period: string): Promise<CategoryRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT c.id AS category_id, c.name AS category, c.budget_mode,
            COALESCE(b.amount, 0) AS budget,
            COALESCE(t.spent, 0) AS spent
       FROM category c
       LEFT JOIN budget b ON b.category_id = c.id AND b.period = $1
       LEFT JOIN (
         SELECT category_id, SUM(amount) AS spent
           FROM transaction WHERE period = $1 AND household_id = $2 GROUP BY category_id
       ) t ON t.category_id = c.id
      WHERE c.active AND c.household_id = $2
      ORDER BY c.sort_order, c.name`,
    [period, hid],
  );
  const rows: CategoryRow[] = r.rows.map((x) => ({
    categoryId: Number(x.category_id),
    category: String(x.category),
    budgetMode: x.budget_mode as CategoryRow["budgetMode"],
    budget: num(x.budget),
    spent: num(x.spent),
    remaining: 0,
  }));
  // Suma los gastos recurrentes + MSI a la categoría que corresponda.
  const rec = await getRecurringForMonth(period);
  for (const item of rec) {
    if (item.categoryId == null) continue;
    const row = rows.find((r2) => r2.categoryId === item.categoryId);
    if (row) row.spent = round2(row.spent + item.amount);
  }
  for (const row of rows) row.remaining = round2(row.budget - row.spent);
  return rows;
}

/** Categorías con tope que se descuenta. */
export async function getCaps(period: string): Promise<CategoryRow[]> {
  return (await getCategories(period)).filter((c) => c.budgetMode === "cap");
}

/** Disponible por persona del hogar. */
export async function getPeople(period: string): Promise<PersonRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `WITH inc AS (
        SELECT s.person_id, SUM(i.amount) AS income
          FROM income i JOIN income_source s ON s.id = i.income_source_id
         WHERE i.period = $1 AND i.household_id = $2
         GROUP BY s.person_id
      ), exp AS (
        SELECT ts.person_id, SUM(ts.amount) AS responsible
          FROM transaction_split ts JOIN transaction t ON t.id = ts.transaction_id
         WHERE t.period = $1 AND t.household_id = $2
         GROUP BY ts.person_id
      )
      SELECT p.id AS person_id, p.name,
             COALESCE(inc.income, 0) AS income,
             COALESCE(exp.responsible, 0) AS spent,
             COALESCE(inc.income, 0) - COALESCE(exp.responsible, 0) AS available
        FROM person p
        LEFT JOIN inc ON inc.person_id = p.id
        LEFT JOIN exp ON exp.person_id = p.id
       WHERE p.household_id = $2 AND p.active
       ORDER BY p.name`,
    [period, hid],
  );
  const rows = r.rows.map((x) => ({
    person: String(x.name),
    personId: Number(x.person_id),
    income: num(x.income),
    spent: num(x.spent),
    available: num(x.available),
  }));
  // Suma la parte de cada persona en los recurrentes + MSI del mes.
  const rec = await getRecurringForMonth(period);
  for (const item of rec) {
    for (const sp of item.splits) {
      const row = rows.find((r2) => r2.personId === sp.personId);
      if (row) {
        row.spent = round2(row.spent + sp.amount);
        row.available = round2(row.available - sp.amount);
      }
    }
  }
  return rows.map(({ person, income, spent, available }) => ({ person, income, spent, available }));
}

export async function getCategoryOptions(): Promise<Option[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT id, name FROM category WHERE active AND household_id = $1 ORDER BY sort_order, name`,
    [hid],
  );
  return r.rows.map((x) => ({ id: Number(x.id), name: String(x.name) }));
}

export async function getAccountOptions(): Promise<(Option & { person: string })[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT a.id, a.name, p.name AS person
       FROM account a JOIN person p ON p.id = a.person_id
      WHERE a.active AND a.household_id = $1 ORDER BY p.name, a.name`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    person: String(x.person),
  }));
}

export async function getPersonOptions(): Promise<Option[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT id, name, default_pct FROM person WHERE active AND household_id = $1 ORDER BY id`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    pct: x.default_pct != null ? num(x.default_pct) : null,
  }));
}

export type ExpenseRow = {
  id: number;
  date: string;
  period: string;
  category: string;
  account: string | null;
  amount: number;
  description: string | null;
  owners: string;
};

export async function getExpenses(period: string | "all"): Promise<ExpenseRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const all = period === "all";
  const params = all ? [hid] : [hid, period];
  const r = await db.query<Record<string, unknown>>(
    `SELECT t.id, t.date, t.period, c.name AS category, a.name AS account,
            t.amount, t.description,
            string_agg(
              p.name || ' ' || to_char(ts.amount, 'FM$999,999,990.00'),
              ' · ' ORDER BY p.name
            ) AS owners
       FROM transaction t
       JOIN category c ON c.id = t.category_id
       LEFT JOIN account a ON a.id = t.account_id
       LEFT JOIN transaction_split ts ON ts.transaction_id = t.id
       LEFT JOIN person p ON p.id = ts.person_id
      WHERE t.household_id = $1 ${all ? "" : "AND t.period = $2"}
      GROUP BY t.id, c.name, a.name
      ORDER BY t.date DESC, t.id DESC`,
    params,
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    date: isoDate(x.date as string | Date),
    period: isoDate(x.period as string | Date),
    category: String(x.category),
    account: x.account ? String(x.account) : null,
    amount: num(x.amount),
    description: x.description ? String(x.description) : null,
    owners: x.owners ? String(x.owners) : "—",
  }));
}

export type ExpenseDetail = {
  id: number;
  date: string;
  categoryId: number;
  accountId: number | null;
  amount: number;
  description: string | null;
  ownerMode: string; // id de persona (string) o "split"
  splits: { personId: number; amount: number }[];
};

/** Un gasto del hogar, con su división, para precargar el formulario. */
export async function getExpense(id: number): Promise<ExpenseDetail | null> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT id, date, category_id, account_id, amount, description
       FROM transaction WHERE id = $1 AND household_id = $2`,
    [id, hid],
  );
  if (r.rows.length === 0) return null;
  const x = r.rows[0];
  const sp = await db.query<Record<string, unknown>>(
    `SELECT person_id, amount FROM transaction_split WHERE transaction_id = $1 ORDER BY person_id`,
    [id],
  );
  const splits = sp.rows.map((s) => ({ personId: Number(s.person_id), amount: num(s.amount) }));
  const ownerMode = splits.length > 1 ? "split" : String(splits[0]?.personId ?? "");
  return {
    id: Number(x.id),
    date: isoDate(x.date as string | Date),
    categoryId: Number(x.category_id),
    accountId: x.account_id != null ? Number(x.account_id) : null,
    amount: num(x.amount),
    description: x.description ? String(x.description) : null,
    ownerMode,
    splits,
  };
}

export async function getInstallments(period: string): Promise<Installment[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<{ name: string; monthly_amount: string; end_period: Date }>(
    `SELECT name, monthly_amount, end_period
       FROM installment_plan
      WHERE household_id = $2 AND end_period >= $1
      ORDER BY end_period, name`,
    [period, hid],
  );
  return r.rows.map((x) => ({
    name: x.name,
    monthly: num(x.monthly_amount),
    endPeriod: isoDate(x.end_period),
  }));
}

export type BudgetEditRow = { categoryId: number; category: string; amount: number };

export async function getBudgetMonth(period: string): Promise<BudgetEditRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT c.id AS category_id, c.name AS category, COALESCE(b.amount, 0) AS amount
       FROM category c
       LEFT JOIN budget b ON b.category_id = c.id AND b.period = $1
      WHERE c.active AND c.household_id = $2 ORDER BY c.sort_order, c.name`,
    [period, hid],
  );
  return r.rows.map((x) => ({
    categoryId: Number(x.category_id),
    category: String(x.category),
    amount: num(x.amount),
  }));
}

export type IncomeSlot = { slot: number; label: string; amount: number };
export type IncomeEditRow = {
  sourceId: number;
  source: string;
  person: string;
  frequency: Frequency;
  slots: IncomeSlot[];
};

export async function getIncomeMonth(period: string): Promise<IncomeEditRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const sources = await db.query<Record<string, unknown>>(
    `SELECT s.id, s.name AS source, p.name AS person, s.frequency, s.expected_basis, s.expected_amount
       FROM income_source s JOIN person p ON p.id = s.person_id
      WHERE s.active AND s.household_id = $1 ORDER BY p.name, s.name`,
    [hid],
  );
  const incomes = await db.query<Record<string, unknown>>(
    `SELECT income_source_id, slot, amount FROM income WHERE period = $1 AND household_id = $2`,
    [period, hid],
  );
  const existing = new Map<string, number>(); // "sourceId:slot" -> amount
  for (const i of incomes.rows) existing.set(`${i.income_source_id}:${i.slot}`, num(i.amount));

  return sources.rows.map((s) => {
    const sourceId = Number(s.id);
    const frequency = s.frequency as Frequency;
    const expected = num(s.expected_amount);
    const slotDefs = incomeSlots(frequency, period);
    // Default por pago: si el monto es el total del mes, se reparte entre los
    // pagos del mes; si es por pago, se usa tal cual en cada uno.
    const n = slotDefs.length;
    const per = String(s.expected_basis) === "monthly" ? Math.round((expected / n) * 100) / 100 : expected;
    const slots = slotDefs.map((sl, i) => {
      let def = per;
      if (String(s.expected_basis) === "monthly" && i === n - 1) {
        def = Math.round((expected - per * (n - 1)) * 100) / 100; // ajusta centavos
      }
      return {
        slot: sl.slot,
        label: sl.label,
        amount: existing.get(`${sourceId}:${sl.slot}`) ?? def,
      };
    });
    return { sourceId, source: String(s.source), person: String(s.person), frequency, slots };
  });
}

export type CategoryAdmin = { id: number; name: string; budgetMode: string; active: boolean };
export async function getCategoriesAll(): Promise<CategoryAdmin[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT id, name, budget_mode, active FROM category WHERE household_id = $1 ORDER BY sort_order, name`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    budgetMode: String(x.budget_mode),
    active: Boolean(x.active),
  }));
}

export type AccountAdmin = {
  id: number;
  name: string;
  bank: string | null;
  kind: string;
  cutoffDay: number | null;
  personId: number;
  person: string;
  active: boolean;
};
export async function getAccountsAll(): Promise<AccountAdmin[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT a.id, a.name, a.bank, a.kind, a.cutoff_day, a.person_id, p.name AS person, a.active
       FROM account a JOIN person p ON p.id = a.person_id
      WHERE a.household_id = $1 ORDER BY p.name, a.name`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    bank: x.bank ? String(x.bank) : null,
    kind: String(x.kind),
    cutoffDay: x.cutoff_day != null ? Number(x.cutoff_day) : null,
    personId: Number(x.person_id),
    person: String(x.person),
    active: Boolean(x.active),
  }));
}

export type CutoffRow = { id: number; account: string; effectiveFrom: string; cutoffDay: number };
export async function getAccountCutoffs(): Promise<CutoffRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT ac.id, a.name AS account, ac.effective_from, ac.cutoff_day
       FROM account_cutoff ac JOIN account a ON a.id = ac.account_id
      WHERE a.household_id = $1 ORDER BY a.name, ac.effective_from`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    account: String(x.account),
    effectiveFrom: isoDate(x.effective_from as string | Date),
    cutoffDay: Number(x.cutoff_day),
  }));
}

export type SourceAdmin = {
  id: number;
  name: string;
  personId: number;
  person: string;
  frequency: Frequency;
  basis: "per_payment" | "monthly";
  expected: number;
  active: boolean;
};
export async function getIncomeSourcesAll(): Promise<SourceAdmin[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT s.id, s.name, s.person_id, p.name AS person, s.frequency, s.expected_basis, s.expected_amount, s.active
       FROM income_source s JOIN person p ON p.id = s.person_id
      WHERE s.household_id = $1 ORDER BY p.name, s.name`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    personId: Number(x.person_id),
    person: String(x.person),
    frequency: x.frequency as Frequency,
    basis: x.expected_basis as "per_payment" | "monthly",
    expected: num(x.expected_amount),
    active: Boolean(x.active),
  }));
}

export type InstallmentAdmin = {
  id: number;
  name: string;
  monthly: number;
  firstPeriod: string;
  endPeriod: string;
  ownerId: number | null;
  note: string | null;
};
export async function getInstallmentsAll(): Promise<InstallmentAdmin[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  // Solo los MSI activos: que aún no termina su plazo (end_period >= mes actual).
  const r = await db.query<Record<string, unknown>>(
    `SELECT id, name, monthly_amount, first_period, end_period, owner_id, note
       FROM installment_plan
      WHERE household_id = $1 AND end_period >= date_trunc('month', CURRENT_DATE)::date
      ORDER BY end_period, name`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    monthly: num(x.monthly_amount),
    firstPeriod: isoDate(x.first_period as string | Date),
    endPeriod: isoDate(x.end_period as string | Date),
    ownerId: x.owner_id != null ? Number(x.owner_id) : null,
    note: x.note ? String(x.note) : null,
  }));
}

// --------------------------- Avisos ---------------------------
export type Alert = { level: "danger" | "warning" | "info"; text: string };

/** Avisos del mes: topes excedidos, disponible bajo, MSI por terminar, etc. */
export async function getAlerts(period: string): Promise<Alert[]> {
  const [overview, caps, people, installments] = await Promise.all([
    getOverview(period),
    getCaps(period),
    getPeople(period),
    getInstallments(period),
  ]);
  const alerts: Alert[] = [];

  if (overview.sobrante < 0) {
    alerts.push({ level: "danger", text: `Este mes gastaron $${fmt(-overview.sobrante)} más de lo que ingresó.` });
  }

  for (const c of caps) {
    if (c.budget > 0 && c.remaining < 0)
      alerts.push({ level: "danger", text: `Te pasaste en ${c.category}: $${fmt(-c.remaining)} de más.` });
    else if (c.budget > 0 && c.remaining >= 0 && c.remaining < c.budget * 0.1)
      alerts.push({ level: "warning", text: `Casi llegas al límite de ${c.category}: quedan $${fmt(c.remaining)}.` });
  }

  for (const p of people) {
    if (p.income > 0 && p.available < 0)
      alerts.push({ level: "danger", text: `${p.person} ya comprometió más de su ingreso (faltan $${fmt(-p.available)}).` });
    else if (p.income > 0 && p.available >= 0 && p.available < p.income * 0.1)
      alerts.push({ level: "warning", text: `A ${p.person} le queda poco disponible: $${fmt(p.available)}.` });
  }

  for (const m of installments) {
    if (m.endPeriod === period)
      alerts.push({ level: "info", text: `Este mes termina el plazo de "${m.name}" ($${fmt(m.monthly)}/mes).` });
  }

  return alerts;
}

const fmt = (n: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --------------------------- Liquidaciones (quién debe a quién) ---------------------------
export type Balance = {
  personId: number;
  person: string;
  paid: number;
  responsible: number;
  net: number; // >0 le deben ; <0 debe
};

/** Saldo por persona del mes: pagó − le tocó − recibido + pagado (ajustes). */
export async function getBalances(period: string): Promise<Balance[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `WITH paid AS (
        SELECT a.person_id pid, SUM(t.amount) amt
          FROM transaction t JOIN account a ON a.id = t.account_id
         WHERE t.household_id = $1 AND t.period = $2 GROUP BY a.person_id
      ), resp AS (
        SELECT ts.person_id pid, SUM(ts.amount) amt
          FROM transaction_split ts JOIN transaction t ON t.id = ts.transaction_id
         WHERE t.household_id = $1 AND t.period = $2 GROUP BY ts.person_id
      ), sin AS (
        SELECT to_person_id pid, SUM(amount) amt FROM settlement
         WHERE household_id = $1 AND period = $2 GROUP BY to_person_id
      ), sout AS (
        SELECT from_person_id pid, SUM(amount) amt FROM settlement
         WHERE household_id = $1 AND period = $2 GROUP BY from_person_id
      )
      SELECT p.id, p.name,
             COALESCE(paid.amt,0) AS paid,
             COALESCE(resp.amt,0) AS responsible,
             COALESCE(paid.amt,0) - COALESCE(resp.amt,0)
               - COALESCE(sin.amt,0) + COALESCE(sout.amt,0) AS net
        FROM person p
        LEFT JOIN paid ON paid.pid = p.id
        LEFT JOIN resp ON resp.pid = p.id
        LEFT JOIN sin  ON sin.pid  = p.id
        LEFT JOIN sout ON sout.pid = p.id
       WHERE p.household_id = $1 AND p.active
       ORDER BY p.id`,
    [hid, period],
  );
  return r.rows.map((x) => ({
    personId: Number(x.id),
    person: String(x.name),
    paid: num(x.paid),
    responsible: num(x.responsible),
    net: num(x.net),
  }));
}

/** A partir de los saldos, sugiere "X le debe a Y $Z" para quedar a mano. */
export function settleUp(balances: Balance[]): { from: string; to: string; amount: number }[] {
  const debt = balances.filter((b) => b.net < -0.005).map((b) => ({ name: b.person, amt: -b.net }));
  const cred = balances.filter((b) => b.net > 0.005).map((b) => ({ name: b.person, amt: b.net }));
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debt.length && j < cred.length) {
    const z = Math.min(debt[i].amt, cred[j].amt);
    out.push({ from: debt[i].name, to: cred[j].name, amount: Math.round(z * 100) / 100 });
    debt[i].amt -= z;
    cred[j].amt -= z;
    if (debt[i].amt < 0.005) i++;
    if (cred[j].amt < 0.005) j++;
  }
  return out;
}

export type SettlementRow = {
  id: number;
  from: string;
  to: string;
  amount: number;
  note: string | null;
};
export async function getSettlements(period: string): Promise<SettlementRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT s.id, pf.name AS from_name, pt.name AS to_name, s.amount, s.note
       FROM settlement s
       JOIN person pf ON pf.id = s.from_person_id
       JOIN person pt ON pt.id = s.to_person_id
      WHERE s.household_id = $1 AND s.period = $2
      ORDER BY s.id DESC`,
    [hid, period],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    from: String(x.from_name),
    to: String(x.to_name),
    amount: num(x.amount),
    note: x.note ? String(x.note) : null,
  }));
}

// --------------------------- Deudas y por cobrar ---------------------------
export type DebtRow = {
  id: number;
  person: string;
  direction: "payable" | "receivable";
  counterparty: string;
  amount: number;
  paid: number;
  remaining: number;
  note: string | null;
};
export async function getDebts(): Promise<DebtRow[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT d.id, p.name AS person, d.direction, d.counterparty, d.amount, d.paid_amount, d.note
       FROM debt d JOIN person p ON p.id = d.person_id
      WHERE d.household_id = $1
      ORDER BY d.direction, d.created_at DESC`,
    [hid],
  );
  return r.rows.map((x) => {
    const amount = num(x.amount);
    const paid = num(x.paid_amount);
    return {
      id: Number(x.id),
      person: String(x.person),
      direction: x.direction as "payable" | "receivable",
      counterparty: String(x.counterparty),
      amount,
      paid,
      remaining: Math.round((amount - paid) * 100) / 100,
      note: x.note ? String(x.note) : null,
    };
  });
}

// --------------------------- Gráficas ---------------------------
export type TrendPoint = { period: string; income: number; gastos: number; sobrante: number };

/** Ingresos y gastos por mes (todos los meses con datos del hogar). */
export async function getMonthlyTrend(): Promise<TrendPoint[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `WITH per AS (
        SELECT DISTINCT period FROM (
          SELECT period FROM income      WHERE household_id = $1
          UNION SELECT period FROM transaction WHERE household_id = $1
          UNION SELECT period FROM budget  WHERE household_id = $1
        ) z
      )
      SELECT per.period,
        (SELECT COALESCE(SUM(amount),0) FROM income      WHERE household_id = $1 AND period = per.period) AS income,
        (SELECT COALESCE(SUM(amount),0) FROM transaction WHERE household_id = $1 AND period = per.period) AS gastos
      FROM per ORDER BY per.period`,
    [hid],
  );
  return r.rows.map((x) => {
    const income = num(x.income);
    const gastos = num(x.gastos);
    return { period: isoDate(x.period as string | Date), income, gastos, sobrante: income - gastos };
  });
}

export type Slice = { category: string; spent: number };

/** Gasto por categoría del mes (solo las que tienen gasto > 0). */
export async function getCategoryBreakdown(period: string): Promise<Slice[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT c.name AS category, COALESCE(SUM(t.amount),0) AS spent
       FROM category c
       LEFT JOIN transaction t ON t.category_id = c.id AND t.period = $1 AND t.household_id = $2
      WHERE c.active AND c.household_id = $2
      GROUP BY c.name HAVING COALESCE(SUM(t.amount),0) > 0
      ORDER BY spent DESC`,
    [period, hid],
  );
  return r.rows.map((x) => ({ category: String(x.category), spent: num(x.spent) }));
}

export type FixedExpenseAdmin = {
  id: number;
  name: string;
  categoryId: number;
  category: string;
  amount: number;
  ownerId: number | null;
  startPeriod: string;
  endPeriod: string | null;
  active: boolean;
};
/** Gastos recurrentes (para configurar). Oculta los que ya terminaron. */
export async function getFixedExpensesAll(): Promise<FixedExpenseAdmin[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT f.id, f.name, f.category_id, c.name AS category, f.amount, f.default_owner_id,
            f.start_period, f.end_period, f.active
       FROM fixed_expense f JOIN category c ON c.id = f.category_id
      WHERE f.household_id = $1
        AND (f.end_period IS NULL OR f.end_period >= date_trunc('month', CURRENT_DATE)::date)
      ORDER BY c.name, f.name`,
    [hid],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    categoryId: Number(x.category_id),
    category: String(x.category),
    amount: num(x.amount),
    ownerId: x.default_owner_id != null ? Number(x.default_owner_id) : null,
    startPeriod: isoDate(x.start_period as string | Date),
    endPeriod: x.end_period != null ? isoDate(x.end_period as string | Date) : null,
    active: Boolean(x.active),
  }));
}

// --------------------------- Hogar / miembros ---------------------------
export type HouseholdInfo = {
  id: number;
  name: string;
  inviteCode: string | null;
  splitMode: "individual" | "shared";
  defaultSplit: "equal" | "percent";
};
export async function getHousehold(): Promise<HouseholdInfo> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT id, name, invite_code, split_mode, default_split FROM household WHERE id = $1`,
    [hid],
  );
  const x = r.rows[0];
  return {
    id: Number(x.id),
    name: String(x.name),
    inviteCode: x.invite_code ? String(x.invite_code) : null,
    splitMode: x.split_mode as "individual" | "shared",
    defaultSplit: x.default_split as "equal" | "percent",
  };
}

export type Member = {
  personId: number;
  person: string;
  pct: number | null;
  userName: string | null;
  email: string | null;
};
export async function getMembers(): Promise<Member[]> {
  const db = await getDb();
  const hid = await getHouseholdId();
  const r = await db.query<Record<string, unknown>>(
    `SELECT p.id AS person_id, p.name AS person, p.default_pct, u.name AS user_name, u.email
       FROM person p
       LEFT JOIN app_user u ON u.person_id = p.id
      WHERE p.household_id = $1 AND p.active
      ORDER BY p.id`,
    [hid],
  );
  return r.rows.map((x) => ({
    personId: Number(x.person_id),
    person: String(x.person),
    pct: x.default_pct != null ? num(x.default_pct) : null,
    userName: x.user_name ? String(x.user_name) : null,
    email: x.email ? String(x.email) : null,
  }));
}
