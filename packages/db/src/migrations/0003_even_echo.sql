ALTER TABLE "embedding" ADD COLUMN "model" text DEFAULT 'text-embedding-3-small' NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding" ADD COLUMN "dimensions" integer DEFAULT 1536 NOT NULL;