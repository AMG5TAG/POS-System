/**
 * PRODUCTION restore of merchant 4 (KPI Test Shop) from
 * backup-4-12-1781358414468.koapos.enc.
 *
 * Unlike the dev script, in prod the merchants row ALREADY EXISTS (id 4,
 * suspended) with ~13 stray data rows. So this:
 *   1. UPDATEs the merchants row (status->active, email, password) — no insert.
 *   2. DELETEs all existing scoped rows for merchant 4 (clean slate).
 *   3. INSERTs the 925 backup rows with numeric ids/FKs shifted by OFFSET.
 *   4. Verifies counts == snapshot, then COMMITs only when DO_COMMIT=1.
 * Single transaction, FK/trigger enforcement off (PK/unique/not-null still on).
 */
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import os from "os";
import path from "path";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import * as schema from "@workspace/db";
import { sql, getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

const execFileAsync = promisify(execFile);
const OFFSET = 1_000_000;
const MERCHANT_ID = 4;
const NEW_EMAIL = "admin@koastal.com.au";
const NEW_LOGIN_PASSWORD = "Koastal2026!";
const PASSWORD = process.env.BK_PASS;
const DO_COMMIT = process.env.DO_COMMIT === "1";
const OBJECT = "backup-4-12-1781358414468.koapos.enc";

// ---------- 1. download + decrypt + extract ----------
function decryptBuffer(file, password) {
  const salt = file.subarray(0, 16);
  const iv = file.subarray(16, 28);
  const tag = file.subarray(file.length - 16);
  const ct = file.subarray(28, file.length - 16);
  const key = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256");
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

async function loadSnapshot() {
  const SIDE = "http://127.0.0.1:1106";
  const client = new Storage({
    credentials: {
      audience: "replit", subject_token_type: "access_token",
      token_url: `${SIDE}/token`, type: "external_account",
      credential_source: { url: `${SIDE}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
  const [, bucketName, ...rest] = process.env.PRIVATE_OBJECT_DIR.split("/");
  const objectName = `${rest.join("/")}/uploads/${OBJECT}`;
  const [buf] = await client.bucket(bucketName).file(objectName).download();
  const tarBuf = decryptBuffer(buf, PASSWORD);
  const work = await mkdtemp(path.join(os.tmpdir(), "bk-restore-"));
  try {
    const tarPath = path.join(work, "a.tar.gz");
    await writeFile(tarPath, tarBuf);
    await execFileAsync("tar", ["-xzf", tarPath, "-C", work]);
    return JSON.parse(await readFile(path.join(work, "backup.json"), "utf8"));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- 2. discover scoped tables + FK map ----------
const EXCLUDED = new Set(["merchant_backups", "merchant_backup_configs"]);

function merchantColumnKey(table) {
  const columns = getTableColumns(table);
  if ("merchantId" in columns) return "merchantId";
  for (const fk of getTableConfig(table).foreignKeys) {
    try {
      const ref = fk.reference();
      if (getTableName(ref.foreignTable) !== "merchants") continue;
      if (ref.columns.length !== 1) continue;
      const localName = ref.columns[0].name;
      const key = Object.keys(columns).find((k) => columns[k]?.name === localName);
      if (key) return key;
    } catch { /* ignore */ }
  }
  return null;
}

function buildScoped() {
  const tables = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const name = getTableName(value);
    if (EXCLUDED.has(name)) continue;
    const mck = merchantColumnKey(value);
    if (!mck) continue;
    const columns = getTableColumns(value);
    tables.push({ name, table: value, hasId: "id" in columns, merchantColKey: mck, columns });
  }
  const names = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    t.fkCols = [];
    for (const fk of getTableConfig(t.table).foreignKeys) {
      try {
        const ref = fk.reference();
        const parent = getTableName(ref.foreignTable);
        if (ref.columns.length !== 1) continue;
        if (!names.has(parent)) continue;
        const localName = ref.columns[0].name;
        const key = Object.keys(t.columns).find((k) => t.columns[k]?.name === localName);
        if (key && key !== t.merchantColKey) t.fkCols.push(key);
      } catch { /* ignore */ }
    }
    t.dateKeys = Object.keys(t.columns).filter((k) => t.columns[k]?.dataType === "date");
  }
  return tables;
}

// ---------- 3. transform a snapshot row ----------
function transformRow(t, r) {
  const out = {};
  for (const k of Object.keys(t.columns)) if (k in r) out[k] = r[k];
  // Only shift NUMERIC ids/FKs. UUID/string keys are globally unique and left intact.
  if (t.hasId && typeof out.id === "number") out.id = out.id + OFFSET;
  for (const k of t.fkCols) if (typeof out[k] === "number") out[k] = out[k] + OFFSET;
  out[t.merchantColKey] = MERCHANT_ID;
  for (const k of t.dateKeys) {
    const v = out[k];
    if (typeof v === "string" || typeof v === "number") out[k] = new Date(v);
  }
  return out;
}

// ---------- topological order of scoped tables (parents first) ----------
// FK enforcement can't be disabled on Neon (no superuser), so deletes/inserts
// must respect FK dependencies among scoped tables. Self-references are handled
// by inserting each table in a single statement (RI checked at statement end).
function topoOrder(scoped) {
  const names = new Set(scoped.map((t) => t.name));
  const deps = new Map();
  for (const t of scoped) {
    const s = new Set();
    for (const fk of getTableConfig(t.table).foreignKeys) {
      try {
        const ref = fk.reference();
        if (ref.columns.length !== 1) continue;
        const p = getTableName(ref.foreignTable);
        if (names.has(p) && p !== t.name) s.add(p);
      } catch { /* ignore */ }
    }
    deps.set(t.name, s);
  }
  const order = [];
  const remaining = new Set(names);
  while (remaining.size) {
    let progressed = false;
    for (const n of [...remaining]) {
      let ready = true;
      for (const p of deps.get(n)) if (remaining.has(p)) { ready = false; break; }
      if (ready) { order.push(n); remaining.delete(n); progressed = true; }
    }
    if (!progressed) throw new Error("FK cycle among scoped tables: " + [...remaining].join(", "));
  }
  return order; // parents-first
}

// ---------- main ----------
const snapshot = await loadSnapshot();
if (snapshot.merchantId !== MERCHANT_ID) throw new Error(`snapshot merchantId=${snapshot.merchantId}, expected ${MERCHANT_ID}`);
console.log(`snapshot ok: merchantId=${snapshot.merchantId} schemaVersion=${snapshot.schemaVersion} exportedAt=${snapshot.exportedAt}`);

const scoped = buildScoped();
const scopedByName = new Map(scoped.map((t) => [t.name, t]));
const insertOrder = topoOrder(scoped);          // parents first
const deleteOrder = [...insertOrder].reverse();  // children first
const passwordHash = await bcrypt.hash(NEW_LOGIN_PASSWORD, 10);

let inserted = 0, deleted = 0;
const perTable = {};
try {
  await db.transaction(async (tx) => {
    // 3a. confirm the merchants row exists (prod expectation).
    const exist = await tx.execute(sql.raw(`SELECT id, status, email FROM merchants WHERE id = ${MERCHANT_ID}`));
    const erow = exist.rows?.[0] ?? exist[0];
    if (!erow) throw new Error(`merchant ${MERCHANT_ID} does not exist in this DB — wrong script (use the insert version).`);
    console.log(`existing merchants row: status=${erow.status} email=${erow.email}`);

    // 3b. clean slate — delete every existing scoped row for merchant 4, in
    // children-first order so live FK constraints are never violated.
    for (const name of deleteOrder) {
      const t = scopedByName.get(name);
      const colName = t.columns[t.merchantColKey].name;
      const res = await tx.execute(sql.raw(`DELETE FROM "${name}" WHERE "${colName}" = ${MERCHANT_ID}`));
      const n = res.rowCount ?? 0;
      if (n) { deleted += n; console.log(`  deleted ${String(n).padStart(4)} from ${name}`); }
    }
    console.log(`total stray rows deleted: ${deleted}`);

    // 3c. reactivate + fix the merchants account.
    await tx.execute(sql.raw(
      `UPDATE merchants SET status='active', email='${NEW_EMAIL}', password_hash='${passwordHash}', email_verified_at=now(), updated_at=now() WHERE id = ${MERCHANT_ID}`
    ));

    // 3d. insert snapshot tables in parents-first order; one statement per table
    // (CHUNK > largest table) so within-table self-references resolve.
    const CHUNK = 2000;
    for (const name of insertOrder) {
      const t = scopedByName.get(name);
      const rows = snapshot.tables[name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const values = rows.map((r) => transformRow(t, r));
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(t.table).values(values.slice(i, i + CHUNK));
      }
      perTable[name] = rows.length;
      inserted += rows.length;
    }
    // warn about any snapshot table no longer in current scope
    for (const name of Object.keys(snapshot.tables)) {
      const rows = snapshot.tables[name];
      if (!scopedByName.has(name) && Array.isArray(rows) && rows.length) {
        console.warn(`! snapshot table not in current scope, skipped: ${name} (${rows.length})`);
      }
    }

    // 3e. verify row counts under merchant 4 match the snapshot, inside the tx.
    const mismatches = [];
    for (const [name, expected] of Object.entries(perTable)) {
      const t = scopedByName.get(name);
      const colName = t.columns[t.merchantColKey].name;
      const res = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM "${name}" WHERE "${colName}" = ${MERCHANT_ID}`));
      const got = res.rows?.[0]?.n ?? res[0]?.n;
      if (Number(got) !== expected) mismatches.push(`${name}: expected ${expected}, got ${got}`);
    }
    const mres = await tx.execute(sql.raw(`SELECT status, email FROM merchants WHERE id = ${MERCHANT_ID}`));
    const mrow = mres.rows?.[0] ?? mres[0];
    if (mrow?.status !== "active") mismatches.push(`merchants.status expected active, got ${mrow?.status}`);
    if (mrow?.email !== NEW_EMAIL) mismatches.push(`merchants.email expected ${NEW_EMAIL}, got ${mrow?.email}`);

    if (mismatches.length) throw new Error("VERIFY FAILED:\n" + mismatches.join("\n"));
    console.log(`verify OK: merchant 4 active as ${NEW_EMAIL}, ${inserted} scoped rows across ${Object.keys(perTable).length} tables`);

    if (!DO_COMMIT) throw new Error("DRY_RUN_ROLLBACK");
  });
  console.log(`\nCOMMITTED. merchant 4 restored: deleted ${deleted} stray rows, inserted ${inserted} rows.`);
  console.log(`LOGIN: ${NEW_EMAIL} / ${NEW_LOGIN_PASSWORD}`);
} catch (e) {
  if (e.message === "DRY_RUN_ROLLBACK") {
    console.log(`\nDRY RUN OK (rolled back). Would delete ${deleted} stray rows, insert ${inserted} rows across ${Object.keys(perTable).length} tables, and activate merchant 4 as ${NEW_EMAIL}.`);
    console.log("Set DO_COMMIT=1 to apply.");
  } else {
    console.error("\nRESTORE FAILED (rolled back):", e.message);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
