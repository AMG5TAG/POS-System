/** SFTP backup destination. */
import path from "path";
import SftpClient from "ssh2-sftp-client";
import type { ResolvedDestination } from "./types";

export async function uploadSftp(
  dest: ResolvedDestination,
  sourcePath: string,
  fileName: string,
): Promise<string> {
  if (!dest.host) throw new Error("SFTP destination is missing a host");
  if (!dest.username) throw new Error("SFTP destination is missing a username");
  if (!dest.password) throw new Error("SFTP destination is missing a password");

  const remoteDir =
    dest.remotePath && dest.remotePath.trim().length > 0 ? dest.remotePath : ".";
  const remotePath = path.posix.join(remoteDir, fileName);

  const client = new SftpClient();
  try {
    await client.connect({
      host: dest.host,
      port: dest.port ?? 22,
      username: dest.username,
      password: dest.password,
    });
    // Best-effort: ensure the remote directory exists.
    if (remoteDir !== ".") {
      const exists = await client.exists(remoteDir);
      if (!exists) await client.mkdir(remoteDir, true);
    }
    await client.put(sourcePath, remotePath);
    return `sftp://${dest.host}${remotePath.startsWith("/") ? "" : "/"}${remotePath}`;
  } finally {
    await client.end().catch(() => {});
  }
}
