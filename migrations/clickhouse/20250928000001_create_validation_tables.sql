-- Create Null engine validation tables for ILLEGAL_AGGREGATION prevention
-- These tables have identical schema to production tables but use Null engine
-- for zero-cost SQL validation that catches semantic errors instantly
--
-- This approach is DRY: validation tables are automatically created from existing tables
-- using CREATE TABLE AS syntax with ENGINE = Null override

-- Get all table names from current database and create validation tables
-- Note: This requires the base tables to exist first (run after initial schema)

-- Create validation tables dynamically for all tables in otel database
-- Note: Table list is maintained in src/storage/config.ts REQUIRED_TABLES
CREATE TABLE IF NOT EXISTS traces_validation AS traces ENGINE = Null;
CREATE TABLE IF NOT EXISTS ai_anomalies_validation AS ai_anomalies ENGINE = Null;
CREATE TABLE IF NOT EXISTS ai_service_baselines_validation AS ai_service_baselines ENGINE = Null;