export type SpeakerNamesMap = Record<string, string>;

const MAX_SPEAKER_NAME_ENTRIES = 50;
const MAX_SPEAKER_ID_LENGTH = 64;
const MAX_SPEAKER_NAME_LENGTH = 80;

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
  let totalEntries = 0;

  for (const [speakerId, displayName] of Object.entries(speakerNames)) {
    const id = speakerId.trim();
    const name = displayName.trim();

    if (
      id.length === 0 ||
      name.length === 0 ||
      id.length > MAX_SPEAKER_ID_LENGTH ||
      name.length > MAX_SPEAKER_NAME_LENGTH
    ) {
      continue;
    }

    const seen = Object.prototype.hasOwnProperty.call(sanitized, id);
    if (!seen && totalEntries >= MAX_SPEAKER_NAME_ENTRIES) {
      break;
    }

    sanitized[id] = name;

    if (!seen) {
      totalEntries += 1;
    }
  }

  return sanitized;
}

export function extractSpeakerNames(providerMetadata: unknown): SpeakerNamesMap {
  const metadata = asRecord(providerMetadata);
  if (!metadata) return {};

  const rawSpeakerNames = asRecord(metadata.speakerNames);
  if (!rawSpeakerNames) return {};

  const names: SpeakerNamesMap = {};
  let totalEntries = 0;

  for (const [speakerId, value] of Object.entries(rawSpeakerNames)) {
    if (typeof value !== 'string') continue;
    const id = speakerId.trim();
    const name = value.trim();

    if (
      id.length === 0 ||
      name.length === 0 ||
      id.length > MAX_SPEAKER_ID_LENGTH ||
      name.length > MAX_SPEAKER_NAME_LENGTH
    ) {
      continue;
    }

    const seen = Object.prototype.hasOwnProperty.call(names, id);
    if (!seen && totalEntries >= MAX_SPEAKER_NAME_ENTRIES) {
      break;
    }

    names[id] = name;

    if (!seen) {
      totalEntries += 1;
    }
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
