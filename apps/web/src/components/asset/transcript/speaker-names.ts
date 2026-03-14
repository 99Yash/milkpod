export type SpeakerNamesMap = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function sanitizeSpeakerNames(
  speakerNames: Record<string, string>,
): SpeakerNamesMap {
  const sanitized: SpeakerNamesMap = {};

  for (const [speakerId, displayName] of Object.entries(speakerNames)) {
    const id = speakerId.trim();
    const name = displayName.trim();
    if (id.length === 0 || name.length === 0) continue;
    sanitized[id] = name;
  }

  return sanitized;
}

export function extractSpeakerNames(providerMetadata: unknown): SpeakerNamesMap {
  const metadata = asRecord(providerMetadata);
  if (!metadata) return {};

  const rawSpeakerNames = asRecord(metadata.speakerNames);
  if (!rawSpeakerNames) return {};

  const names: SpeakerNamesMap = {};

  for (const [speakerId, value] of Object.entries(rawSpeakerNames)) {
    if (typeof value !== 'string') continue;
    const id = speakerId.trim();
    const name = value.trim();
    if (id.length === 0 || name.length === 0) continue;
    names[id] = name;
  }

  return names;
}

export function formatSpeakerId(speakerId: string): string {
  const match = /^speaker[_\-\s]?(\d+)$/i.exec(speakerId.trim());
  if (match) {
    const numeric = Number.parseInt(match[1], 10);
    if (!Number.isNaN(numeric)) {
      return `Speaker ${numeric + 1}`;
    }
  }

  return speakerId;
}

export function resolveSpeakerLabel(
  speakerId: string | null,
  speakerNames: SpeakerNamesMap,
): string | null {
  if (!speakerId) return null;
  return speakerNames[speakerId] ?? formatSpeakerId(speakerId);
}

export function sortSpeakerIds(speakerIds: string[]): string[] {
  return [...speakerIds].sort((a, b) => {
    const matchA = /^speaker[_\-\s]?(\d+)$/i.exec(a);
    const matchB = /^speaker[_\-\s]?(\d+)$/i.exec(b);

    if (matchA && matchB) {
      return Number.parseInt(matchA[1], 10) - Number.parseInt(matchB[1], 10);
    }

    return a.localeCompare(b);
  });
}
