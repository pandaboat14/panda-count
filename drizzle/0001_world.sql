CREATE TYPE "public"."place_kind" AS ENUM('zoo', 'breeding_center');--> statement-breakpoint
CREATE TABLE "wild_ranges" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"province" text NOT NULL,
	"estimate" integer NOT NULL,
	"survey" text NOT NULL,
	"source_url" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"span_lat" double precision NOT NULL,
	"span_lng" double precision NOT NULL,
	"angle" double precision DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_by_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wild_ranges_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "world_places" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "place_kind" DEFAULT 'zoo' NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"count" integer NOT NULL,
	"incoming" integer DEFAULT 0 NOT NULL,
	"names" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"as_of" text NOT NULL,
	"source_url" text,
	"updated_by" text,
	"updated_by_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zoos" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "zoos" ADD COLUMN "lng" double precision;