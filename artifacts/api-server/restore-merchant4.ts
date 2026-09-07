/**
 * One-off restore of deleted merchant 4 (KPI Test Shop) from
 * backup-4-12-1781358414468.koapos.enc.
 *
 * The backup's row ids overlap live data owned by merchants 1 & 2, so every
 * primary key and every in-snapshot foreign key is shifted by a uniform OFFSET.
 * A uniform shift preserves the backup's internal referential integrity while
 * guaranteeing no overlap with live rows. Insert-only; single transaction with
 * FK/trigger enforcement off (PK/unique/not-null still enforced) and a verify
 * step before COMMIT.
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
const PASSWORD = process.env.BK_PASS;
const DO_COMMIT = process.env.DO_COMMIT === "1";
const NEW_LOGIN_PASSWORD = "KpiTest-" + crypto.randomBytes(4).toString("hex");
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

// ---------- 2. discover scoped tables + FK map (mirrors backup-tables.ts) ----------
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
  // FK columns that point at another scoped table (to be offset).
  for (const t of tables) {
    t.fkCols = [];
    for (const fk of getTableConfig(t.table).foreignKeys) {
      try {
        const ref = fk.reference();
        const parent = getTableName(ref.foreignTable);
        if (ref.columns.length !== 1) continue;
        if (!names.has(parent)) continue;            // parent not scoped (merchants/plans/modules) -> leave
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
  // Only shift NUMERIC ids/FKs. Tables with UUID/string primary keys (e.g.
  // sales_templates) are globally unique and can't collide with live rows, so
  // they must be left intact — adding OFFSET would string-concat into garbage.
  if (t.hasId && typeof out.id === "number") out.id = out.id + OFFSET;
  for (const k of t.fkCols) if (typeof out[k] === "number") out[k] = out[k] + OFFSET;
  out[t.merchantColKey] = MERCHANT_ID;
  for (const k of t.dateKeys) {
    const v = out[k];
    if (typeof v === "string" || typeof v === "number") out[k] = new Date(v);
  }
  return out;
}

// ---------- main ----------
const snapshot = await loadSnapshot();
if (snapshot.merchantId !== MERCHANT_ID) throw new Error(`snapshot merchantId=${snapshot.merchantId}, expected ${MERCHANT_ID}`);
console.log(`snapshot ok: merchantId=${snapshot.merchantId} schemaVersion=${snapshot.schemaVersion} exportedAt=${snapshot.exportedAt}`);

const scoped = buildScoped();
const scopedByName = new Map(scoped.map((t) => [t.name, t]));
const passwordHash = await bcrypt.hash(NEW_LOGIN_PASSWORD, 10);

let inserted = 0;
const perTable = {};
try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);

    // 3a. recreate the merchants row (id 4, free).
    await tx.insert(schema.merchantsTable).values({
      id: MERCHANT_ID,
      email: "kpi-test-claude@example.com",
      passwordHash,
      businessName: "KPI Test Shop",
      isDemoAccount: "true",
      status: "active",
      createdAt: new Date("2026-06-06T06:01:23.715Z"),
      updatedAt: new Date(),
    });

    // 3b. insert every scoped table present in the snapshot.
    for (const name of Object.keys(snapshot.tables)) {
      const t = scopedByName.get(name);
      const rows = snapshot.tables[name];
      if (!t) { if (Array.isArray(rows) && rows.length) console.warn(`! snapshot table not in current scope, skipped: ${name} (${rows.length})`); continue; }
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const values = rows.map((r) => transformRow(t, r));
      const CHUNK = 500;
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(t.table).values(values.slice(i, i + CHUNK));
      }
      perTable[name] = rows.length;
      inserted += rows.length;
    }

    // 3c. verify row counts under merchant 4 match the snapshot, inside the tx.
    const mismatches = [];
    for (const [name, expected] of Object.entries(perTable)) {
      const t = scopedByName.get(name);
      const colName = t.columns[t.merchantColKey].name;
      const res = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM "${name}" WHERE "${colName}" = ${MERCHANT_ID}`));
      const got = res.rows?.[0]?.n ?? res[0]?.n;
      if (Number(got) !== expected) mismatches.push(`${name}: expected ${expected}, got ${got}`);
    }
    const mres = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM merchants WHERE id = ${MERCHANT_ID}`));
    const mgot = mres.rows?.[0]?.n ?? mres[0]?.n;
    if (Number(mgot) !== 1) mismatches.push(`merchants: expected 1, got ${mgot}`);

    if (mismatches.length) throw new Error("VERIFY FAILED:\n" + mismatches.join("\n"));
    console.log(`verify OK: merchants row + ${inserted} scoped rows across ${Object.keys(perTable).length} tables`);

    if (!DO_COMMIT) throw new Error("DRY_RUN_ROLLBACK");
  });
  console.log(`\nCOMMITTED. merchant 4 restored with ${inserted} rows.`);
  console.log(`NEW LOGIN PASSWORD for kpi-test-claude@example.com: ${NEW_LOGIN_PASSWORD}`);
} catch (e) {
  if (e.message === "DRY_RUN_ROLLBACK") {
    console.log(`\nDRY RUN OK (rolled back). Would insert merchants row + ${inserted} rows across ${Object.keys(perTable).length} tables.`);
    console.log("Set DO_COMMIT=1 to apply.");
  } else {
    console.error("\nRESTORE FAILED (rolled back):", e.message);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
