import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { RevenueExpenseChart } from "./components/revenue-expense-chart";
import { ProfitMarginChart } from "./components/profit-margin-chart";
import { RevenueByGroupChart } from "./components/revenue-by-group-chart";
import { ExpenseCategoryChart } from "./components/expense-category-chart";
import { ProfitLossTable } from "./components/profit-loss-table";
import { getRevenueExpenseData } from "./data/revenue-expense";
import { getProfitMarginData } from "./data/profit-margin";
import { getRevenueByGroupData } from "./data/revenue-by-group";
import { getExpenseCategoryData } from "./data/expense-category";
import { getProfitLossData } from "./data/profit-loss";
import { getKpiData } from "./data/kpi";
import { KpiCards } from "./components/kpi-cards";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route; this is defence in depth.
  if (!user) redirect("/login?next=/dashboard");

  const [
    revenueExpenseResult,
    profitMarginResult,
    revenueByGroupResult,
    expenseCategoryResult,
    profitLossResult,
    kpiResult,
  ] = await Promise.all([
    getRevenueExpenseData()
      .then((data) => ({ data, error: undefined }))
      .catch(() => ({ data: undefined, error: "Financial data could not be loaded right now." })),
    getProfitMarginData()
      .then((data) => ({ data, error: undefined }))
      .catch(() => ({ data: undefined, error: "Profit data could not be loaded right now." })),
    getRevenueByGroupData()
      .then((data) => ({ data, error: undefined }))
      .catch(() => ({ data: undefined, error: "Product group revenue could not be loaded right now." })),
    getExpenseCategoryData()
      .then((data) => ({ data, error: undefined }))
      .catch(() => ({ data: undefined, error: "Expense category data could not be loaded right now." })),
    getProfitLossData()
      .then((data) => ({ data, error: undefined }))
      .catch(() => ({ data: undefined, error: "Profit and loss data could not be loaded right now." })),
    getKpiData()
      .then((data) => ({ data, error: undefined }))
      .catch(() => ({ data: undefined, error: "KPI data could not be loaded right now. Please refresh to retry." })),
  ]);

  const chartData = revenueExpenseResult.data;
  const chartError = revenueExpenseResult.error;
  const profitMarginData = profitMarginResult.data;
  const profitMarginError = profitMarginResult.error;
  const revenueByGroupData = revenueByGroupResult.data;
  const revenueByGroupError = revenueByGroupResult.error;
  const expenseCategoryData = expenseCategoryResult.data;
  const expenseCategoryError = expenseCategoryResult.error;
  const profitLossData = profitLossResult.data;
  const profitLossError = profitLossResult.error;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4">
        <Image src="/tsh.png" alt="TSH Group" width={116} height={30} />
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-black/[.04]"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="mx-auto w-full flex-1 px-6 py-8">
        <h1 className="text-2xl font-semibold text-brand-navy">Dashboard</h1>
        <p className="mt-2 text-muted">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>


        <KpiCards data={kpiResult.data} error={kpiResult.error} userId={user.id} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="h-full">
            <RevenueExpenseChart data={chartData} error={chartError} />
          </div>
          <div className="h-full">
            <ProfitMarginChart data={profitMarginData} error={profitMarginError} />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 items-stretch gap-8">
          <div className="col-span-1 h-full">
            <RevenueByGroupChart data={revenueByGroupData} error={revenueByGroupError} />
          </div>
          <div className="lg:col-span-2 h-full">
            <ExpenseCategoryChart data={expenseCategoryData} error={expenseCategoryError} />
          </div>
        </div>

        <div className="mt-8">
          <ProfitLossTable data={profitLossData} error={profitLossError} />
        </div>
      </main>
    </div>
  );
}
