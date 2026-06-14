"use server";

import { getDb } from "@/db/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, getHouseholdId, newInviteCode } from "@/lib/auth";

const round2 = (n: number) => Math.round(n * 100) / 100;
const periodOf = (isoDate: string) => `${isoDate.slice(0, 7)}-01`;

/**
 * Mes contable (de pago) de un gasto. Para tarjeta de CRÉDITO, el gasto cae en
 * el mes en que se PAGA, según la fecha de corte vigente: si la compra fue antes
 * o en el día de corte, se paga el mes siguiente; si fue después, el subsiguiente.
 * Débito/efectivo (o sin tarjeta) = el mes de la compra.
 */
async function billingPeriod(
  db: Awaited<ReturnType<typeof getDb>>,
  hid: number,
  accountId: number | null,
  date: string,
): Promise<string> {
  if (!accountId) return periodOf(date);
  const r = await db.query<{ kind: string; cutoff_day: number | null; hist: number | null }>(
    `SELECT a.kind, a.cutoff_day,
            (SELECT cutoff_day FROM account_cutoff WHERE account_id = a.id AND effective_from <= $2::date
              ORDER BY effective_from DESC LIMIT 1) AS hist
       FROM account a WHERE a.id = $1 AND a.household_id = $3`,
    [accountId, date, hid],
  );
  const row = r.rows[0];
  if (!row || row.kind !== "credit_card") return periodOf(date);
  const cutoff = row.hist != null ? Number(row.hist) : row.cutoff_day != null ? Number(row.cutoff_day) : null;
  if (cutoff == null) return periodOf(date);
  const [y, m, d] = date.split("-").map(Number);
  let month = m + (d <= cutoff ? 1 : 2);
  let year = y;
  while (month > 12) { month -= 12; year += 1; }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Divisiones (personId, monto) según el dueño elegido.
 *   owner = "<personId>" -> 100% de esa persona
 *   owner = "split"      -> campos split_<personId> con montos. Si vienen TODOS
 *     vacíos, se usa el reparto por defecto del hogar (equitativo o por %). Si
 *     vienen algunos, esos se respetan y el resto se reparte equitativo entre los
 *     que quedaron en blanco.
 */
async function computeSplits(
  owner: string,
  amount: number,
  formData: FormData,
): Promise<Array<[number, number]>> {
  if (owner !== "split") return [[Number(owner), amount]];

  const db = await getDb();
  const hid = await getHouseholdId();
  const persons = (
    await db.query<{ id: number; default_pct: string | null }>(
      "SELECT id, default_pct FROM person WHERE household_id = $1 AND active ORDER BY id",
      [hid],
    )
  ).rows.map((r) => ({ id: Number(r.id), pct: r.default_pct != null ? Number(r.default_pct) : null }));
  const hh = await db.query<{ default_split: string }>(
    "SELECT default_split FROM household WHERE id = $1",
    [hid],
  );
  const defaultSplit = hh.rows[0]?.default_split ?? "equal";

  const provided = new Map<number, number>();
  for (const [k, v] of formData.entries()) {
    const m = /^split_(\d+)$/.exec(k);
    if (m && String(v).trim() !== "") {
      const pid = Number(m[1]);
      const amt = round2(Number(v));
      if (persons.some((p) => p.id === pid) && amt >= 0) provided.set(pid, amt);
    }
  }

  // Caso 1: el usuario escribió montos -> respetarlos; el resto, equitativo.
  if (provided.size > 0) {
    const blanks = persons.filter((p) => !provided.has(p.id));
    const used = [...provided.values()].reduce((s, n) => s + n, 0);
    const rest = Math.max(0, round2(amount - used));
    const per = blanks.length ? round2(rest / blanks.length) : 0;
    return persons.map((p, i) => [
      p.id,
      provided.has(p.id)
        ? provided.get(p.id)!
        : i === persons.length - 1 && !provided.has(p.id)
          ? round2(rest - per * (blanks.length - 1))
          : per,
    ]);
  }

  // Caso 2: nada escrito -> reparto por defecto del hogar.
  if (defaultSplit === "percent" && persons.some((p) => p.pct != null)) {
    const splits = persons.map((p) => round2((amount * (p.pct ?? 0)) / 100));
    const diff = round2(amount - splits.reduce((s, n) => s + n, 0));
    splits[splits.length - 1] = round2(splits[splits.length - 1] + diff); // ajusta centavos
    return persons.map((p, i) => [p.id, splits[i]]);
  }
  const per = round2(amount / persons.length);
  return persons.map((p, i) => [
    p.id,
    i === persons.length - 1 ? round2(amount - per * (persons.length - 1)) : per,
  ]);
}

/** Configura el modo de gastos del hogar y los % por miembro. */
export async function updateHouseholdSplit(formData: FormData) {
  const hid = await getHouseholdId();
  const splitMode = String(formData.get("splitMode")) === "shared" ? "shared" : "individual";
  const defaultSplit = String(formData.get("defaultSplit")) === "percent" ? "percent" : "equal";
  const db = await getDb();
  await db.query(`UPDATE household SET split_mode = $2, default_split = $3 WHERE id = $1`, [
    hid,
    splitMode,
    defaultSplit,
  ]);
  for (const [k, v] of formData.entries()) {
    const m = /^pct_(\d+)$/.exec(k);
    if (!m) continue;
    const pid = Number(m[1]);
    const pct = String(v).trim() === "" ? null : round2(Number(v));
    await db.query(`UPDATE person SET default_pct = $3 WHERE id = $1 AND household_id = $2`, [
      pid,
      hid,
      pct,
    ]);
  }
  revalidatePath("/hogar");
  revalidatePath("/gastos");
}

// ----------------------------- Gastos -----------------------------
export async function addExpense(formData: FormData) {
  const hid = await getHouseholdId();
  const date = String(formData.get("date") || "");
  const categoryId = Number(formData.get("categoryId"));
  const accountRaw = formData.get("accountId");
  const accountId = accountRaw ? Number(accountRaw) : null;
  const amount = round2(Number(formData.get("amount")));
  const description = String(formData.get("description") || "").trim() || null;
  const owner = String(formData.get("owner") || "");
  if (!date || !categoryId || !(amount > 0) || !owner) {
    throw new Error("Faltan datos del gasto (fecha, categoría, monto o dueño).");
  }
  const db = await getDb();
  const splits = await computeSplits(owner, amount, formData);
  const period = await billingPeriod(db, hid, accountId, date);

  const ins = await db.query<{ id: number }>(
    `INSERT INTO transaction (household_id, date, period, category_id, account_id, amount, description)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE EXISTS (SELECT 1 FROM category WHERE id = $4 AND household_id = $1)
     RETURNING id`,
    [hid, date, period, categoryId, accountId, amount, description],
  );
  if (ins.rows.length === 0) throw new Error("Categoría inválida.");
  const txId = ins.rows[0].id;
  for (const [personId, amt] of splits) {
    if (amt > 0) {
      await db.query(
        `INSERT INTO transaction_split (transaction_id, person_id, amount) VALUES ($1, $2, $3)`,
        [txId, personId, amt],
      );
    }
  }
  revalidatePath("/");
  revalidatePath("/gastos");
}

export async function updateExpense(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const date = String(formData.get("date") || "");
  const categoryId = Number(formData.get("categoryId"));
  const accountRaw = formData.get("accountId");
  const accountId = accountRaw ? Number(accountRaw) : null;
  const amount = round2(Number(formData.get("amount")));
  const description = String(formData.get("description") || "").trim() || null;
  const owner = String(formData.get("owner") || "");
  if (!id || !date || !categoryId || !(amount > 0) || !owner) {
    throw new Error("Faltan datos del gasto.");
  }
  const db = await getDb();
  const splits = await computeSplits(owner, amount, formData);

  // Verifica que el gasto sea de ESTE hogar antes de tocarlo.
  const own = await db.query(
    `SELECT 1 FROM transaction WHERE id = $1 AND household_id = $2`,
    [id, hid],
  );
  if (own.rows.length === 0) throw new Error("Gasto no encontrado.");

  const period = await billingPeriod(db, hid, accountId, date);
  await db.query(
    `UPDATE transaction
        SET date = $3, period = $4, category_id = $5, account_id = $6, amount = $7, description = $8
      WHERE id = $1 AND household_id = $2`,
    [id, hid, date, period, categoryId, accountId, amount, description],
  );
  await db.query(`DELETE FROM transaction_split WHERE transaction_id = $1`, [id]);
  for (const [personId, amt] of splits) {
    if (amt > 0) {
      await db.query(
        `INSERT INTO transaction_split (transaction_id, person_id, amount) VALUES ($1, $2, $3)`,
        [id, personId, amt],
      );
    }
  }
  revalidatePath("/");
  revalidatePath("/gastos");
  redirect(`/gastos?mes=${period}`);
}

export async function deleteExpense(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  await db.query(`DELETE FROM transaction WHERE id = $1 AND household_id = $2`, [id, hid]);
  revalidatePath("/");
  revalidatePath("/gastos");
}

// ----------------------------- Presupuesto / ingresos -----------------------------
export async function saveBudgets(formData: FormData) {
  const hid = await getHouseholdId();
  const period = String(formData.get("period") || "");
  if (!period) return;
  const db = await getDb();
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("cat_")) continue;
    const categoryId = Number(k.slice(4));
    const amount = round2(Number(v) || 0);
    await db.query(
      `INSERT INTO budget (household_id, category_id, period, amount)
       SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM category WHERE id = $2 AND household_id = $1)
       ON CONFLICT (category_id, period) DO UPDATE SET amount = EXCLUDED.amount`,
      [hid, categoryId, period, amount],
    );
  }
  revalidatePath("/");
  revalidatePath("/mes");
}

export async function saveIncomes(formData: FormData) {
  const hid = await getHouseholdId();
  const period = String(formData.get("period") || "");
  if (!period) return;
  const db = await getDb();
  for (const [k, v] of formData.entries()) {
    const m = /^src_(\d+)_s(\d+)$/.exec(k);
    if (!m) continue;
    const sourceId = Number(m[1]);
    const slot = Number(m[2]);
    const amount = round2(Number(v) || 0);
    await db.query(
      `INSERT INTO income (household_id, income_source_id, period, slot, amount)
       SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM income_source WHERE id = $2 AND household_id = $1)
       ON CONFLICT (income_source_id, period, slot) DO UPDATE SET amount = EXCLUDED.amount`,
      [hid, sourceId, period, slot, amount],
    );
  }
  revalidatePath("/");
  revalidatePath("/mes");
}

// ----------------------------- Catálogos -----------------------------
export async function addCategory(formData: FormData) {
  const hid = await getHouseholdId();
  const name = String(formData.get("name") || "").trim();
  const mode = String(formData.get("budgetMode") || "tracking");
  if (!name) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO category (household_id, name, budget_mode, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(max(sort_order),0)+1 FROM category WHERE household_id = $1))
     ON CONFLICT (household_id, name) DO NOTHING`,
    [hid, name, mode],
  );
  revalidatePath("/config");
}

export async function updateCategory(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const mode = String(formData.get("budgetMode") || "tracking");
  const active = formData.get("active") === "on";
  if (!id || !name) return;
  const db = await getDb();
  await db.query(
    `UPDATE category SET name = $3, budget_mode = $4, active = $5 WHERE id = $1 AND household_id = $2`,
    [id, hid, name, mode, active],
  );
  revalidatePath("/config");
}

export async function addAccount(formData: FormData) {
  const hid = await getHouseholdId();
  const personId = Number(formData.get("personId"));
  const name = String(formData.get("name") || "").trim();
  const bank = String(formData.get("bank") || "").trim() || null;
  const kind = String(formData.get("kind") || "credit_card");
  const cutoff = formData.get("cutoffDay") ? Number(formData.get("cutoffDay")) : null;
  if (!personId || !name) return;
  const db = await getDb();
  // Sin ON CONFLICT: se permiten varias tarjetas (mismo nombre/banco distinto).
  await db.query(
    `INSERT INTO account (household_id, person_id, name, bank, kind, cutoff_day)
     SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM person WHERE id = $2 AND household_id = $1)`,
    [hid, personId, name, bank, kind, cutoff],
  );
  revalidatePath("/config");
}

export async function updateAccount(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const personId = Number(formData.get("personId"));
  const name = String(formData.get("name") || "").trim();
  const bank = String(formData.get("bank") || "").trim() || null;
  const kind = String(formData.get("kind") || "credit_card");
  const cutoff = formData.get("cutoffDay") ? Number(formData.get("cutoffDay")) : null;
  const active = formData.get("active") === "on";
  if (!id || !personId || !name) return;
  const db = await getDb();
  await db.query(
    `UPDATE account SET person_id = $3, name = $4, bank = $5, kind = $6, cutoff_day = $7, active = $8
      WHERE id = $1 AND household_id = $2
        AND EXISTS (SELECT 1 FROM person WHERE id = $3 AND household_id = $2)`,
    [id, hid, personId, name, bank, kind, cutoff, active],
  );
  revalidatePath("/config");
}

const FREQS = ["weekly", "biweekly", "monthly"];
const freqOf = (v: FormDataEntryValue | null) =>
  FREQS.includes(String(v)) ? String(v) : "biweekly";
const basisOf = (v: FormDataEntryValue | null) =>
  String(v) === "monthly" ? "monthly" : "per_payment";

/** Registra un cambio de fecha de corte de una tarjeta, vigente desde un mes. */
export async function setAccountCutoff(formData: FormData) {
  const hid = await getHouseholdId();
  const accountId = Number(formData.get("accountId"));
  const from = String(formData.get("effectiveFrom") || "");
  const day = Number(formData.get("cutoffDay"));
  if (!accountId || !from || !(day >= 1 && day <= 31)) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO account_cutoff (account_id, effective_from, cutoff_day)
     SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM account WHERE id = $1 AND household_id = $4)
     ON CONFLICT (account_id, effective_from) DO UPDATE SET cutoff_day = EXCLUDED.cutoff_day`,
    [accountId, periodOf(from), day, hid],
  );
  revalidatePath("/config");
}

export async function deleteAccountCutoff(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  await db.query(
    `DELETE FROM account_cutoff
      WHERE id = $1 AND account_id IN (SELECT id FROM account WHERE household_id = $2)`,
    [id, hid],
  );
  revalidatePath("/config");
}

export async function addIncomeSource(formData: FormData) {
  const hid = await getHouseholdId();
  const personId = Number(formData.get("personId"));
  const name = String(formData.get("name") || "").trim();
  const frequency = freqOf(formData.get("frequency"));
  const basis = basisOf(formData.get("basis"));
  const expected = round2(Number(formData.get("expected")) || 0);
  if (!personId || !name) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO income_source (household_id, person_id, name, frequency, expected_basis, expected_amount)
     SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM person WHERE id = $2 AND household_id = $1)
     ON CONFLICT (household_id, person_id, name) DO NOTHING`,
    [hid, personId, name, frequency, basis, expected],
  );
  revalidatePath("/config");
}

export async function updateIncomeSource(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const personId = Number(formData.get("personId"));
  const name = String(formData.get("name") || "").trim();
  const frequency = freqOf(formData.get("frequency"));
  const basis = basisOf(formData.get("basis"));
  const expected = round2(Number(formData.get("expected")) || 0);
  const active = formData.get("active") === "on";
  if (!id || !personId || !name) return;
  const db = await getDb();
  await db.query(
    `UPDATE income_source SET person_id = $3, name = $4, frequency = $5, expected_basis = $6,
            expected_amount = $7, active = $8
      WHERE id = $1 AND household_id = $2
        AND EXISTS (SELECT 1 FROM person WHERE id = $3 AND household_id = $2)`,
    [id, hid, personId, name, frequency, basis, expected, active],
  );
  revalidatePath("/config");
}

export async function addInstallment(formData: FormData) {
  const hid = await getHouseholdId();
  const name = String(formData.get("name") || "").trim();
  const monthly = round2(Number(formData.get("monthly")) || 0);
  const first = String(formData.get("firstPeriod") || "");
  const end = String(formData.get("endPeriod") || "");
  const ownerRaw = formData.get("ownerId");
  const ownerId = ownerRaw ? Number(ownerRaw) : null;
  if (!name || !(monthly > 0) || !first || !end) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO installment_plan (household_id, category_id, name, monthly_amount, first_period, end_period, owner_id)
     VALUES ($1, (SELECT id FROM category WHERE name = 'Meses sin intereses' AND household_id = $1), $2, $3, $4, $5, $6)`,
    [hid, name, monthly, periodOf(first), periodOf(end), ownerId],
  );
  revalidatePath("/config");
}

export async function updateInstallment(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const monthly = round2(Number(formData.get("monthly")) || 0);
  const first = String(formData.get("firstPeriod") || "");
  const end = String(formData.get("endPeriod") || "");
  const ownerRaw = formData.get("ownerId");
  const ownerId = ownerRaw ? Number(ownerRaw) : null;
  if (!id || !name || !(monthly > 0) || !first || !end) return;
  const db = await getDb();
  await db.query(
    `UPDATE installment_plan SET name = $3, monthly_amount = $4, first_period = $5, end_period = $6, owner_id = $7
      WHERE id = $1 AND household_id = $2`,
    [id, hid, name, monthly, periodOf(first), periodOf(end), ownerId],
  );
  revalidatePath("/config");
}

export async function deleteInstallment(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  await db.query(`DELETE FROM installment_plan WHERE id = $1 AND household_id = $2`, [id, hid]);
  revalidatePath("/config");
}

// ----------------------------- Gastos recurrentes -----------------------------
export async function addFixedExpense(formData: FormData) {
  const hid = await getHouseholdId();
  const name = String(formData.get("name") || "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const amount = round2(Number(formData.get("amount")) || 0);
  const ownerRaw = formData.get("ownerId");
  const ownerId = ownerRaw ? Number(ownerRaw) : null;
  const start = String(formData.get("startPeriod") || "");
  const end = String(formData.get("endPeriod") || "");
  if (!name || !categoryId || !(amount > 0) || !start) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO fixed_expense (household_id, category_id, name, amount, default_owner_id, start_period, end_period)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE EXISTS (SELECT 1 FROM category WHERE id = $2 AND household_id = $1)`,
    [hid, categoryId, name, amount, ownerId, periodOf(start), end ? periodOf(end) : null],
  );
  revalidatePath("/config");
  revalidatePath("/gastos");
  revalidatePath("/");
}

export async function updateFixedExpense(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const amount = round2(Number(formData.get("amount")) || 0);
  const ownerRaw = formData.get("ownerId");
  const ownerId = ownerRaw ? Number(ownerRaw) : null;
  const start = String(formData.get("startPeriod") || "");
  const end = String(formData.get("endPeriod") || "");
  const active = formData.get("active") === "on";
  if (!id || !name || !categoryId || !(amount > 0) || !start) return;
  const db = await getDb();
  await db.query(
    `UPDATE fixed_expense SET category_id = $3, name = $4, amount = $5, default_owner_id = $6,
            start_period = $7, end_period = $8, active = $9
      WHERE id = $1 AND household_id = $2
        AND EXISTS (SELECT 1 FROM category WHERE id = $3 AND household_id = $2)`,
    [id, hid, categoryId, name, amount, ownerId, periodOf(start), end ? periodOf(end) : null, active],
  );
  revalidatePath("/config");
  revalidatePath("/gastos");
  revalidatePath("/");
}

export async function deleteFixedExpense(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  await db.query(`DELETE FROM fixed_expense WHERE id = $1 AND household_id = $2`, [id, hid]);
  revalidatePath("/config");
  revalidatePath("/gastos");
  revalidatePath("/");
}

/** Ajusta el monto de un recurrente SOLO para un mes (override). */
export async function setFixedExpenseMonth(formData: FormData) {
  const hid = await getHouseholdId();
  const fixedId = Number(formData.get("fixedId"));
  const period = String(formData.get("period") || "");
  const amount = round2(Number(formData.get("amount")) || 0);
  if (!fixedId || !period) return;
  const db = await getDb();
  // Solo si el recurrente es del hogar.
  await db.query(
    `INSERT INTO fixed_expense_month (fixed_expense_id, period, amount)
     SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM fixed_expense WHERE id = $1 AND household_id = $4)
     ON CONFLICT (fixed_expense_id, period) DO UPDATE SET amount = EXCLUDED.amount`,
    [fixedId, period, amount, hid],
  );
  revalidatePath("/gastos");
  revalidatePath("/");
}

// ----------------------------- Liquidaciones -----------------------------
export async function addSettlement(formData: FormData) {
  const hid = await getHouseholdId();
  const fromId = Number(formData.get("fromId"));
  const toId = Number(formData.get("toId"));
  const amount = round2(Number(formData.get("amount")));
  const period = String(formData.get("period") || "");
  const note = String(formData.get("note") || "").trim() || null;
  if (!fromId || !toId || fromId === toId || !(amount > 0) || !period) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO settlement (household_id, period, from_person_id, to_person_id, amount, note, settled)
     SELECT $1, $2, $3, $4, $5, $6, TRUE
      WHERE EXISTS (SELECT 1 FROM person WHERE id = $3 AND household_id = $1)
        AND EXISTS (SELECT 1 FROM person WHERE id = $4 AND household_id = $1)`,
    [hid, period, fromId, toId, amount, note],
  );
  revalidatePath("/saldos");
}

export async function deleteSettlement(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  await db.query(`DELETE FROM settlement WHERE id = $1 AND household_id = $2`, [id, hid]);
  revalidatePath("/saldos");
}

// ----------------------------- Deudas -----------------------------
export async function addDebt(formData: FormData) {
  const hid = await getHouseholdId();
  const personId = Number(formData.get("personId"));
  const direction = String(formData.get("direction")) === "receivable" ? "receivable" : "payable";
  const counterparty = String(formData.get("counterparty") || "").trim();
  const amount = round2(Number(formData.get("amount")));
  const note = String(formData.get("note") || "").trim() || null;
  if (!personId || !counterparty || !(amount > 0)) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO debt (household_id, person_id, direction, counterparty, amount, note)
     SELECT $1, $2, $3, $4, $5, $6
      WHERE EXISTS (SELECT 1 FROM person WHERE id = $2 AND household_id = $1)`,
    [hid, personId, direction, counterparty, amount, note],
  );
  revalidatePath("/saldos");
}

/** Abona a una deuda (o registra cobro). Topa en el monto total. */
export async function payDebt(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  const abono = round2(Number(formData.get("abono")));
  if (!id || !(abono > 0)) return;
  const db = await getDb();
  await db.query(
    `UPDATE debt SET paid_amount = LEAST(amount, paid_amount + $3) WHERE id = $1 AND household_id = $2`,
    [id, hid, abono],
  );
  revalidatePath("/saldos");
}

export async function deleteDebt(formData: FormData) {
  const hid = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  await db.query(`DELETE FROM debt WHERE id = $1 AND household_id = $2`, [id, hid]);
  revalidatePath("/saldos");
}

// ----------------------------- Hogar -----------------------------
export async function renameHousehold(formData: FormData) {
  const hid = await getHouseholdId();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const db = await getDb();
  await db.query(`UPDATE household SET name = $2 WHERE id = $1`, [hid, name]);
  revalidatePath("/hogar");
}

export async function regenerateInvite() {
  const hid = await getHouseholdId();
  const db = await getDb();
  await db.query(`UPDATE household SET invite_code = $2 WHERE id = $1`, [hid, newInviteCode()]);
  revalidatePath("/hogar");
}

/** El usuario en sesión se une a OTRO hogar usando un código/enlace de invitación. */
export async function joinHouseholdAction(formData: FormData) {
  const user = await requireUser();
  const code = String(formData.get("invite") || "").trim();
  if (!code) redirect("/hogar?error=" + encodeURIComponent("Ingresa un código."));
  const db = await getDb();
  const h = await db.query<{ id: number; name: string }>(
    `SELECT id, name FROM household WHERE invite_code = $1`,
    [code],
  );
  if (h.rows.length === 0) {
    redirect("/hogar?error=" + encodeURIComponent("Código de invitación inválido."));
  }
  const targetId = h.rows[0].id;
  if (targetId === user.householdId) redirect("/hogar?error=" + encodeURIComponent("Ya estás en ese hogar."));

  const p = await db.query<{ id: number }>(
    `INSERT INTO person (household_id, name) VALUES ($1, $2) RETURNING id`,
    [targetId, user.name],
  );
  await db.query(`UPDATE app_user SET household_id = $2, person_id = $3 WHERE id = $1`, [
    user.id,
    targetId,
    p.rows[0].id,
  ]);
  revalidatePath("/");
  redirect("/?mes=" + new Date().toISOString().slice(0, 7) + "-01");
}
