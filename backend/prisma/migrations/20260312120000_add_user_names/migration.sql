ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

UPDATE "User"
SET
  "firstName" = COALESCE(
    NULLIF(INITCAP(SPLIT_PART(REPLACE(REPLACE(SPLIT_PART("email", '@', 1), '_', '.'), '-', '.'), '.', 1)), ''),
    'User'
  ),
  "lastName" = COALESCE(
    NULLIF(INITCAP(SPLIT_PART(REPLACE(REPLACE(SPLIT_PART("email", '@', 1), '_', '.'), '-', '.'), '.', 2)), ''),
    'User'
  )
WHERE "firstName" IS NULL OR "lastName" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL;