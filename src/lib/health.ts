export type HealthPayload = {
  status: "ok";
  app: "nythos";
  timestamp: string;
  version?: string;
  build?: string;
};

type HealthEnv = {
  [key: string]: string | undefined;
  NEXT_PUBLIC_APP_VERSION?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  NEXT_PUBLIC_BUILD_ID?: string;
};

export function createHealthPayload(
  now: Date = new Date(),
  env: HealthEnv = process.env
): HealthPayload {
  const payload: HealthPayload = {
    status: "ok",
    app: "nythos",
    timestamp: now.toISOString(),
  };

  if (env.NEXT_PUBLIC_APP_VERSION) {
    payload.version = env.NEXT_PUBLIC_APP_VERSION;
  }

  if (env.NEXT_PUBLIC_BUILD_ID) {
    payload.build = env.NEXT_PUBLIC_BUILD_ID;
  } else if (env.VERCEL_GIT_COMMIT_SHA) {
    payload.build = env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  }

  return payload;
}
