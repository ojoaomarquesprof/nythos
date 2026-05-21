import { describe, expect, it } from "vitest";
import { createHealthPayload } from "./health";

describe("createHealthPayload", () => {
  it("returns the minimal safe health payload", () => {
    const payload = createHealthPayload(new Date("2026-05-21T12:00:00.000Z"), {});

    expect(payload).toEqual({
      status: "ok",
      app: "nythos",
      timestamp: "2026-05-21T12:00:00.000Z",
    });
  });

  it("includes only safe public build metadata when available", () => {
    const payload = createHealthPayload(new Date("2026-05-21T12:00:00.000Z"), {
      NEXT_PUBLIC_APP_VERSION: "1.2.3",
      VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
    });

    expect(payload).toMatchObject({
      version: "1.2.3",
      build: "abcdef123456",
    });
  });
});
