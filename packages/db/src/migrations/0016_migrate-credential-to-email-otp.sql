-- Migrate existing email+password accounts to email-otp provider
UPDATE "account" SET "provider_id" = 'email-otp' WHERE "provider_id" = 'credential';
