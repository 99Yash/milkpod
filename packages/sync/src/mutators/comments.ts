import { z } from 'zod';
import type { WriteTransaction } from 'replicache';
import { commentKey } from '../keys';
import type { SyncedComment } from '../types';

export const commentSourceSchema = z.enum(['audio', 'visual', 'hybrid']);

const evidenceRefsSchema = z
	.object({
		transcriptSegmentIds: z.array(z.string()),
		visualSegmentIds: z.array(z.string()),
	})
	.nullable();

// ---------------------------------------------------------------------------
// commentCreate
// ---------------------------------------------------------------------------

export const commentCreateArgsSchema = z.object({
	id: z.string().min(1).max(100),
	assetId: z.string().min(1).max(100),
	body: z.string().min(1).max(10_000),
	startTime: z.number().min(0),
	endTime: z.number().min(0),
	source: commentSourceSchema,
	evidenceRefs: evidenceRefsSchema.optional(),
	createdAt: z.string(),
	authorId: z.string(),
	authorName: z.string().nullable(),
	authorImage: z.string().nullable(),
	authorEmail: z.string().nullable(),
});
export type CommentCreateArgs = z.infer<typeof commentCreateArgsSchema>;

export async function commentCreateClient(
	tx: WriteTransaction,
	args: CommentCreateArgs,
): Promise<void> {
	const value: SyncedComment = {
		...args,
		evidenceRefs: args.evidenceRefs ?? null,
		rowVersion: 0,
	};
	await tx.set(
		commentKey(args.assetId, args.id),
		value as unknown as import('replicache').ReadonlyJSONValue,
	);
}

// ---------------------------------------------------------------------------
// commentUpdate — partial body/time edit
// ---------------------------------------------------------------------------

export const commentUpdateArgsSchema = z.object({
	id: z.string().min(1).max(100),
	assetId: z.string().min(1).max(100),
	body: z.string().min(1).max(10_000).optional(),
});
export type CommentUpdateArgs = z.infer<typeof commentUpdateArgsSchema>;

export async function commentUpdateClient(
	tx: WriteTransaction,
	args: CommentUpdateArgs,
): Promise<void> {
	const key = commentKey(args.assetId, args.id);
	const existing = (await tx.get(key)) as SyncedComment | undefined;
	if (!existing) return;
	const { id: _id, assetId: _a, ...patch } = args;
	const next: SyncedComment = {
		...existing,
		...patch,
		rowVersion: existing.rowVersion + 1,
	};
	await tx.set(key, next as unknown as import('replicache').ReadonlyJSONValue);
}

// ---------------------------------------------------------------------------
// commentDelete — soft delete
// ---------------------------------------------------------------------------

export const commentDeleteArgsSchema = z.object({
	id: z.string().min(1).max(100),
	assetId: z.string().min(1).max(100),
});
export type CommentDeleteArgs = z.infer<typeof commentDeleteArgsSchema>;

export async function commentDeleteClient(
	tx: WriteTransaction,
	args: CommentDeleteArgs,
): Promise<void> {
	await tx.del(commentKey(args.assetId, args.id));
}
