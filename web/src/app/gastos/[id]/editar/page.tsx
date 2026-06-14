import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getExpense,
  getCategoryOptions,
  getAccountOptions,
  getPersonOptions,
  getHousehold,
} from "@/lib/queries";
import { updateExpense } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import ExpenseForm from "../../ExpenseForm";

export const dynamic = "force-dynamic";

export default async function EditarGastoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const expenseId = Number(id);

  const [expense, categories, accounts, people, household] = await Promise.all([
    getExpense(expenseId),
    getCategoryOptions(),
    getAccountOptions(),
    getPersonOptions(),
    getHousehold(),
  ]);

  if (!expense) notFound();

  // updateExpense necesita el id; lo inyectamos vía un campo oculto en el form.
  const action = async (fd: FormData) => {
    "use server";
    fd.set("id", String(expenseId));
    await updateExpense(fd);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <nav className="mb-1 text-sm">
        <Link
          href={`/gastos?mes=${expense.date.slice(0, 7)}-01`}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← Gastos
        </Link>
      </nav>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Editar gasto</h1>

      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <ExpenseForm
          categories={categories}
          accounts={accounts}
          people={people}
          splitMode={household.splitMode}
          defaultSplit={household.defaultSplit}
          action={action}
          initial={expense}
          submitLabel="Guardar cambios"
        />
      </section>
    </main>
  );
}
