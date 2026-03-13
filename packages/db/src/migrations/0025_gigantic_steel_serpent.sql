CREATE INDEX "collection_user_created_idx" ON "collection" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_asset_source_user_idx" ON "media_asset" USING btree ("source_id","user_id");--> statement-breakpoint
CREATE INDEX "podcast_feed_user_created_idx" ON "podcast_feed" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "qa_thread_user_created_idx" ON "qa_thread" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "share_link_user_revoked_created_idx" ON "share_link" USING btree ("user_id","revoked_at","created_at");