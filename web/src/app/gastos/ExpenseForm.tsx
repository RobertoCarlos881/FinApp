"use client";

import { useState } from "react";
import type { Option } from "@/lib/queries";

type Account = Option & { person: string };

export type ExpenseInitial = {
  date: string;
  categoryId: number;
  accountId: number | null;
  amount: number;
  description: string | null;
  ownerMode: string; // id de persona (string) o "split"
  splits: { personId: number; amount: number }[];
};

export default function ExpenseForm({
  categories,
  accounts,
  people,
  splitMode = "individual",
  defaultSplit = "equal",
  action,
  initial,
  defaultDate,
  submitLabel,
  resetOnSubmit = false,
}: {
  categories: Option[];
  accounts: Account[];
  people: Option[];
  splitMode?: "individual" | "shared";
  defaultSplit?: "equal" | "percent";
  action: (fd: FormData) => Promise<void>;
  initial?: ExpenseInitial;
  defaultDate?: string;
  submitLabel: string;
  resetOnSubmit?: boolean;
}) {
  const first = people[0];
  const [owner, setOwner] = useState<string>(initial?.ownerMode ?? (first ? String(first.id) : ""));

  const splitOf = (pid: number) =>
    initial?.splits.find((s) => s.personId === pid)?.amount ?? "";
  const placeholderFor = (p: Option) =>
    defaultSplit === "percent" && p.pct != null ? `${p.pct}%` : "equitativo";

  const canSplit = splitMode === "shared" && people.length >= 2;
  const options = [
    ...people.map((p) => ({ value: String(p.id), label: p.name })),
    ...(canSplit ? [{ value: "split", label: "Dividir" }] : []),
  ];

  return (
    <form
      id="expense-form"
      action={async (fd) => {
        await action(fd);
        if (resetOnSubmit) {
          (document.getElementById("expense-form") as HTMLFormElement)?.reset();
          setOwner(first ? String(first.id) : "");
        }
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <Field label="Fecha">
        <input type="date" name="date" defaultValue={initial?.date ?? defaultDate} required className={inputCls} />
      </Field>
      <Field label="Monto">
        <input type="number" name="amount" step="0.01" min="0" placeholder="0.00"
          defaultValue={initial?.amount ?? ""} required className={inputCls} />
      </Field>
      <Field label="Categoría">
        <select name="categoryId" defaultValue={initial?.categoryId} required className={inputCls}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Con qué se pagó (opcional)">
        <select name="accountId" defaultValue={initial?.accountId ?? ""} className={inputCls}>
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.person})</option>
          ))}
        </select>
      </Field>
      <Field label="Descripción" full>
        <input type="text" name="description" defaultValue={initial?.description ?? ""} placeholder="Ej. Despensa" className={inputCls} />
      </Field>

      {/* Dueño */}
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-zinc-500">¿Quién lo lleva?</span>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                owner === o.value
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              <input type="radio" name="owner" value={o.value} checked={owner === o.value}
                onChange={() => setOwner(o.value)} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
        {owner === "split" && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <p className="text-xs text-zinc-400 sm:col-span-2">
              Cuánto le toca a cada quien (deja vacío para repartir en partes iguales):
            </p>
            {people.map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{p.name}</span>
                <input type="number" step="0.01" min="0" name={`split_${p.id}`}
                  defaultValue={splitOf(p.id)} placeholder={placeholderFor(p)}
                  className={`${inputCls} max-w-32`} />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="sm:col-span-2">
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
