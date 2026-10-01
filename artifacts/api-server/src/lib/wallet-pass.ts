import crypto from "node:crypto";
import { deflateSync } from "node:zlib";
import forge from "node-forge";
import type { Response } from "express";
import { db, merchantsTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { customerPortalUrl } from "./publicUrl";

/**
 * Loyalty-card passes for Apple Wallet (.pkpass) and Google Wallet (save
 * link). Used by the shop account (routes/shop-account.ts) and by staff from a
 * customer's record (routes/portal.ts). The pass's barcode is the customer's
 * account link, customerPortalUrl.
 */

// ── Pure-JS PNG builder (no deps) ────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function solidPng(w: number, h: number, r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(w, 0); hdr.writeUInt32BE(h, 4);
  hdr[8] = 8; hdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const imgData = Buffer.concat(Array.from({ length: h }, () => Buffer.from(row)));
  return Buffer.concat([sig, pngChunk("IHDR", hdr), pngChunk("IDAT", deflateSync(imgData)), pngChunk("IEND", Buffer.alloc(0))]);
}

const ICON_29  = solidPng(29,  29,  251, 191, 36);
const ICON_58  = solidPng(58,  58,  251, 191, 36);
const ICON_87  = solidPng(87,  87,  251, 191, 36);
const LOGO_160 = solidPng(160, 50,  251, 191, 36);
const LOGO_320 = solidPng(320, 100, 251, 191, 36);

// ── Apple Wallet pass builder ─────────────────────────────────────────────────

export function buildPassJson(opts: {
  passTypeId: string; teamId: string; serialNumber: string;
  businessName: string; customerName: string;
  loyaltyPoints: number; visitCount: number; portalUrl: string;
}): Buffer {
  const { passTypeId, teamId, serialNumber, businessName, customerName, loyaltyPoints, visitCount, portalUrl } = opts;
  return Buffer.from(JSON.stringify({
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber,
    teamIdentifier: teamId,
    description: `${businessName} Loyalty Card`,
    logoText: businessName,
    organizationName: businessName,
    backgroundColor: "rgb(251, 191, 36)",
    foregroundColor: "rgb(0, 0, 0)",
    labelColor: "rgb(51, 51, 51)",
    storeCard: {
      primaryFields: [
        { key: "balance", label: "LOYALTY BALANCE", value: `${loyaltyPoints} pts` },
      ],
      secondaryFields: [
        { key: "name",   label: "NAME",   value: customerName },
        { key: "visits", label: "VISITS", value: String(visitCount) },
      ],
      barcode: {
        format: "PKBarcodeFormatQR",
        message: portalUrl,
        messageEncoding: "iso-8859-1",
        altText: "Scan to view profile",
      },
    },
  }), "utf8");
}

// Minimal dependency-free ZIP builder (STORE compression — required by pkpass)
function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const sz = data.length;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // STORE
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(sz, 18); local.writeUInt32LE(sz, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(sz, 20); cd.writeUInt32LE(sz, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);

    localParts.push(local, data);
    centralDirs.push(cd);
    offset += 30 + nameBuf.length + sz;
  }

  const cdBuf = Buffer.concat(centralDirs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, cdBuf, eocd]);
}

export function buildPkpass(passJson: Buffer, certPem: string, keyPem: string): Buffer {
  const files: Array<{ name: string; data: Buffer }> = [
    { name: "pass.json",   data: passJson },
    { name: "icon.png",    data: ICON_29  },
    { name: "icon@2x.png", data: ICON_58  },
    { name: "icon@3x.png", data: ICON_87  },
    { name: "logo.png",    data: LOGO_160 },
    { name: "logo@2x.png", data: LOGO_320 },
  ];

  const manifest: Record<string, string> = {};
  for (const { name, data } of files) {
    manifest[name] = crypto.createHash("sha1").update(data).digest("hex");
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest), "utf8");

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestBuf.toString("binary"));
  p7.addCertificate(certPem);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: forge.pki.certificateFromPem(certPem),
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
    ],
  });
  p7.sign({ detached: true });
  const signatureBuf = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");

  return buildZip([
    ...files,
    { name: "manifest.json", data: manifestBuf },
    { name: "signature",     data: signatureBuf },
  ]);
}

// ── Google Wallet JWT builder ─────────────────────────────────────────────────

export function buildGoogleWalletSaveUrl(opts: {
  issuerId: string; serviceEmail: string; privateKey: string;
  customerId: number; businessName: string; customerName: string;
  loyaltyPoints: number; portalUrl: string;
}): string {
  const { issuerId, serviceEmail, privateKey, customerId, businessName, customerName, loyaltyPoints, portalUrl } = opts;
  const payload = {
    iss: serviceEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      loyaltyObjects: [{
        id: `${issuerId}.customer-${customerId}`,
        classId: `${issuerId}.koapos-loyalty`,
        state: "ACTIVE",
        accountId: String(customerId),
        accountName: customerName,
        loyaltyPoints: { balance: { int: loyaltyPoints }, label: "Points" },
        barcode: { type: "QR_CODE", value: portalUrl, alternateText: customerName },
        infoModuleData: {
          labelValueRows: [{ columns: [{ label: "Business", value: businessName }] }],
        },
      }],
    },
  };
  const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const bdy = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${hdr}.${bdy}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(input);
  return `https://pay.google.com/gp/v/save/${input}.${sign.sign(privateKey, "base64url")}`;
}

// ── Sending a customer their pass ─────────────────────────────────────────────

type Customer = typeof customersTable.$inferSelect;

async function passDetails(customer: Customer) {
  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, customer.merchantId));
  return {
    businessName: merchant?.businessName ?? "Our Store",
    customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Valued Customer",
    portalUrl: customerPortalUrl(null, customer.portalToken) ?? "",
  };
}

/** Answer with the customer's Apple Wallet pass, or 503 when the platform has no pass certificate. */
export async function sendApplePass(res: Response, customer: Customer): Promise<void> {
  const certPem    = process.env.APPLE_WALLET_CERT_PEM;
  const keyPem     = process.env.APPLE_WALLET_KEY_PEM;
  const teamId     = process.env.APPLE_WALLET_TEAM_ID;
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID;
  if (!certPem || !keyPem || !teamId || !passTypeId) {
    res.status(503).json({
      error: "Apple Wallet not configured",
      setup: "Set APPLE_WALLET_CERT_PEM, APPLE_WALLET_KEY_PEM, APPLE_WALLET_TEAM_ID, and APPLE_WALLET_PASS_TYPE_ID in your environment secrets.",
    });
    return;
  }
  const d = await passDetails(customer);
  const passJson = buildPassJson({
    passTypeId, teamId,
    serialNumber: `koapos-${customer.merchantId}-${customer.id}`,
    businessName: d.businessName, customerName: d.customerName,
    loyaltyPoints: customer.loyaltyPoints, visitCount: customer.visitCount, portalUrl: d.portalUrl,
  });
  res.set({
    "Content-Type": "application/vnd.apple.pkpass",
    "Content-Disposition": `attachment; filename="loyalty-card.pkpass"`,
  });
  res.send(buildPkpass(passJson, certPem, keyPem));
}

/** Answer with `{ saveUrl }` for Google Wallet, or 503 when it is not configured. */
export async function sendGoogleWalletLink(res: Response, customer: Customer): Promise<void> {
  const issuerId     = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKey   = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  if (!issuerId || !serviceEmail || !privateKey) {
    res.status(503).json({
      error: "Google Wallet not configured",
      setup: "Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL, and GOOGLE_WALLET_PRIVATE_KEY in your environment secrets.",
    });
    return;
  }
  const d = await passDetails(customer);
  res.json({
    saveUrl: buildGoogleWalletSaveUrl({
      issuerId, serviceEmail, privateKey, customerId: customer.id,
      businessName: d.businessName, customerName: d.customerName,
      loyaltyPoints: customer.loyaltyPoints, portalUrl: d.portalUrl,
    }),
  });
}
