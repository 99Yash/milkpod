DROP INDEX "qa_message_part_message_id_idx";--> statement-breakpoint
DROP INDEX "qa_message_thread_id_idx";--> statement-breakpoint
CREATE INDEX "qa_message_part_message_sort_idx" ON "qa_message_part" USING btree ("message_id","sort_order");--> statement-breakpoint
CREATE INDEX "qa_message_thread_created_idx" ON "qa_message" USING btree ("thread_id","created_at");