ALTER TABLE "game_players" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "game_players" ADD COLUMN "notify" boolean DEFAULT true NOT NULL;