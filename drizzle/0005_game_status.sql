CREATE TABLE "app_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "app_errors_at" ON "app_errors" USING btree ("at");