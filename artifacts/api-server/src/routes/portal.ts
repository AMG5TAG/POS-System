import { Router, type IRouter } from "express";
import { db, customersTable, merchantsTable, loyaltySettingsTable, appointmentsTable, serviceJobsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import { deflateSync } from "node:zlib";
import forge from "node-forge";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findCustomerByToken(token: string) {
  const [row] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.portalToken, token));
  return row ?? null;
}

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

function buildPassJson(opts: {
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

function buildPkpass(passJson: Buffer, certPem: string, keyPem: string): Buffer {
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

function buildGoogleWalletSaveUrl(opts: {
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

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/portal/:token", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, customer.merchantId));

  const [loyalty] = await db
    .select()
    .from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, customer.merchantId));

  res.json({
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    dateOfBirth: customer.dateOfBirth,
    loyaltyPoints: customer.loyaltyPoints,
    totalSpent: parseFloat(customer.totalSpent),
    visitCount: customer.visitCount,
    merchant: { businessName: merchant?.businessName ?? "Our Store", logoUrl: merchant?.logoUrl ?? null },
    loyalty: { programType: loyalty?.programType ?? "cashback", isEnabled: loyalty?.isEnabled === "true" },
  });
});

const UpdateProfileBody = z.object({
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
  email:     z.string().email().optional(),
  phone:     z.string().optional(),
  address:   z.string().optional(),
  dateOfBirth: z.string().optional(),
});

router.patch("/portal/:token/profile", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(customersTable)
    .set(parsed.data)
    .where(eq(customersTable.id, customer.id))
    .returning();

  res.json({
    firstName: updated.firstName,
    lastName:  updated.lastName,
    email:     updated.email,
    phone:     updated.phone,
    address:   updated.address,
    dateOfBirth: updated.dateOfBirth,
  });
});

router.get("/portal/:token/appointments", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

  const rows = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.customerId, customer.id), eq(appointmentsTable.merchantId, customer.merchantId)))
    .orderBy(desc(appointmentsTable.scheduledAt));

  res.json(rows.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description ?? null,
    scheduledAt: a.scheduledAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    notes: a.notes ?? null,
  })));
});

const BookAppointmentBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  scheduledAt: z.string(),
  durationMinutes: z.number().int().positive().optional().default(30),
  notes: z.string().optional(),
});

router.post("/portal/:token/appointments", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

  const parsed = BookAppointmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [appt] = await db
    .insert(appointmentsTable)
    .values({
      merchantId: customer.merchantId,
      customerId: customer.id,
      title: parsed.data.title,
      description: parsed.data.description,
      scheduledAt: new Date(parsed.data.scheduledAt),
      durationMinutes: parsed.data.durationMinutes,
      notes: parsed.data.notes,
      status: "scheduled",
    })
    .returning();

  res.status(201).json({
    id: appt.id,
    title: appt.title,
    scheduledAt: appt.scheduledAt.toISOString(),
    durationMinutes: appt.durationMinutes,
    status: appt.status,
  });
});

router.get("/portal/:token/services", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

  const rows = await db
    .select()
    .from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.customerId, customer.id), eq(serviceJobsTable.merchantId, customer.merchantId)))
    .orderBy(desc(serviceJobsTable.createdAt));

  res.json(rows.map(j => ({
    id: j.id,
    jobNumber: j.jobNumber,
    title: j.title,
    status: j.status,
    bookInDate: j.bookInDate,
    deviceType: j.deviceType ?? null,
    deviceDescription: j.deviceDescription ?? null,
    condition: j.condition ?? null,
    workDescription: j.workDescription ?? null,
    estimatedCost: j.estimatedCost ? parseFloat(j.estimatedCost) : null,
    notes: j.notes ?? null,
    createdAt: j.createdAt.toISOString(),
  })));
});

router.get("/portal/:token/apple-wallet", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

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

  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, customer.merchantId));

  const origin = `${req.protocol}://${req.get("host")}`;
  const portalUrl = `${origin}/portal/${customer.portalToken}`;
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Valued Customer";

  const passJson = buildPassJson({
    passTypeId, teamId,
    serialNumber: `koapos-${customer.merchantId}-${customer.id}`,
    businessName: merchant?.businessName ?? "Our Store",
    customerName, loyaltyPoints: customer.loyaltyPoints,
    visitCount: customer.visitCount, portalUrl,
  });

  const pkpass = buildPkpass(passJson, certPem, keyPem);

  res.set({
    "Content-Type": "application/vnd.apple.pkpass",
    "Content-Disposition": `attachment; filename="loyalty-card.pkpass"`,
  });
  res.send(pkpass);
});

router.get("/portal/:token/google-wallet", async (req, res): Promise<void> => {
  const customer = await findCustomerByToken(req.params.token);
  if (!customer) { res.status(404).json({ error: "Portal not found" }); return; }

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

  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, customer.merchantId));

  const origin = `${req.protocol}://${req.get("host")}`;
  const portalUrl = `${origin}/portal/${customer.portalToken}`;
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Valued Customer";

  const saveUrl = buildGoogleWalletSaveUrl({
    issuerId, serviceEmail, privateKey,
    customerId: customer.id,
    businessName: merchant?.businessName ?? "Our Store",
    customerName, loyaltyPoints: customer.loyaltyPoints, portalUrl,
  });

  res.json({ saveUrl });
});

export default router;
