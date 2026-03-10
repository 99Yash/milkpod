CREATE TABLE "monthly_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period_start" date NOT NULL,
	"video_minutes_used" integer DEFAULT 0 NOT NULL,
	"visual_segments_used" integer DEFAULT 0 NOT NULL,
	"comments_generated" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "monthly_usage_user_period_uniq" UNIQUE("user_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;