CREATE TABLE "qa_visual_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"video_context_segment_id" text NOT NULL,
	"relevance_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "qa_visual_evidence_message_segment_uniq" UNIQUE("message_id","video_context_segment_id")
);
--> statement-breakpoint
ALTER TABLE "qa_visual_evidence" ADD CONSTRAINT "qa_visual_evidence_message_id_qa_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."qa_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_visual_evidence" ADD CONSTRAINT "qa_visual_evidence_video_context_segment_id_video_context_segment_id_fk" FOREIGN KEY ("video_context_segment_id") REFERENCES "public"."video_context_segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_visual_evidence_message_id_idx" ON "qa_visual_evidence" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "qa_visual_evidence_segment_id_idx" ON "qa_visual_evidence" USING btree ("video_context_segment_id");