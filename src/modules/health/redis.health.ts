import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../shared/cache/redis.adapter';

/** Terminus custom indicator: PINGs Redis using the shared ioredis client. */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const pong: string = await this.client.ping();
      return pong === 'PONG'
        ? indicator.up()
        : indicator.down({ message: `unexpected reply: ${pong}` });
    } catch (err) {
      return indicator.down({
        message: err instanceof Error ? err.message : 'redis ping failed',
      });
    }
  }
}
