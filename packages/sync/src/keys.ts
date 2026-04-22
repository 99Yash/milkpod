export const SYNC_ENTITIES = ["moment", "comment"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export function momentKey(assetId: string, momentId: string): string {
	return `moment/${assetId}/${momentId}`;
}

export function commentKey(assetId: string, commentId: string): string {
	return `comment/${assetId}/${commentId}`;
}

export function momentPrefix(assetId: string): string {
	return `moment/${assetId}/`;
}

export function commentPrefix(assetId: string): string {
	return `comment/${assetId}/`;
}

export interface ParsedKey {
	entity: SyncEntity;
	assetId: string;
	id: string;
}

export function parseKey(key: string): ParsedKey | null {
	const parts = key.split("/");
	if (parts.length !== 3) return null;
	const [entity, assetId, id] = parts;
	if (!entity || !assetId || !id) return null;
	if (entity !== "moment" && entity !== "comment") return null;
	return { entity, assetId, id };
}
