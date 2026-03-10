ALTER TABLE "media_asset" ADD COLUMN "raw_media_retention_until" timestamp;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "raw_media_deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "retention_hold" boolean DEFAULT false NOT NULL;