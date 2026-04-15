-- Add onboardingCompletedAt to User. Null = the pilot has never completed
-- (or skipped) the /welcome flow; the proxy redirects them there on first
-- visit. The admin "Rejouer l'onboarding" button clears this back to NULL
-- so the flow replays.
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: every existing account has already used the app — mark them
-- onboarded so the welcome screen doesn't ambush current pilots after
-- this migration ships. Uses createdAt as a stand-in for "long ago".
UPDATE "User"
   SET "onboardingCompletedAt" = "createdAt"
 WHERE "onboardingCompletedAt" IS NULL;
