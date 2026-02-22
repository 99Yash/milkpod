CREATE TABLE "qa_message_part" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"type" text NOT NULL,
	"text_content" text,
	"tool_call_id" text,
	"tool_name" text,
	"tool_state" text,
	"tool_input" jsonb,
	"tool_output" jsonb,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qa_message_part" ADD CONSTRAINT "qa_message_part_message_id_qa_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."qa_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_message_part_message_id_idx" ON "qa_message_part" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "qa_message" DROP COLUMN "parts";