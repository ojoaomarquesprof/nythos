import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    received: true,
    ignored: true,
    provider: "asaas",
    reason: "legacy_asaas_webhook_deprecated",
  });
}
