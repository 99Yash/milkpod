import { z } from 'zod';
import type { WriteTransaction } from 'replicache';
import { notificationKey, notificationPrefix } from '../keys';
import type { SyncedNotification } from '../types';

// ---------------------------------------------------------------------------
// notificationMarkRead — flip readAt on a single notification owned by the caller.
// Server repeats the same check atomically.
// ---------------------------------------------------------------------------

export const notificationMarkReadArgsSchema = z.object({
	id: z.string().min(1).max(100),
	/** Epoch ms. Client fills this so the optimistic view matches the later server write. */
	readAt: z.number().int().positive(),
});
export type NotificationMarkReadArgs = z.infer<
	typeof notificationMarkReadArgsSchema
>;

export async function notificationMarkReadClient(
	tx: WriteTransaction,
	args: NotificationMarkReadArgs,
): Promise<void> {
	const key = notificationKey(args.id);
	const existing = (await tx.get(key)) as SyncedNotification | undefined;
	if (!existing) return;
	if (existing.readAt != null) return;
	const next: SyncedNotification = {
		...existing,
		readAt: args.readAt,
		rowVersion: existing.rowVersion + 1,
	};
	await tx.set(key, next as unknown as import('replicache').ReadonlyJSONValue);
}

// ---------------------------------------------------------------------------
// notificationMarkAllRead — bulk bail. Scans all notification/* keys and flips
// unread ones.
// ---------------------------------------------------------------------------

export const notificationMarkAllReadArgsSchema = z.object({
	readAt: z.number().int().positive(),
});
export type NotificationMarkAllReadArgs = z.infer<
	typeof notificationMarkAllReadArgsSchema
>;

export async function notificationMarkAllReadClient(
	tx: WriteTransaction,
	args: NotificationMarkAllReadArgs,
): Promise<void> {
	for await (const entry of tx
		.scan({ prefix: notificationPrefix })
		.entries()) {
		const [key, value] = entry;
		const n = value as unknown as SyncedNotification;
		if (n.readAt != null) continue;
		const next: SyncedNotification = {
			...n,
			readAt: args.readAt,
			rowVersion: n.rowVersion + 1,
		};
		await tx.set(
			key,
			next as unknown as import('replicache').ReadonlyJSONValue,
		);
	}
}
