/**
 * Runs BEFORE AppModule is imported (via jest setupFiles). Overrides all DB_* variables
 * with the DB_TEST_* set so e2e tests hit `booking_test`, leaving the dev database untouched.
 *
 * dotenv does not overwrite variables already present in process.env, so values set here
 * take precedence over anything in .env when ConfigModule loads later.
 */
import 'dotenv/config';

process.env.DB_HOST = process.env.DB_TEST_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_TEST_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_TEST_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_TEST_PASSWORD ?? 'postgres';
process.env.DB_DATABASE = process.env.DB_TEST_DATABASE ?? 'booking_test';
process.env.NODE_ENV = 'test';
