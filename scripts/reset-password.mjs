/**
 * Sets (or resets) a self-hosted account password and ensures the account exists.
 *
 * There is no email service in this deployment, so an administrator resets a
 * forgotten password on the server:
 *
 *     cd /opt/oa-agent
 *     DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-) \
 *       node scripts/reset-password.mjs user@example.com 'new-password'
 *
 * The hash format matches `apps/web/lib/local-auth.ts`:
 * scrypt$<salt hex>$<hash hex>, N=16384, r=8, p=1, 64-byte key.
 */
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("usage: node scripts/reset-password.mjs <email> <password>");
if (password.length < 8) throw new Error("password must be at least 8 characters");

const databaseUrl = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function hashPassword(value) {
  const salt = randomBytes(16);
  const derived = scryptSync(value.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const normalized = email.trim().toLowerCase();
  const rows = await sql`
    INSERT INTO app_users (identity_user_id, email)
    VALUES (${`local:${normalized}`}, ${normalized})
    ON CONFLICT (identity_user_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
    RETURNING id, email, role`;
  const user = rows[0];
  await sql`
    INSERT INTO user_credentials (user_id, password_hash)
    VALUES (${user.id}, ${hashPassword(password)})
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`;
  // Old sessions must not survive a password reset.
  await sql`DELETE FROM user_sessions WHERE user_id = ${user.id}`;
  console.log(`password set for ${user.email} (role ${user.role}, id ${user.id}); existing sessions revoked`);
} finally {
  await sql.end();
}
