import { db } from '@milkpod/db';
import {
  assetComments,
  assetMoments,
  replicacheClient,
  replicacheClientGroup,
  user as userTable,
} from '@milkpod/db/schemas';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Comment, Moment } from '../../types';
import { getAccessibleAssetIds } from './authz';
import { getCVRStore, type CVRSnapshot } from './cvr';

export type PatchOp =
  | { op: 'put'; key: string; value: Record<string, unknown> }
  | { op: 'del'; key: string }
  | { op: 'clear' };

export interface PullRequestBody {
  pullVersion: 1;
  clientGroupID: string;
  cookie: number | null;
  profileID?: string;
  schemaVersion?: string;
}

export interface PullResponse {
  cookie: number;
  lastMutationIDChanges: Record<string, number>;
  patch: PatchOp[];
}

type AuthorMeta = { name: string; image: string | null; email: string };

function serializeMoment(
  m: Moment,
  authors: Record<string, AuthorMeta>,
): Record<string, unknown> {
  const author = authors[m.userId];
  return {
    id: m.id,
    assetId: m.assetId,
    authorId: m.userId,
    authorName: author?.name ?? null,
    authorImage: author?.image ?? null,
    authorEmail: author?.email ?? null,
    preset: m.preset,
    title: m.title,
    rationale: m.rationale,
    startTime: m.startTime,
    endTime: m.endTime,
    score: m.score,
    source: m.source,
    isSaved: m.isSaved,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    rowVersion: m.rowVersion,
  };
}

function serializeComment(
  c: Comment,
  authors: Record<string, AuthorMeta>,
): Record<string, unknown> {
  const author = authors[c.userId];
  return {
    id: c.id,
    assetId: c.assetId,
    authorId: c.userId,
    authorName: author?.name ?? null,
    authorImage: author?.image ?? null,
    authorEmail: author?.email ?? null,
    body: c.body,
    startTime: c.startTime,
    endTime: c.endTime,
    source: c.source,
    evidenceRefs: c.evidenceRefs,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    rowVersion: c.rowVersion,
  };
}

export async function handlePull(
  userId: string,
  body: PullRequestBody,
): Promise<PullResponse | { forbidden: true }> {
  const { clientGroupID, cookie } = body;
  const cvrStore = getCVRStore();

  // 1. Acquire a per-clientGroup advisory lock so concurrent pulls serialize.
  //    Without this, two pulls can read the same `cvr_version`, both compute
  //    `next = cvr + 1`, and both return the same cookie — which Replicache
  //    rejects as "cookie did not change, but patch is not empty". React
  //    StrictMode in dev makes this reliable to reproduce.
  //    Scope: the lock is released when the tx commits.
  return await db().transaction(async (tx) => {
    const lockKey = clientGroupID;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    // 2. Bind clientGroupID → userId. First pull creates the row; later pulls
    //    must match the owning user, else 403.
    const [existingGroup] = await tx
      .select()
      .from(replicacheClientGroup)
      .where(eq(replicacheClientGroup.id, clientGroupID));

    if (existingGroup) {
      if (existingGroup.userId !== userId) {
        return { forbidden: true };
      }
    } else {
      // Advisory lock (acquired above) serializes concurrent pulls for this
      // clientGroup, but `onConflictDoNothing` guards against the advisory
      // lock ever failing silently — cheap belt-and-suspenders.
      await tx
        .insert(replicacheClientGroup)
        .values({
          id: clientGroupID,
          userId,
          cvrVersion: 0,
        })
        .onConflictDoNothing();
    }

    // 3. Load previous snapshot. If cookie is null or the stored CVR expired,
    //    treat as a cold sync and emit `clear`.
    const prev: CVRSnapshot | null =
      cookie != null ? await cvrStore.get(clientGroupID, cookie) : null;
    const isColdSync = prev == null;
    const prevSnapshot: CVRSnapshot = prev ?? { moments: {}, comments: {} };

    // 4. Query current visible rows.
    const assetIds = await getAccessibleAssetIds(userId);
    let currentMoments: Moment[] = [];
    let currentComments: Comment[] = [];
    if (assetIds.length > 0) {
      currentMoments = await tx
        .select()
        .from(assetMoments)
        .where(
          and(
            inArray(assetMoments.assetId, assetIds),
            isNull(assetMoments.dismissedAt),
            isNull(assetMoments.deletedAt),
          ),
        );
      currentComments = await tx
        .select()
        .from(assetComments)
        .where(
          and(
            inArray(assetComments.assetId, assetIds),
            isNull(assetComments.dismissedAt),
            isNull(assetComments.deletedAt),
          ),
        );
    }

    // 5. Resolve author metadata for all visible rows in one query.
    const authorIds = new Set<string>();
    for (const m of currentMoments) authorIds.add(m.userId);
    for (const c of currentComments) authorIds.add(c.userId);
    const authorsMap: Record<string, AuthorMeta> = {};
    if (authorIds.size > 0) {
      const authors = await tx
        .select({
          id: userTable.id,
          name: userTable.name,
          image: userTable.image,
          email: userTable.email,
        })
        .from(userTable)
        .where(inArray(userTable.id, [...authorIds]));
      for (const a of authors) {
        authorsMap[a.id] = { name: a.name, image: a.image, email: a.email };
      }
    }

    // 6. Build the next snapshot and diff patch.
    const nextSnapshot: CVRSnapshot = { moments: {}, comments: {} };
    const patch: PatchOp[] = [];
    if (isColdSync) patch.push({ op: 'clear' });

    for (const m of currentMoments) {
      nextSnapshot.moments[m.id] = { v: m.rowVersion, a: m.assetId };
      const prevRow = prevSnapshot.moments[m.id];
      if (!prevRow || prevRow.v !== m.rowVersion) {
        patch.push({
          op: 'put',
          key: `moment/${m.assetId}/${m.id}`,
          value: serializeMoment(m, authorsMap),
        });
      }
    }
    for (const c of currentComments) {
      nextSnapshot.comments[c.id] = { v: c.rowVersion, a: c.assetId };
      const prevRow = prevSnapshot.comments[c.id];
      if (!prevRow || prevRow.v !== c.rowVersion) {
        patch.push({
          op: 'put',
          key: `comment/${c.assetId}/${c.id}`,
          value: serializeComment(c, authorsMap),
        });
      }
    }
    // Deletions: rows present in prev snapshot but not current.
    if (!isColdSync) {
      for (const [id, row] of Object.entries(prevSnapshot.moments)) {
        if (!nextSnapshot.moments[id]) {
          patch.push({ op: 'del', key: `moment/${row.a}/${id}` });
        }
      }
      for (const [id, row] of Object.entries(prevSnapshot.comments)) {
        if (!nextSnapshot.comments[id]) {
          patch.push({ op: 'del', key: `comment/${row.a}/${id}` });
        }
      }
    }

    // 7. Bump cvr_version (no-op if patch is empty — keeps client's cookie stable).
    const prevVersion = existingGroup?.cvrVersion ?? 0;
    const nextVersion = patch.length > 0 ? prevVersion + 1 : prevVersion;
    if (nextVersion !== prevVersion) {
      await cvrStore.put(clientGroupID, nextVersion, nextSnapshot);
      await tx
        .update(replicacheClientGroup)
        .set({ cvrVersion: nextVersion })
        .where(eq(replicacheClientGroup.id, clientGroupID));
    }

    // 8. Load last mutation IDs for every client in this group.
    const clients = await tx
      .select({
        id: replicacheClient.id,
        lastMutationId: replicacheClient.lastMutationId,
      })
      .from(replicacheClient)
      .where(eq(replicacheClient.clientGroupId, clientGroupID));
    const lastMutationIDChanges: Record<string, number> = {};
    for (const c of clients) lastMutationIDChanges[c.id] = c.lastMutationId;

    return {
      cookie: nextVersion,
      lastMutationIDChanges,
      patch,
    };
  });
}
