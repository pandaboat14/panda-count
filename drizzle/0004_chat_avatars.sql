CREATE TABLE "game_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"avatar" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_messages" ADD CONSTRAINT "game_messages_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_messages_game" ON "game_messages" USING btree ("game_id","id");