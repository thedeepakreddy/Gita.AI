-- Existing PostgreSQL deployments applied 0_init before wallpaperIndex existed.
-- Fresh deployments already receive this column in the generated baseline.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "wallpaperIndex" INTEGER;
