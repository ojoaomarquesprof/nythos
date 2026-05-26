/**
 * scripts/fetch-schema.js
 * Fetches the database schema from Supabase and outputs column info as JSON.
 * This is used to regenerate database.ts types.
 */

async function loadEnvLocal(fs, path) {
  const envPath = path.join(__dirname, "..", ".env.local");
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#") && rest.length) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  });
}

function fetchJson(https, url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const https = await import("node:https");

  await loadEnvLocal(fs, path);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const pgMetaBase = `${supabaseUrl}/pg-meta/v0`;

  const tablesResp = await fetchJson(
    https,
    `${pgMetaBase}/tables?limit=100&schema=public`,
    "GET",
    "",
    { ...headers, "Content-Length": "0" }
  ).catch(() => null);

  if (tablesResp && Array.isArray(tablesResp)) {
    console.log(JSON.stringify({ tables: tablesResp }, null, 2));
    return;
  }

  const metaResp = await fetchJson(
    https,
    `${supabaseUrl}/rest/v1/`,
    "GET",
    "",
    { ...headers, "Content-Length": "0", Accept: "application/openapi+json" }
  ).catch(() => null);

  if (metaResp) {
    fs.writeFileSync(path.join(__dirname, "..", "schema-dump.json"), JSON.stringify(metaResp, null, 2));
    console.log("Schema saved to schema-dump.json");

    const definitions = metaResp.definitions || {};
    const tables = Object.keys(definitions);
    console.log("Tables found:", tables.join(", "));

    const result = {};
    for (const [tableName, def] of Object.entries(definitions)) {
      result[tableName] = {
        properties: def.properties || {},
        required: def.required || [],
        description: def.description || "",
      };
    }
    fs.writeFileSync(
      path.join(__dirname, "..", "schema-typed.json"),
      JSON.stringify(result, null, 2)
    );
    console.log("Typed schema saved to schema-typed.json");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
