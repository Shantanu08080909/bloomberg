CREATE TABLE "import_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"format" text NOT NULL,
	"exchange" text,
	"origin" text NOT NULL,
	"mode" text NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"source_url" text,
	"trade_date_from" date,
	"trade_date_to" date,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_accepted" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"bars_written" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"imported_by" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_snapshots" (
	"instrument_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"as_of" date NOT NULL,
	"sma50" numeric(20, 4),
	"sma200" numeric(20, 4),
	"rsi14" numeric(20, 6),
	"volatility30" numeric(20, 6),
	"avg_volume20" numeric(20, 6),
	"high_52w" numeric(20, 4),
	"low_52w" numeric(20, 4),
	"return_1y" numeric(20, 6),
	"bars" integer NOT NULL,
	CONSTRAINT "technical_snapshots_instrument_id_source_id_pk" PRIMARY KEY("instrument_id","source_id")
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "series" text;--> statement-breakpoint
ALTER TABLE "price_bars" ADD COLUMN "prev_close" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "price_bars" ADD COLUMN "turnover" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "price_bars" ADD COLUMN "trades" bigint;--> statement-breakpoint
ALTER TABLE "price_bars" ADD COLUMN "import_id" integer;--> statement-breakpoint
ALTER TABLE "price_bars" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_snapshots" ADD CONSTRAINT "technical_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_snapshots" ADD CONSTRAINT "technical_snapshots_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_files_sha_idx" ON "import_files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "import_files_source_idx" ON "import_files" USING btree ("source_id","imported_at");--> statement-breakpoint
CREATE INDEX "price_bars_source_date_idx" ON "price_bars" USING btree ("source_id","date");