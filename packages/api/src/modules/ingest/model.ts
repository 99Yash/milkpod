import { t } from 'elysia';

export type TranscriptionStrategy = 'audio-first' | 'auto' | 'captions-first';

export namespace IngestModel {
  export const ingest = t.Object({
    url: t.String({ format: 'uri', maxLength: 2048 }),
    transcriptionStrategy: t.Optional(
      t.Union([
        t.Literal('audio-first'),
        t.Literal('auto'),
        t.Literal('captions-first'),
      ])
    ),
  });
  export type Ingest = typeof ingest.static;
}
