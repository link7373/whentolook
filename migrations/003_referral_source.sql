-- 003_referral_source.sql
--
-- Records where a subscriber came from, e.g. "share-iss" when a friend tapped
-- the "Text a friend" link in an ISS alert, or "forwarded" from a forwarded
-- email. It answers "which alerts actually bring in signups?"
--
-- Nullable and write-once: set only on a subscriber's first signup.

ALTER TABLE subscribers ADD COLUMN referral_source TEXT;
