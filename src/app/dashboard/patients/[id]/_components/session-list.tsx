import React from "react";
import { Clock, Download, Calendar, X, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, formatCurrency, SESSION_STATUS } from "@/lib/constants";
import type { Session } from "@/types/database";

interface SessionListProps {
  sessions: Session[];
  scheduledOnlySessions: Session[];
  isExportingPdf: boolean;
  handleExportSessions: () => Promise<void>;
  setRescheduleSession: (session: Session | null) => void;
  setRescheduleDate: (date: string) => void;
  setRescheduleTime: (time: string) => void;
  setShowRescheduleModal: (show: boolean) => void;
  setCancellingSession: (session: Session | null) => void;
  setShowCancelSeriesModal: (show: boolean) => void;
}

export function SessionList({
  sessions,
  scheduledOnlySessions,
  isExportingPdf,
  handleExportSessions,
  setRescheduleSession,
  setRescheduleDate,
  setRescheduleTime,
  setShowRescheduleModal,
  setCancellingSession,
  setShowCancelSeriesModal,
}: SessionListProps) {
  return (
    <>
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportSessions}
          disabled={isExportingPdf || sessions.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Sessões (PDF)
        </Button>
      </div>

      {scheduledOnlySessions.length === 0 ? (
        <Card className="border shadow-none">
          <CardContent className="py-12 text-center">
            <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma sessão agendada.</p>
          </CardContent>
        </Card>
      ) : (
        scheduledOnlySessions.map((session: Session) => {
          const statusCfg = SESSION_STATUS[session.status as keyof typeof SESSION_STATUS] || SESSION_STATUS.scheduled;
          return (
            <Card key={session.id} className="border shadow-none">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {formatDate(session.scheduled_at, {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                      <span className="text-sm text-muted-foreground">
                        {formatTime(session.scheduled_at)}
                      </span>
                      <Badge className={cn("text-[10px] h-5", statusCfg.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1", statusCfg.dot)} />
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {session.duration_minutes} min · {session.session_type}
                      {session.session_price && ` · ${formatCurrency(session.session_price)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-primary border-primary/20 hover:bg-primary/5"
                      onClick={() => {
                        setRescheduleSession(session);
                        const date = new Date(session.scheduled_at);
                        setRescheduleDate(date.toISOString().split('T')[0]);
                        setRescheduleTime(date.toTimeString().slice(0, 5));
                        setShowRescheduleModal(true);
                      }}
                    >
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      Remarcar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setCancellingSession(session);
                        setShowCancelSeriesModal(true);
                      }}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </>
  );
}
