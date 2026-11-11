-- Least-privilege database roles for production.
--
-- Prisma migrations need DDL; the running API does not. Two roles:
--   polarsight_migrate  owns the schema, used only by `db:deploy`
--   polarsight_app      DML only, used by the API's DATABASE_URL
--
-- Run as a superuser once, then point the API at polarsight_app.
-- Audit log rows must never be updated or deleted by the application
-- role; only INSERT and SELECT are granted on it.

CREATE ROLE polarsight_migrate LOGIN PASSWORD :'migrate_password' NOINHERIT;
CREATE ROLE polarsight_app     LOGIN PASSWORD :'app_password'     NOINHERIT CONNECTION LIMIT 20;

GRANT CONNECT ON DATABASE polarsight TO polarsight_app, polarsight_migrate;
ALTER SCHEMA public OWNER TO polarsight_migrate;

-- Application role: data only.
GRANT USAGE ON SCHEMA public TO polarsight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO polarsight_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO polarsight_app;
ALTER DEFAULT PRIVILEGES FOR ROLE polarsight_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO polarsight_app;
ALTER DEFAULT PRIVILEGES FOR ROLE polarsight_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO polarsight_app;

-- The audit trail is append-only for the application.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM polarsight_app;
REVOKE UPDATE, DELETE, TRUNCATE ON content_versions FROM polarsight_app;
GRANT DELETE ON content_versions TO polarsight_app; -- pruning keeps the 50 newest; see lib/versioning.ts

-- Nobody but the migration role can change the schema.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, polarsight_app;
