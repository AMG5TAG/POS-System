/** Amazon S3 (or S3-compatible) backup destination. */
import { readFile } from "fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ResolvedDestination } from "./types";

export async function uploadS3(
  dest: ResolvedDestination,
  sourcePath: string,
  fileName: string,
): Promise<string> {
  if (!dest.bucket) throw new Error("S3 destination is missing a bucket name");
  if (!dest.region) throw new Error("S3 destination is missing a region");
  if (!dest.accessKeyId || !dest.secretAccessKey) {
    throw new Error("S3 destination is missing credentials");
  }

  const client = new S3Client({
    region: dest.region,
    credentials: {
      accessKeyId: dest.accessKeyId,
      secretAccessKey: dest.secretAccessKey,
    },
  });

  const body = await readFile(sourcePath);
  const key = `koapos-backups/${fileName}`;
  await client.send(
    new PutObjectCommand({
      Bucket: dest.bucket,
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
    }),
  );
  client.destroy();
  return `s3://${dest.bucket}/${key}`;
}
