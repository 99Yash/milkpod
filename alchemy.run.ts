import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

// Milkpod Cloudflare stack (issue #29, Alchemy-based).
// Replaces raw wrangler.toml: one TS program declares R2, Hyperdrive (Neon),
// API Worker, and Next.js site (OpenNext). Deploy with `pnpm cf:deploy`.
//
// Required deploy-time secrets (never committed):
//   DATABASE_URL      – Neon pooled connection string (used to derive host/db/user)
//   NEON_DB_PASSWORD  – Neon password (write-only, Hyperdrive origin)
//   NEXT_PUBLIC_SERVER_URL – public API URL for the web build
//                        (defaults to https://api.croisillies.xyz)
//
// Custom domains (issue #35): set CF_CUSTOM_DOMAINS=1 once the
// croisillies.xyz zone exists in this Cloudflare account (dashboard →
// Add domain → switch Namecheap NS to Cloudflare). Until then deploys
// stay on workers.dev URLs so `cf:deploy` works before the cutover.
// After the NS switch, Alchemy manages DNS records + edge certs
// automatically; re-add Resend SPF/DKIM + DMARC in the CF zone.
const CUSTOM_DOMAINS_ENABLED = process.env.CF_CUSTOM_DOMAINS === "1";

function parsePostgresUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(u.username) || "postgres",
  };
}

export const Uploads = Cloudflare.R2.Bucket("milkpod-uploads", {
  name: "milkpod-uploads",
});

// Durable enqueue for the ingest pipeline (issue #32). The consumer
// attachment + CF_QUEUE_PRODUCER=1 flip land once Workflows pin the
// long-job runtime; until then the in-process fallback runs and these
// queues stay empty.
export const IngestQueue = Cloudflare.Queues.Queue("milkpod-ingest", {
  name: "milkpod-ingest",
});

export const VisualQueue = Cloudflare.Queues.Queue("milkpod-visual", {
  name: "milkpod-visual",
});

export const NeonHyperdrive = Effect.gen(function* () {
  const databaseUrl = Redacted.value(yield* Config.redacted("DATABASE_URL"));
  const { host, port, database, user } = parsePostgresUrl(databaseUrl);
  const password = yield* Config.redacted("NEON_DB_PASSWORD");
  return yield* Cloudflare.Hyperdrive.Connection("milkpod-neon", {
    origin: {
      scheme: "postgres",
      host,
      port,
      database,
      user,
      password,
    },
  });
});

export const Api = Cloudflare.Worker("milkpod-server", {
  main: "./apps/server/src/worker.ts",
  compatibility: {
    date: "2026-09-01",
    flags: ["nodejs_compat"],
  },
  env: {
    UPLOAD_BUCKET: Uploads,
    HYPERDRIVE: NeonHyperdrive,
    INGEST_QUEUE: IngestQueue,
    VISUAL_QUEUE: VisualQueue,
    NODE_ENV: "production",
  },
  // Replaces Namecheap `CNAME api → *.up.railway.app`. Requires the zone.
  ...(CUSTOM_DOMAINS_ENABLED
    ? { domain: "api.croisillies.xyz" }
    : {}),
});

export const Website = Cloudflare.Website.Nextjs("milkpod-web", {
  rootDir: "./apps/web",
  env: {
    UPLOAD_BUCKET: Uploads,
  },
  // Replaces Namecheap `CNAME @` + `CNAME www → *.up.railway.app`.
  // Apex is canonical; www serves the same site. Requires the zone.
  ...(CUSTOM_DOMAINS_ENABLED
    ? {
        domain: {
          name: "croisillies.xyz",
          aliases: ["www.croisillies.xyz"],
        },
      }
    : {}),
});

export type ApiEnv = Cloudflare.InferEnv<typeof Api>;
export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "milkpod",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const uploads = yield* Uploads;
    const hyperdrive = yield* NeonHyperdrive;
    const ingestQueue = yield* IngestQueue;
    const visualQueue = yield* VisualQueue;
    const api = yield* Api;
    const website = yield* Website;
    return {
      apiUrl: api.url,
      websiteUrl: website.url,
      uploadsBucket: uploads.bucketName,
      hyperdriveId: hyperdrive.hyperdriveId,
      ingestQueue: ingestQueue.queueName,
      visualQueue: visualQueue.queueName,
    };
  }),
);
