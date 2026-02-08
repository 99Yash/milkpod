-- Redesign qa_message to store UIMessage shape (parts[] as JSONB)
-- Drop old flat columns and add new UIMessage-aligned ones

ALTER TABLE "qa_message" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "qa_message" DROP COLUMN "tool_name";--> statement-breakpoint
ALTER TABLE "qa_message" DROP COLUMN "tool_input";--> statement-breakpoint
ALTER TABLE "qa_message" DROP COLUMN "tool_output";--> statement-breakpoint
ALTER TABLE "qa_message" ADD COLUMN "parts" jsonb NOT NULL DEFAULT '[]';--> statement-breakpoint
-- Change role from message_role enum to plain text
ALTER TABLE "qa_message" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
-- Drop the now-unused enum type
DROP TYPE "public"."message_role";--> statement-breakpoint
-- Remove the default on parts (was only needed for the ALTER ADD)
ALTER TABLE "qa_message" ALTER COLUMN "parts" DROP DEFAULT;
