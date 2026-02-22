import { t } from 'elysia';

export namespace IngestModel {
  export const ingest = t.Object({
    url: t.String({ format: 'uri' }),
  });
  export type Ingest = typeof ingest.static;
}
