CREATE INDEX "media_asset_user_id_idx" ON "media_asset" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "qa_thread_asset_user_idx" ON "qa_thread" USING btree ("asset_id","user_id");--> statement-breakpoint
CREATE INDEX "transcript_asset_id_idx" ON "transcript" USING btree ("asset_id");