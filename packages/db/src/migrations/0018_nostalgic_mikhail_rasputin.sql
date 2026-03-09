CREATE TABLE "video_context_embedding" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"dimensions" integer DEFAULT 1536 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
CREATE TABLE "video_context_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"summary" text NOT NULL,
	"ocr_text" text,
	"entities" jsonb,
	"confidence" real,
	"provider_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
ALTER TABLE "video_context_embedding" ADD CONSTRAINT "video_context_embedding_segment_id_video_context_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."video_context_segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_context_segment" ADD CONSTRAINT "video_context_segment_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_context_embedding_segment_id_idx" ON "video_context_embedding" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "video_context_embedding_hnsw_idx" ON "video_context_embedding" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "video_context_segment_asset_id_idx" ON "video_context_segment" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "video_context_segment_start_time_idx" ON "video_context_segment" USING btree ("asset_id","start_time");