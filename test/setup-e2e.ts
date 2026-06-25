/**
 * Chạy TRƯỚC khi import AppModule (qua jest setupFiles). Ép mọi biến DB_* sang bộ
 * DB_TEST_* để e2e đụng database `booking_test`, KHÔNG ảnh hưởng DB dev.
 *
 * dotenv không ghi đè biến đã có sẵn trong process.env, nên việc set ở đây sẽ
 * "thắng" giá trị trong .env khi ConfigModule nạp sau đó.
 */
import 'dotenv/config';

process.env.DB_HOST = process.env.DB_TEST_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_TEST_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_TEST_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_TEST_PASSWORD ?? 'postgres';
process.env.DB_DATABASE = process.env.DB_TEST_DATABASE ?? 'booking_test';
process.env.NODE_ENV = 'test';
