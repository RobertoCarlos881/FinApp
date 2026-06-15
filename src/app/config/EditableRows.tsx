"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryAdmin,
  AccountAdmin,
  SourceAdmin,
  InstallmentAdmin,
  FixedExpenseAdmin,
  Option,
} from "@/lib/queries";

const inp =
  "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
const btn = "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700";
const btnGhost =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300";
const link = "text-xs font-medium text-blue-600 transition hover:text-blue-700";
const del = "text-xs text-zinc-400 transition hover:text-rose-600";
const rowCls = "flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800";

const MODES: Record<string, string> = {
  cap: "Tope (se descuenta)",
  planned: "Planeado (suma de partidas)",
  tracking: "Seguimiento (sin tope)",
};
const KINDS: Record<string, string> = { credit_card: "Crédito", debit: "Débito", cash: "Efectivo" };
const FREQS: Record<string, string> = { weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual" };
const BASES: Record<string, string> = { per_payment: "por pago", monthly: "total del mes" };
const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const monthShort = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m - 1]} ${y}`;
};

type Act = (fd: FormData) => Promise<void>;

// ----------------------------- Categoría -----------------------------
export function CategoryRow({ c, action }: { c: CategoryAdmin; action: Act }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  if (!editing)
    return (
      <div className={`${rowCls} justify-between`}>
        <span className="text-sm">
          <b>{c.name}</b>{" "}
          <span className="text-xs text-zinc-400">
            · {MODES[c.budgetMode]}
            {c.active ? "" : " · inactiva"}
          </span>
        </span>
        <button onClick={() => setEditing(true)} className={link}>Editar</button>
      </div>
    );
  return (
    <form action={async (fd) => { await action(fd); setEditing(false); router.refresh(); }} className={`${rowCls} col-span-full`}>
      <input type="hidden" name="id" value={c.id} />
      <input name="name" defaultValue={c.name} className={`${inp} flex-1 min-w-32`} />
      <select name="budgetMode" defaultValue={c.budgetMode} className={inp}>
        {Object.entries(MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-zinc-500">
        <input type="checkbox" name="active" defaultChecked={c.active} /> Activa
      </label>
      <button className={btn}>Guardar</button>
      <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancelar</button>
    </form>
  );
}

// ----------------------------- Cuenta / tarjeta -----------------------------
export function AccountRow({ a, people, action }: { a: AccountAdmin; people: Option[]; action: Act }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  if (!editing)
    return (
      <div className={`${rowCls} justify-between`}>
        <span className="text-sm">
          <b>{a.name}</b>{" "}
          <span className="text-xs text-zinc-400">
            · {a.bank ?? "—"} · {a.person} · {KINDS[a.kind]}
            {a.cutoffDay ? ` · corte ${a.cutoffDay}` : ""}
            {a.active ? "" : " · inactiva"}
          </span>
        </span>
        <button onClick={() => setEditing(true)} className={link}>Editar</button>
      </div>
    );
  return (
    <form action={async (fd) => { await action(fd); setEditing(false); router.refresh(); }} className={`${rowCls} col-span-full`}>
      <input type="hidden" name="id" value={a.id} />
      <select name="personId" defaultValue={a.personId} className={inp}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="name" defaultValue={a.name} className={`${inp} flex-1 min-w-28`} />
      <input name="bank" defaultValue={a.bank ?? ""} placeholder="Banco" className={`${inp} w-28`} />
      <select name="kind" defaultValue={a.kind} className={inp}>
        {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="cutoffDay" type="number" min="1" max="31" defaultValue={a.cutoffDay ?? ""} placeholder="Corte" className={`${inp} w-20`} />
      <label className="flex items-center gap-1.5 text-sm text-zinc-500">
        <input type="checkbox" name="active" defaultChecked={a.active} /> Activa
      </label>
      <button className={btn}>Guardar</button>
      <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancelar</button>
    </form>
  );
}

// ----------------------------- Trabajo / ingreso -----------------------------
export function SourceRow({ s, people, action }: { s: SourceAdmin; people: Option[]; action: Act }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  if (!editing)
    return (
      <div className={`${rowCls} justify-between`}>
        <span className="text-sm">
          <b>{s.name}</b>{" "}
          <span className="text-xs text-zinc-400">
            · {s.person} · {FREQS[s.frequency]} · {money(s.expected)} {BASES[s.basis]}
            {s.active ? "" : " · inactivo"}
          </span>
        </span>
        <button onClick={() => setEditing(true)} className={link}>Editar</button>
      </div>
    );
  return (
    <form action={async (fd) => { await action(fd); setEditing(false); router.refresh(); }} className={`${rowCls} col-span-full`}>
      <input type="hidden" name="id" value={s.id} />
      <select name="personId" defaultValue={s.personId} className={inp}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="name" defaultValue={s.name} className={`${inp} flex-1 min-w-28`} />
      <select name="frequency" defaultValue={s.frequency} className={inp}>
        {Object.entries(FREQS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="expected" type="number" step="0.01" min="0" defaultValue={s.expected} className={`${inp} w-24`} />
      <select name="basis" defaultValue={s.basis} className={inp}>
        {Object.entries(BASES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-zinc-500">
        <input type="checkbox" name="active" defaultChecked={s.active} /> Activo
      </label>
      <button className={btn}>Guardar</button>
      <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancelar</button>
    </form>
  );
}

// ----------------------------- Gasto recurrente -----------------------------
export function FixedExpenseRow({
  f,
  categories,
  people,
  action,
  onDelete,
}: {
  f: FixedExpenseAdmin;
  categories: Option[];
  people: Option[];
  action: Act;
  onDelete: Act;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const owner = people.find((p) => p.id === f.ownerId)?.name;
  if (!editing)
    return (
      <div className={`${rowCls} justify-between`}>
        <span className="text-sm">
          <b>{f.name}</b>{" "}
          <span className="text-xs text-zinc-400">
            · {f.category} · {money(f.amount)}/mes{owner ? ` · ${owner}` : " · dividido"}
            {f.active ? "" : " · inactivo"}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(true)} className={link}>Editar</button>
          <form action={onDelete}>
            <input type="hidden" name="id" value={f.id} />
            <button className={del}>Borrar</button>
          </form>
        </div>
      </div>
    );
  return (
    <form action={async (fd) => { await action(fd); setEditing(false); router.refresh(); }} className={`${rowCls} col-span-full`}>
      <input type="hidden" name="id" value={f.id} />
      <input name="name" defaultValue={f.name} className={`${inp} flex-1 min-w-28`} />
      <select name="categoryId" defaultValue={f.categoryId} className={inp}>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input name="amount" type="number" step="0.01" min="0" defaultValue={f.amount} className={`${inp} w-24`} />
      <select name="ownerId" defaultValue={f.ownerId ?? ""} className={inp} title="Dueño (vacío = dividido)">
        <option value="">Dividido</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="startPeriod" type="month" defaultValue={f.startPeriod.slice(0, 7)} className={inp} title="Desde" />
      <input name="endPeriod" type="month" defaultValue={f.endPeriod?.slice(0, 7) ?? ""} className={inp} title="Hasta (opcional)" />
      <label className="flex items-center gap-1.5 text-sm text-zinc-500">
        <input type="checkbox" name="active" defaultChecked={f.active} /> Activo
      </label>
      <button className={btn}>Guardar</button>
      <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancelar</button>
    </form>
  );
}

// ----------------------------- Meses sin intereses -----------------------------
export function InstallmentRow({
  m,
  people,
  action,
  onDelete,
}: {
  m: InstallmentAdmin;
  people: Option[];
  action: Act;
  onDelete: Act;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const owner = people.find((p) => p.id === m.ownerId)?.name;
  if (!editing)
    return (
      <div className={`${rowCls} justify-between`}>
        <span className="text-sm">
          <b>{m.name}</b>{" "}
          <span className="text-xs text-zinc-400">
            · {money(m.monthly)}/mes · termina {monthShort(m.endPeriod)}
            {owner ? ` · ${owner}` : ""}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(true)} className={link}>Editar</button>
          <form action={onDelete}>
            <input type="hidden" name="id" value={m.id} />
            <button className={del}>Borrar</button>
          </form>
        </div>
      </div>
    );
  return (
    <form action={async (fd) => { await action(fd); setEditing(false); router.refresh(); }} className={`${rowCls} col-span-full`}>
      <input type="hidden" name="id" value={m.id} />
      <input name="name" defaultValue={m.name} className={`${inp} flex-1 min-w-28`} />
      <input name="monthly" type="number" step="0.01" min="0" defaultValue={m.monthly} className={`${inp} w-24`} />
      <input name="firstPeriod" type="month" defaultValue={m.firstPeriod.slice(0, 7)} className={inp} />
      <input name="endPeriod" type="month" defaultValue={m.endPeriod.slice(0, 7)} className={inp} />
      <select name="ownerId" defaultValue={m.ownerId ?? ""} className={inp}>
        <option value="">—</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className={btn}>Guardar</button>
      <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancelar</button>
    </form>
  );
}
