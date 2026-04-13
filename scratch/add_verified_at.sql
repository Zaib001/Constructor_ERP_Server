ALTER TABLE "auth"."execution_tasks" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(6);
