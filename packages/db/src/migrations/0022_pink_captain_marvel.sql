CREATE TYPE "public"."visual_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "visual_status" "visual_status";--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "visual_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "visual_last_error" text;