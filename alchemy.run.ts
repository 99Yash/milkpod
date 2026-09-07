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
//   NEXT_PUBLIC_SERVER_URL – public API Worker URL for the web build

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
    NODE_ENV: "production",
  },
});

export const Website = Cloudflare.Website.Nextjs("milkpod-web", {
  rootDir: "./apps/web",
  env: {
    UPLOAD_BUCKET: Uploads,
  },
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
    const api = yield* Api;
    const website = yield* Website;
    return {
      apiUrl: api.url,
      websiteUrl: website.url,
      uploadsBucket: uploads.bucketName,
      hyperdriveId: hyperdrive.hyperdriveId,
    };
  }),
);
