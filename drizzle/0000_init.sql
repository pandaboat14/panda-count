CREATE TYPE "public"."panda_sex" AS ENUM('Male', 'Female');--> statement-breakpoint
CREATE TYPE "public"."panda_status" AS ENUM('resident', 'incoming');--> statement-breakpoint
CREATE TABLE "pandas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"chinese" text DEFAULT '' NOT NULL,
	"sex" "panda_sex" NOT NULL,
	"born" text NOT NULL,
	"origin" text DEFAULT 'Sichuan Province' NOT NULL,
	"birthplace" text DEFAULT '' NOT NULL,
	"zoo_id" integer NOT NULL,
	"arrived" text,
	"status" "panda_status" NOT NULL,
	"fact" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"updated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoos" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"url" text,
	CONSTRAINT "zoos_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "pandas" ADD CONSTRAINT "pandas_zoo_id_zoos_id_fk" FOREIGN KEY ("zoo_id") REFERENCES "public"."zoos"("id") ON DELETE no action ON UPDATE no action;