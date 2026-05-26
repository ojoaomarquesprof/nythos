import { beforeAll, describe, expect, it, vi } from "vitest";

type RouteHelpers = typeof import("./route");

vi.mock(
  "@/lib/supabase/admin",
  () => ({
    supabaseAdmin: {
      auth: { admin: {} },
      from: vi.fn(),
    },
  })
);

vi.mock(
  "@/lib/errors/safe-error",
  () => ({
    logSafeError: vi.fn(),
  })
);

vi.mock(
  "@/lib/validation/input",
  () => ({
    hasOnlyAllowedKeys: vi.fn(),
    isLikelyPhoneOrCpf: vi.fn(),
    isPlainObject: vi.fn(),
    isValidEmail: vi.fn(),
    isValidIsoDate: vi.fn(),
    toFiniteNumber: vi.fn(),
  })
);

describe("patients create auth reuse helpers", () => {
  let helpers: RouteHelpers;

  beforeAll(async () => {
    helpers = await import("./route");
  });

  it("detects Supabase duplicate-email auth errors", () => {
    expect(
      helpers.isEmailAlreadyRegisteredAuthError({
        name: "AuthApiError",
        message: "A user with this email address has already been registered",
      })
    ).toBe(true);

    expect(helpers.isEmailAlreadyRegisteredAuthError({ message: "Network error" })).toBe(false);
  });

  it("allows patient auth users without professional profile conflicts", () => {
    expect(
      helpers.decideAuthUserReuseForPatient(
        {
          id: "patient-auth-id",
          email: "responsavel@example.com",
          user_metadata: { user_type: "patient" },
          app_metadata: {},
        },
        []
      )
    ).toEqual({ canReuse: true });
  });

  it("blocks reuse when a professional profile is related to the auth user", () => {
    expect(
      helpers.decideAuthUserReuseForPatient(
        {
          id: "professional-auth-id",
          email: "psi@example.com",
          user_metadata: { user_type: "patient" },
          app_metadata: {},
        },
        [{ id: "professional-auth-id", email: "psi@example.com", role: "therapist" }]
      )
    ).toEqual({ canReuse: false, reason: "professional_account" });
  });

  it("blocks reuse when auth metadata indicates a professional account", () => {
    expect(
      helpers.decideAuthUserReuseForPatient(
        {
          id: "metadata-professional-id",
          email: "admin@example.com",
          user_metadata: { user_type: "admin" },
          app_metadata: {},
        },
        []
      )
    ).toEqual({ canReuse: false, reason: "professional_account" });
  });
});
