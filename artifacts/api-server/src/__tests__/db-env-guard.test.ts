import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertExpectedEnv, databaseFingerprint } from "../lib/db-env-guard";

const URL_A = "postgres://user:pass@db-a.example.com:5432/koapos";
const URL_B = "postgres://user:pass@db-b.example.com:5432/koapos";

describe("db-env-guard", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.EXPECTED_DB;
    delete process.env.DB_FINGERPRINT_DEVELOPMENT;
    delete process.env.DB_FINGERPRINT_PRODUCTION;
    process.env.DATABASE_URL = URL_A;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("fingerprint is stable per host+db and differs across databases", () => {
    expect(databaseFingerprint(URL_A)).toBe(databaseFingerprint(URL_A));
    expect(databaseFingerprint(URL_A)).not.toBe(databaseFingerprint(URL_B));
  });

  it("refuses to run when EXPECTED_DB is unset", () => {
    expect(() => assertExpectedEnv()).toThrow(/EXPECTED_DB/);
  });

  it("refuses to run when the live fingerprint does not match the expected one", () => {
    process.env.EXPECTED_DB = "development";
    process.env.DB_FINGERPRINT_DEVELOPMENT = databaseFingerprint(URL_B); // wrong DB
    expect(() => assertExpectedEnv()).toThrow(/does not match/);
  });

  it("passes and returns the env when the fingerprint matches", () => {
    process.env.EXPECTED_DB = "development";
    process.env.DB_FINGERPRINT_DEVELOPMENT = databaseFingerprint(URL_A);
    expect(assertExpectedEnv()).toBe("development");
  });

  it("passes (with a warning) when no fingerprint is configured", () => {
    process.env.EXPECTED_DB = "production";
    expect(assertExpectedEnv()).toBe("production");
  });
});
