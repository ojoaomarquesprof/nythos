import { NextResponse } from "next/server";
import { logSafeError } from "@/lib/errors/safe-error";

export async function POST() {
  logSafeError("[checkout] Disabled billing endpoint called", "checkout_disabled");

  return NextResponse.json(
    {
      error: "Checkout da plataforma ainda nao esta ativo.",
      code: "checkout_disabled",
    },
    { status: 503 }
  );
}
