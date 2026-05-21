import { NextResponse } from "next/server";
import { logSafeError } from "@/lib/errors/safe-error";

export async function POST(req: Request) {
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  const authToken = req.headers.get("asaas-access-token");

  if (!webhookToken || authToken !== webhookToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // SaaS billing foundation phase: keep the legacy endpoint safe and inert.
  // It acknowledges trusted Asaas calls but does not mutate subscription state.
  logSafeError("[webhooks] Legacy Asaas webhook ignored", "asaas_webhook_disabled");

  return NextResponse.json({
    received: true,
    ignored: true,
    reason: "platform_billing_not_active",
  });
}
