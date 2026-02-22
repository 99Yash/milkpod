CREATE TYPE "public"."edit_action" AS ENUM('keep', 'skip', 'mute');--> statement-breakpoint
CREATE TYPE "public"."render_status" AS ENUM('pending', 'rendering', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."filter_action" AS ENUM('skip', 'mute');--> statement-breakpoint
CREATE TYPE "public"."episode_status" AS ENUM('queued', 'fetching', 'transcribing', 'labeling', 'editing', 'publishing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "episode_edit" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"segment_index" integer NOT NULL,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"action" "edit_action" NOT NULL,
	"label" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
CREATE TABLE "episode_render" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"render_status" "render_status" DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"format" text DEFAULT 'mp3' NOT NULL,
	"duration_ms" integer,
	"file_size_bytes" integer,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
CREATE TABLE "filter_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feed_id" text,
	"label" text NOT NULL,
	"filter_action" "filter_action" NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
CREATE TABLE "podcast_episode" (
	"id" text PRIMARY KEY NOT NULL,
	"feed_id" text NOT NULL,
	"asset_id" text,
	"guid" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_url" text NOT NULL,
	"published_at" text,
	"duration" integer,
	"status" "episode_status" DEFAULT 'queued' NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
CREATE TABLE "podcast_feed" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feed_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"author" text,
	"language" text,
	"total_episodes" integer,
	"refresh_interval_mins" integer DEFAULT 60 NOT NULL,
	"last_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
ALTER TABLE "episode_edit" ADD CONSTRAINT "episode_edit_episode_id_podcast_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_render" ADD CONSTRAINT "episode_render_episode_id_podcast_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_rule" ADD CONSTRAINT "filter_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_rule" ADD CONSTRAINT "filter_rule_feed_id_podcast_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."podcast_feed"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episode" ADD CONSTRAINT "podcast_episode_feed_id_podcast_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."podcast_feed"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episode" ADD CONSTRAINT "podcast_episode_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_feed" ADD CONSTRAINT "podcast_feed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_edit_episode_id_idx" ON "episode_edit" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_edit_episode_segment_idx" ON "episode_edit" USING btree ("episode_id","segment_index");--> statement-breakpoint
CREATE INDEX "episode_render_episode_id_idx" ON "episode_render" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "filter_rule_user_id_idx" ON "filter_rule" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "filter_rule_feed_id_idx" ON "filter_rule" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "podcast_episode_feed_id_idx" ON "podcast_episode" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "podcast_episode_guid_idx" ON "podcast_episode" USING btree ("feed_id","guid");