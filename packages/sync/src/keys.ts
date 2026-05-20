export const SYNC_ENTITIES = ["moment", "comment", "notification"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export function momentKey(assetId: string, momentId: string): string {
	return `moment/${assetId}/${momentId}`;
}

export function commentKey(assetId: string, commentId: string): string {
	return `comment/${assetId}/${commentId}`;
}

/** Notifications are user-scoped; the prefix has no assetId segment. */
export function notificationKey(notificationId: string): string {
	return `notification/${notificationId}`;
}

export function momentPrefix(assetId: string): string {
	return `moment/${assetId}/`;
}

export function commentPrefix(assetId: string): string {
	return `comment/${assetId}/`;
}

export const notificationPrefix = "notification/";

export type ParsedKey =
	| { entity: "moment" | "comment"; assetId: string; id: string }
	| { entity: "notification"; id: string };

export function parseKey(key: string): ParsedKey | null {
	const parts = key.split("/");
	const [entity, ...rest] = parts;
	if (!entity) return null;
	if (entity === "notification") {
		if (rest.length !== 1 || !rest[0]) return null;
		return { entity: "notification", id: rest[0] };
	}
	if (entity === "moment" || entity === "comment") {
		if (rest.length !== 2 || !rest[0] || !rest[1]) return null;
		return { entity, assetId: rest[0], id: rest[1] };
	}
	return null;
}
