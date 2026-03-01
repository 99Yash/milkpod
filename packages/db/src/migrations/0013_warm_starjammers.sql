CREATE INDEX "collection_item_collection_id_idx" ON "collection_item" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_item_asset_id_idx" ON "collection_item" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "media_asset_user_status_idx" ON "media_asset" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "qa_evidence_message_id_idx" ON "qa_evidence" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "qa_evidence_segment_id_idx" ON "qa_evidence" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "share_query_link_created_idx" ON "share_query" USING btree ("share_link_id","created_at");--> statement-breakpoint
CREATE INDEX "transcript_segment_transcript_index_idx" ON "transcript_segment" USING btree ("transcript_id","segment_index");