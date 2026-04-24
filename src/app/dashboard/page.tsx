import { StatsCards } from "@/components/dashboard/stats-cards";
import { UpcomingSessions } from "@/components/dashboard/upcoming-sessions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 md:space-y-6 max-w-7xl mx-auto w-full">
      {/* Quick date context */}
      <div className="animate-fade-in">
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards />

      {/* Main grid: Sessions + Activity + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <UpcomingSessions />
        <div className="space-y-4 md:space-y-5">
          <CashFlowChart />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
