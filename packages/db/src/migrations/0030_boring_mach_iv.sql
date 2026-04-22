CREATE TYPE "public"."asset_member_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "asset_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "asset_member_role" NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "asset_invite_asset_email_unique" UNIQUE("asset_id","email")
);
--> statement-breakpoint
CREATE TABLE "asset_member" (
	"asset_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "asset_member_role" NOT NULL,
	"invited_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "asset_member_asset_id_user_id_pk" PRIMARY KEY("asset_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "asset_invite" ADD CONSTRAINT "asset_invite_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_invite" ADD CONSTRAINT "asset_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_member" ADD CONSTRAINT "asset_member_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_member" ADD CONSTRAINT "asset_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_member" ADD CONSTRAINT "asset_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_invite_email_idx" ON "asset_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "asset_member_user_idx" ON "asset_member" USING btree ("user_id");