CREATE TYPE "public"."comment_source" AS ENUM('audio', 'visual', 'hybrid');--> statement-breakpoint
CREATE TABLE "asset_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"source" "comment_source" NOT NULL,
	"evidence_refs" jsonb,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
ALTER TABLE "asset_comment" ADD CONSTRAINT "asset_comment_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_comment" ADD CONSTRAINT "asset_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_comment_asset_start_idx" ON "asset_comment" USING btree ("asset_id","start_time");--> statement-breakpoint
CREATE INDEX "asset_comment_user_asset_idx" ON "asset_comment" USING btree ("user_id","asset_id");