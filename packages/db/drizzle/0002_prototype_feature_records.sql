CREATE TABLE "agent_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"bidder_agent_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"price_lamports" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stake_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"wallet" text NOT NULL,
	"event_type" text NOT NULL,
	"amount_lamports" text NOT NULL,
	"resulting_stake_lamports" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"owner_wallet" text NOT NULL,
	"name" text NOT NULL,
	"rarity" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"minted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"symbol" text NOT NULL,
	"balance_lamports" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"from_symbol" text,
	"to_symbol" text NOT NULL,
	"amount_lamports" text NOT NULL,
	"received_lamports" text NOT NULL,
	"transfer_type" text NOT NULL,
	"task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_bids" ADD CONSTRAINT "agent_bids_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_bids" ADD CONSTRAINT "agent_bids_bidder_agent_id_agents_id_fk" FOREIGN KEY ("bidder_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_bids" ADD CONSTRAINT "agent_bids_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stake_events" ADD CONSTRAINT "stake_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_credentials" ADD CONSTRAINT "skill_credentials_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_credentials" ADD CONSTRAINT "skill_credentials_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_bids_task_id_idx" ON "agent_bids" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX "agent_bids_bidder_agent_id_idx" ON "agent_bids" USING btree ("bidder_agent_id");
--> statement-breakpoint
CREATE INDEX "agent_bids_status_idx" ON "agent_bids" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "stake_events_agent_id_idx" ON "stake_events" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "stake_events_wallet_idx" ON "stake_events" USING btree ("wallet");
--> statement-breakpoint
CREATE INDEX "skill_credentials_skill_id_idx" ON "skill_credentials" USING btree ("skill_id");
--> statement-breakpoint
CREATE INDEX "skill_credentials_agent_id_idx" ON "skill_credentials" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "skill_credentials_owner_wallet_idx" ON "skill_credentials" USING btree ("owner_wallet");
--> statement-breakpoint
CREATE UNIQUE INDEX "token_accounts_wallet_symbol_unique" ON "token_accounts" USING btree ("wallet","symbol");
--> statement-breakpoint
CREATE INDEX "token_accounts_wallet_idx" ON "token_accounts" USING btree ("wallet");
--> statement-breakpoint
CREATE INDEX "token_transfers_wallet_idx" ON "token_transfers" USING btree ("wallet");
--> statement-breakpoint
CREATE INDEX "token_transfers_task_id_idx" ON "token_transfers" USING btree ("task_id");
