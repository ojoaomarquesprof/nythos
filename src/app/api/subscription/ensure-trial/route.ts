import { NextResponse } from "next/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildTrialSubscriptionInsert,
  canProvisionTrialForProfile,
} from "@/lib/subscription/trial-provisioning";

const ACCOUNT_SUBSCRIPTION_COLUMNS = [
  "id",
  "owner_user_id",
  "plan_id",
  "status",
  "trial_ends_at",
  "current_period_ends_at",
  "cancel_at_period_end",
].join(", ");

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, employer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!canProvisionTrialForProfile(profile)) {
      return NextResponse.json(
        {
          error: safeClientError("Somente o responsavel da conta pode iniciar o trial."),
          code: "trial_provision_forbidden",
        },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data: existing, error: existingError } = await adminClient
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json({
        success: true,
        created: false,
        subscription: existing,
      });
    }

    const { data: inserted, error: insertError } = await adminClient
      .from("account_subscriptions")
      .insert(buildTrialSubscriptionInsert(user.id))
      .select(ACCOUNT_SUBSCRIPTION_COLUMNS)
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      created: true,
      subscription: inserted,
    });
  } catch (error) {
    logSafeError("[subscription] Failed to ensure trial", error);
    return NextResponse.json(
      {
        error: safeClientError("Nao foi possivel preparar seu trial agora."),
        code: "trial_provision_failed",
      },
      { status: 500 }
    );
  }
}
