import { StatsCards } from "@/components/dashboard/stats-cards";
import { UpcomingSessions } from "@/components/dashboard/upcoming-sessions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { DashboardWorklist } from "@/components/dashboard/dashboard-worklist";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:gap-5 md:px-6 md:py-5">
      <DashboardHero />

      <OnboardingCard />

      <StatsCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] md:gap-5">
        <UpcomingSessions />
        <div className="space-y-4 md:space-y-5">
          <DashboardWorklist />
          <CashFlowChart />
        </div>
      </div>

      <RecentActivity />
    </div>
  );
}
