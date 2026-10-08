import { ExpenseCategoryChart } from "./expense-category-chart";
import { ExpenseByBusinessTypeChart } from "./expense-by-business-type-chart";
import { KpiCards } from "./kpi-cards";
import { ProfitLossTable } from "./profit-loss-table";
import { ProfitMarginChart } from "./profit-margin-chart";
import { RevenueByGroupChart } from "./revenue-by-group-chart";
import { RevenueByBusinessTypeChart } from "./revenue-by-business-type-chart";
import { RevenueExpenseChart } from "./revenue-expense-chart";
import { getExpenseCategoryData } from "../data/expense-category";
import { getExpenseByBusinessTypeData } from "../data/expense-by-business-type";
import { getKpiData } from "../data/kpi";
import { getProfitLossData } from "../data/profit-loss";
import { getProfitMarginData } from "../data/profit-margin";
import { getRevenueByGroupData } from "../data/revenue-by-group";
import { getRevenueByBusinessTypeData } from "../data/revenue-by-business-type";
import { getRevenueExpenseData } from "../data/revenue-expense";
import type { DashboardScope } from "../data/dashboard-scope";

export function DashboardPanelLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-black/10 bg-white p-6 text-sm text-muted" role="status">
      Loading {label}...
    </div>
  );
}

export async function KpiPanel({ scope, userId }: { scope: DashboardScope; userId: string }) {
  let data;
  let error;
  try {
    data = await getKpiData(scope);
  } catch {
    error = "KPI data could not be loaded right now. Please refresh to retry.";
  }
  return <KpiCards data={data} error={error} userId={userId} />;
}

export async function RevenueExpensePanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getRevenueExpenseData(scope);
  } catch {
    error = "Financial data could not be loaded right now.";
  }
  return <RevenueExpenseChart data={data} error={error} />;
}

export async function ProfitMarginPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getProfitMarginData(scope);
  } catch {
    error = "Profit data could not be loaded right now.";
  }
  return <ProfitMarginChart data={data} error={error} />;
}

export async function RevenueByGroupPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getRevenueByGroupData(scope);
  } catch {
    error = "Product group revenue could not be loaded right now.";
  }
  return <RevenueByGroupChart data={data} error={error} />;
}

export async function RevenueByBusinessTypePanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getRevenueByBusinessTypeData(scope);
  } catch {
    error = "Business type revenue could not be loaded right now.";
  }
  return <RevenueByBusinessTypeChart data={data} error={error} />;
}

export async function ExpenseCategoryPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getExpenseCategoryData(scope);
  } catch {
    error = "Expense category data could not be loaded right now.";
  }

  return <ExpenseCategoryChart data={data} error={error} />;
}

export async function ExpenseByBusinessTypePanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getExpenseByBusinessTypeData(scope);
  } catch {
    error = "Expense business type data could not be loaded right now.";
  }
  return <ExpenseByBusinessTypeChart data={data} error={error} />;
}

export async function ProfitLossPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getProfitLossData(scope);
  } catch {
    error = "Profit and loss data could not be loaded right now.";
  }
  return <ProfitLossTable data={data} error={error} />;
}
