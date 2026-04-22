import { z } from 'zod';
import type { WriteTransaction } from 'replicache';
import { momentKey } from '../keys';
import type { SyncedMoment } from '../types';

export const momentPresetSchema = z.enum([
	'default',
	'hook',
	'insight',
	'quote',
	'actionable',
	'story',
]);
export const momentSourceSchema = z.enum(['hybrid', 'llm', 'qa']);

// ---------------------------------------------------------------------------
// momentCreate
// ---------------------------------------------------------------------------

export const momentCreateArgsSchema = z.object({
	id: z.string().min(1).max(100),
	assetId: z.string().min(1).max(100),
	preset: momentPresetSchema,
	title: z.string().min(1).max(280),
	rationale: z.string().max(2000),
	startTime: z.number().min(0),
	endTime: z.number().min(0),
	score: z.number().min(0).max(1),
	source: momentSourceSchema,
	createdAt: z.string(),
	authorId: z.string(),
	authorName: z.string().nullable(),
	authorImage: z.string().nullable(),
	authorEmail: z.string().nullable(),
});
export type MomentCreateArgs = z.infer<typeof momentCreateArgsSchema>;

export async function momentCreateClient(
	tx: WriteTransaction,
	args: MomentCreateArgs,
): Promise<void> {
	const value: SyncedMoment = {
		...args,
		isSaved: false,
		rowVersion: 0,
	};
	await tx.set(
		momentKey(args.assetId, args.id),
		value as unknown as import('replicache').ReadonlyJSONValue,
	);
}

// ---------------------------------------------------------------------------
// momentUpdate — partial update, merged onto existing local row if present
// ---------------------------------------------------------------------------

export const momentUpdateArgsSchema = z.object({
	id: z.string().min(1).max(100),
	assetId: z.string().min(1).max(100),
	title: z.string().min(1).max(280).optional(),
	rationale: z.string().max(2000).optional(),
	isSaved: z.boolean().optional(),
});
export type MomentUpdateArgs = z.infer<typeof momentUpdateArgsSchema>;

export async function momentUpdateClient(
	tx: WriteTransaction,
	args: MomentUpdateArgs,
): Promise<void> {
	const key = momentKey(args.assetId, args.id);
	const existing = (await tx.get(key)) as SyncedMoment | undefined;
	if (!existing) return;
	const { id: _id, assetId: _a, ...patch } = args;
	const next: SyncedMoment = {
		...existing,
		...patch,
		rowVersion: existing.rowVersion + 1,
	};
	await tx.set(key, next as unknown as import('replicache').ReadonlyJSONValue);
}

// ---------------------------------------------------------------------------
// momentDelete — soft delete (server writes deleted_at; client just drops key)
// ---------------------------------------------------------------------------

export const momentDeleteArgsSchema = z.object({
	id: z.string().min(1).max(100),
	assetId: z.string().min(1).max(100),
});
export type MomentDeleteArgs = z.infer<typeof momentDeleteArgsSchema>;

export async function momentDeleteClient(
	tx: WriteTransaction,
	args: MomentDeleteArgs,
): Promise<void> {
	await tx.del(momentKey(args.assetId, args.id));
}
