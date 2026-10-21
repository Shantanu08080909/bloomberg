CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" integer NOT NULL,
	"kind" text NOT NULL,
	"threshold" numeric(20, 6) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"repeat" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_triggered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_fundamentals" (
	"instrument_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"as_of" date NOT NULL,
	"market_cap_cr" numeric(20, 4),
	"shares_outstanding" bigint,
	"pe" numeric(20, 6),
	"pb" numeric(20, 6),
	"eps" numeric(20, 4),
	"book_value_per_share" numeric(20, 4),
	"roe" numeric(20, 6),
	"debt_to_equity" numeric(20, 6),
	"dividend_yield" numeric(20, 6),
	"revenue_growth" numeric(20, 6),
	"profit_growth" numeric(20, 6),
	"beta" numeric(20, 6),
	CONSTRAINT "company_fundamentals_instrument_id_source_id_pk" PRIMARY KEY("instrument_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "corporate_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"action_type" text NOT NULL,
	"ex_date" date NOT NULL,
	"record_date" date,
	"details" jsonb NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_refresh_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"dataset" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_status" text NOT NULL,
	"homepage" text,
	"terms_note" text DEFAULT '' NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"refresh_interval_minutes" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"source_id" text,
	"title" text NOT NULL,
	"country" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"importance" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_observations" (
	"series_id" text NOT NULL,
	"period_date" date NOT NULL,
	"value" numeric(20, 6),
	CONSTRAINT "economic_observations_series_id_period_date_pk" PRIMARY KEY("series_id","period_date")
);
--> statement-breakpoint
CREATE TABLE "economic_series" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"frequency" text NOT NULL,
	"source_id" text NOT NULL,
	"source_series_id" text,
	"description" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "financial_statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"statement_type" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"unit" text DEFAULT 'crore' NOT NULL,
	"line_items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_constituents" (
	"index_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"weight" numeric(20, 6) NOT NULL,
	CONSTRAINT "index_constituents_index_id_instrument_id_pk" PRIMARY KEY("index_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "index_metadata" (
	"instrument_id" integer PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"base_value" numeric(20, 4) NOT NULL,
	"base_date" date NOT NULL,
	"methodology" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"name" text NOT NULL,
	"isin" text,
	"exchange_code" text,
	"issuer_key" text,
	"instrument_type" text NOT NULL,
	"sector" text,
	"industry" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"source_id" text NOT NULL,
	"description" text,
	"listed_since" date
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text,
	"publisher" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"tickers" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"alert_id" integer,
	"channel" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data_status" text,
	"data_as_of" timestamp with time zone,
	"delivery_status" text DEFAULT 'delivered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'INR' NOT NULL,
	"benchmark_instrument_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_bars" (
	"instrument_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"date" date NOT NULL,
	"open" numeric(20, 4) NOT NULL,
	"high" numeric(20, 4) NOT NULL,
	"low" numeric(20, 4) NOT NULL,
	"close" numeric(20, 4) NOT NULL,
	"volume" bigint NOT NULL,
	CONSTRAINT "price_bars_instrument_id_source_id_date_pk" PRIMARY KEY("instrument_id","source_id","date")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"base_currency" text DEFAULT 'INR' NOT NULL,
	"notification_prefs" jsonb DEFAULT '{"inApp":true,"email":false}'::jsonb NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"instrument_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"price" numeric(20, 4) NOT NULL,
	"open" numeric(20, 4),
	"high" numeric(20, 4),
	"low" numeric(20, 4),
	"prev_close" numeric(20, 4),
	"change" numeric(20, 4),
	"change_pct" numeric(20, 6),
	"volume" bigint,
	"as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_status" text NOT NULL,
	CONSTRAINT "quotes_instrument_id_source_id_pk" PRIMARY KEY("instrument_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "research_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" integer,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_articles" (
	"user_id" uuid NOT NULL,
	"article_id" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_articles_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "saved_screeners" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"type" text NOT NULL,
	"trade_date" date NOT NULL,
	"quantity" numeric(24, 6) DEFAULT 0 NOT NULL,
	"price" numeric(20, 4) DEFAULT 0 NOT NULL,
	"fees" numeric(20, 4) DEFAULT 0 NOT NULL,
	"amount" numeric(20, 4),
	"split_ratio" numeric(20, 6),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"watchlist_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fundamentals" ADD CONSTRAINT "company_fundamentals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fundamentals" ADD CONSTRAINT "company_fundamentals_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_refresh_runs" ADD CONSTRAINT "data_refresh_runs_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_observations" ADD CONSTRAINT "economic_observations_series_id_economic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."economic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_series" ADD CONSTRAINT "economic_series_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_constituents" ADD CONSTRAINT "index_constituents_index_id_instruments_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_constituents" ADD CONSTRAINT "index_constituents_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_metadata" ADD CONSTRAINT "index_metadata_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_benchmark_instrument_id_instruments_id_fk" FOREIGN KEY ("benchmark_instrument_id") REFERENCES "public"."instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_bars" ADD CONSTRAINT "price_bars_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_bars" ADD CONSTRAINT "price_bars_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_screeners" ADD CONSTRAINT "saved_screeners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_layouts" ADD CONSTRAINT "workspace_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corp_actions_instrument_idx" ON "corporate_actions" USING btree ("instrument_id","ex_date");--> statement-breakpoint
CREATE INDEX "refresh_runs_source_idx" ON "data_refresh_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "econ_events_time_idx" ON "economic_events" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_statements_uq" ON "financial_statements" USING btree ("instrument_id","source_id","statement_type","fiscal_year");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_exchange_symbol_uq" ON "instruments" USING btree ("exchange","symbol","source_id");--> statement-breakpoint
CREATE INDEX "instruments_name_idx" ON "instruments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "instruments_isin_idx" ON "instruments" USING btree ("isin");--> statement-breakpoint
CREATE UNIQUE INDEX "news_source_external_uq" ON "news_articles" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notification_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_user_name_uq" ON "portfolios" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "price_bars_date_idx" ON "price_bars" USING btree ("date");--> statement-breakpoint
CREATE INDEX "notes_user_idx" ON "research_notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_screeners_user_name_uq" ON "saved_screeners" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_idx" ON "transactions" USING btree ("portfolio_id","trade_date");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_uq" ON "watchlist_items" USING btree ("watchlist_id","instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_user_name_uq" ON "watchlists" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_user_name_uq" ON "workspace_layouts" USING btree ("user_id","name");