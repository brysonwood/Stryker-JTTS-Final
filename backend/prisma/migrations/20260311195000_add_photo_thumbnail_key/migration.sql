-- Add nullable thumbnail key so generated thumbnails can be tracked.
ALTER TABLE "Photo" ADD COLUMN "thumbnailKey" VARCHAR(500);
