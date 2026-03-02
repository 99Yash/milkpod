CREATE TYPE "public"."moment_preset" AS ENUM('default', 'hook', 'insight', 'quote', 'actionable', 'story');--> statement-breakpoint
CREATE TYPE "public"."moment_source" AS ENUM('hybrid', 'llm', 'qa');--> statement-breakpoint
CREATE TABLE "asset_moment_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"moment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "asset_moment_feedback_unique" UNIQUE("moment_id","user_id","action")
);
--> statement-breakpoint
CREATE TABLE "asset_moment" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"user_id" text NOT NULL,
	"preset" "moment_preset" NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"score" real NOT NULL,
	"score_breakdown" jsonb,
	"source" "moment_source" NOT NULL,
	"is_saved" boolean DEFAULT false NOT NULL,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
ALTER TABLE "asset_moment_feedback" ADD CONSTRAINT "asset_moment_feedback_moment_id_asset_moment_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."asset_moment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_moment_feedback" ADD CONSTRAINT "asset_moment_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_moment" ADD CONSTRAINT "asset_moment_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_moment" ADD CONSTRAINT "asset_moment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_moment_feedback_moment_idx" ON "asset_moment_feedback" USING btree ("moment_id");--> statement-breakpoint
CREATE INDEX "asset_moment_asset_preset_score_idx" ON "asset_moment" USING btree ("asset_id","preset","score");--> statement-breakpoint
CREATE INDEX "asset_moment_asset_start_idx" ON "asset_moment" USING btree ("asset_id","start_time");