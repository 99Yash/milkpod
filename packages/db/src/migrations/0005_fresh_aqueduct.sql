CREATE TABLE "share_query" (
	"id" text PRIMARY KEY NOT NULL,
	"share_link_id" text NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
ALTER TABLE "share_query" ADD CONSTRAINT "share_query_share_link_id_share_link_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_link"("id") ON DELETE cascade ON UPDATE no action;