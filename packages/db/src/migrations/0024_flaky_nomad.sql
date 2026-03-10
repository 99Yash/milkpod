CREATE TYPE "public"."billing_provider" AS ENUM('polar', 'razorpay');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TABLE "billing_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "billing_customer_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "billing_customer_provider_customer_id_unique" UNIQUE("provider_customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "billing_subscription_provider_sub_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "billing_webhook_event_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
ALTER TABLE "billing_customer" ADD CONSTRAINT "billing_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_subscription_user_id_idx" ON "billing_subscription" USING btree ("user_id");