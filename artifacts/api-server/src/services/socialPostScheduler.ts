import { db, socialPostsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { trackedInterval } from "../lib/shutdown";
import { runPublish } from "../routes/social-media";
import type { Logger } from "pino";

/** Publish any scheduled social posts whose time has arrived. */
async function publishDuePosts(logger: Logger): Promise<void> {
  const due = await db.select({ id: socialPostsTable.id, merchantId: socialPostsTable.merchantId })
    .from(socialPostsTable)
    .where(and(eq(socialPostsTable.status, "scheduled"), lte(socialPostsTable.scheduledAt, new Date())))
    .limit(50);
  for (const post of due) {
    try {
      await runPublish(post.merchantId, post.id);
      logger.info({ postId: post.id }, "Published scheduled social post");
    } catch (err) {
      logger.error({ err, postId: post.id }, "Failed to publish scheduled social post");
    }
  }
}

export function scheduleSocialPosts(logger: Logger): void {
  const ONE_MINUTE = 60 * 1000;
  trackedInterval(
    () => publishDuePosts(logger).catch((err) => logger.error({ err }, "Social post scheduler run error")),
    ONE_MINUTE,
  );
}
