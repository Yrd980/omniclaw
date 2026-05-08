ALTER TABLE "agents" ALTER COLUMN "success_rate" TYPE double precision USING "success_rate"::double precision;
ALTER TABLE "agents" ALTER COLUMN "delegation_success_rate" TYPE double precision USING "delegation_success_rate"::double precision;
