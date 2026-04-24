CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"resource_type" text,
	"resource_id" text,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_recipient_created_idx" ON "notification" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_recipient_unread_idx" ON "notification" USING btree ("recipient_id") WHERE "notification"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notification_recipient_row_version_idx" ON "notification" USING btree ("recipient_id","row_version");