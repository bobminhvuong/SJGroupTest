import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationTypeEntity } from '../entities/location-type.entity';
import { CreateLocationTypeDto } from '../dto/create-location-type.dto';
import { UpdateLocationTypeDto } from '../dto/update-location-type.dto';

@Injectable()
export class LocationTypeService {
  constructor(
    @InjectRepository(LocationTypeEntity)
    private readonly repo: Repository<LocationTypeEntity>,
  ) {}

  // ── CREATE ──────────────────────────────────────────────────────────────────
  async create(dto: CreateLocationTypeDto): Promise<LocationTypeEntity> {
    await this.assertCodeFree(dto.code);
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  // ── READ ────────────────────────────────────────────────────────────────────
  findAll(): Promise<LocationTypeEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findOne(id: string): Promise<LocationTypeEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`LocationType #${id} not found`);
    return entity;
  }

  /** Resolve a type by its code (used by LocationService to validate + read is_bookable). */
  async getByCodeOrFail(code: string): Promise<LocationTypeEntity> {
    const entity = await this.repo.findOne({ where: { code } });
    if (!entity) {
      throw new BadRequestException(`Unknown location type "${code}"`);
    }
    return entity;
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateLocationTypeDto,
  ): Promise<LocationTypeEntity> {
    const entity = await this.findOne(id);

    if (dto.code && dto.code !== entity.code) {
      await this.assertCodeFree(dto.code);
      entity.code = dto.code;
    }
    if (dto.label !== undefined) entity.label = dto.label;
    if (dto.isBookable !== undefined) entity.isBookable = dto.isBookable;

    return this.repo.save(entity);
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);

    // Guard: block if any location row still references this type code.
    const inUse: Array<{ count: string }> = await this.repo.query(
      `SELECT COUNT(*)::text AS count FROM locations WHERE type = $1 AND deleted_at IS NULL`,
      [entity.code],
    );
    if (parseInt(inUse[0].count, 10) > 0) {
      throw new ConflictException(
        `LocationType "${entity.code}" is referenced by ${inUse[0].count} active location(s)`,
      );
    }

    await this.repo.delete(id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  private async assertCodeFree(code: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { code } });
    if (existing)
      throw new ConflictException(`LocationType code "${code}" already exists`);
  }
}
