-- seed.sql — Insert default seed data after all migrations have run.
-- Run AFTER schema.sql or after all migrations.

-- Default staff user (used by the frontend when no auth is configured)
INSERT INTO users (id, display_name, email)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Hospital Staff',
    'staff@houston-hospital.local'
)
ON CONFLICT (email) DO NOTHING;
