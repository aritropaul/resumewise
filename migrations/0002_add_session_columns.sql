-- Add missing Better Auth session columns
ALTER TABLE session ADD COLUMN ipAddress TEXT;
ALTER TABLE session ADD COLUMN userAgent TEXT;
