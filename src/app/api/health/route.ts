import { NextResponse } from "next/server";
import { createHealthPayload } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(createHealthPayload(), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
