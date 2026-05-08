/**
 * scripts/fetch-schema.js
 * Fetches the database schema from Supabase and outputs column info as JSON.
 * This is used to regenerate database.ts types.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [k, ...rest] = line.split('=');
  if (k && !k.startsWith('#') && rest.length) process.env[k.trim()] = rest.join('=').trim();
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing env vars'); process.exit(1); }

// SQL to fetch all columns with type info
const sql = `
  SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.character_maximum_length,
    c.ordinal_position
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name NOT IN ('schema_migrations')
  ORDER BY c.table_name, c.ordinal_position;
`;

// Also fetch enums
const enumSql = `
  SELECT
    t.typname AS enum_name,
    e.enumlabel AS enum_value
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  ORDER BY t.typname, e.enumsortorder;
`;

function fetchJson(url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Use Supabase's pg meta endpoint (available on all projects via service_role)
  const pgMetaBase = SUPABASE_URL.replace('supabase.co', 'supabase.co') + '/pg-meta/v0';

  // Try pg-meta tables endpoint
  const tablesResp = await fetchJson(
    `${pgMetaBase}/tables?limit=100&schema=public`,
    'GET', '', { ...headers, 'Content-Length': '0' }
  ).catch(() => null);

  if (tablesResp && Array.isArray(tablesResp)) {
    console.log(JSON.stringify({ tables: tablesResp }, null, 2));
    return;
  }

  // Fallback: try PostgREST meta endpoint
  const metaResp = await fetchJson(
    `${SUPABASE_URL}/rest/v1/`,
    'GET', '', { ...headers, 'Content-Length': '0', 'Accept': 'application/openapi+json' }
  ).catch(() => null);

  if (metaResp) {
    fs.writeFileSync(path.join(__dirname, '..', 'schema-dump.json'), JSON.stringify(metaResp, null, 2));
    console.log('Schema saved to schema-dump.json');
    
    // Extract table definitions from OpenAPI spec
    const definitions = metaResp.definitions || {};
    const tables = Object.keys(definitions);
    console.log('Tables found:', tables.join(', '));
    
    // For each table, output column info
    const result = {};
    for (const [tableName, def] of Object.entries(definitions)) {
      result[tableName] = {
        properties: def.properties || {},
        required: def.required || [],
        description: def.description || '',
      };
    }
    fs.writeFileSync(
      path.join(__dirname, '..', 'schema-typed.json'),
      JSON.stringify(result, null, 2)
    );
    console.log('Typed schema saved to schema-typed.json');
  }
}

main().catch(console.error);
