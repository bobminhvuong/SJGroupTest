import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../shared/cache/cache.contracts';
import { CacheTag } from '../../shared/cache/cache-keys';
import {
  formatOpenTimeRule,
  parseOpenTimeRule,
} from '../../common/open-time/open-time';
import { Department } from '../department/entities/department.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Location } from './entities/location.entity';
import { LocationType } from './enums/location-type.enum';

/** One tree node returned to the client (formatted openTimeRule + isBookable flag). */
export interface LocationNode {
  id: string;
  name: string;
  locationNumber: string;
  type: LocationType;
  parentId: string | null;
  departmentId: string | null;
  capacity: number | null;
  openTimeRule: string | null;
  isBookable: boolean;
  children: LocationNode[];
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly cache: CacheService,
  ) {}

  // ── CREATE ──────────────────────────────────────────────────────────────────
  async create(dto: CreateLocationDto): Promise<Location> {
    if (dto.parentId) {
      const parent = await this.locationRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent location not found');
    }

    await this.assertNumberFree(dto.locationNumber);

    const entity = this.locationRepo.create({
      name: dto.name,
      locationNumber: dto.locationNumber,
      type: dto.type,
      parentId: dto.parentId ?? null,
    });
    await this.applyBookableFields(entity, dto, dto.type);

    const saved = await this.locationRepo.save(entity);
    await this.invalidateTree();
    return saved;
  }

  // ── READ ────────────────────────────────────────────────────────────────────
  /** Nested tree (cached). rootId null = all root Buildings. */
  async getTree(rootId?: string): Promise<LocationNode[]> {
    if (rootId) {
      const exists = await this.locationRepo.findOne({ where: { id: rootId } });
      if (!exists) throw new NotFoundException('Root location not found');
    }

    return this.cache.remember(
      'LOCATION_TREE',
      { rootId: rootId ?? null },
      () => this.buildTree(rootId),
    );
  }

  /** Detail of a single node + its direct children. */
  async findOne(
    id: string,
  ): Promise<LocationNode & { children: LocationNode[] }> {
    const node = await this.locationRepo.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Location not found');

    const children = await this.locationRepo.find({
      where: { parentId: id },
      order: { locationNumber: 'ASC' },
    });
    const result = this.toNode(node);
    result.children = children.map((c) => this.toNode(c));
    return result;
  }

  /** Raw entity (for other modules such as Booking). Throws 404 if not found. */
  async getEntityOrFail(id: string): Promise<Location> {
    const node = await this.locationRepo.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Location not found');
    return node;
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    const node = await this.locationRepo.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Location not found');

    if (dto.locationNumber && dto.locationNumber !== node.locationNumber) {
      await this.assertNumberFree(dto.locationNumber);
      node.locationNumber = dto.locationNumber;
    }
    if (dto.name !== undefined) node.name = dto.name;

    if (dto.parentId !== undefined && dto.parentId !== node.parentId) {
      await this.assertNoCycle(id, dto.parentId);
      node.parentId = dto.parentId ?? null;
    }

    const nextType = dto.type ?? node.type;
    node.type = nextType;
    // On any bookable-attribute change or type change -> recompute the columns.
    if (
      dto.type !== undefined ||
      dto.departmentId !== undefined ||
      dto.capacity !== undefined ||
      dto.openTimeRule !== undefined
    ) {
      await this.applyBookableFields(node, dto, nextType, /* isUpdate */ true);
    }

    const saved = await this.locationRepo.save(node);
    await this.invalidateTree();
    return saved;
  }

  // ── DELETE (soft) ─────────────────────────────────────────────────────────────
  async remove(id: string): Promise<void> {
    const node = await this.locationRepo.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Location not found');

    const childCount = await this.locationRepo.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new ConflictException(
        `Location has ${childCount} active child node(s); delete or move them first`,
      );
    }

    await this.locationRepo.softRemove(node);
    await this.invalidateTree();
    this.logger.log(`Soft-deleted location ${node.locationNumber} (${id})`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private async assertNumberFree(locationNumber: string): Promise<void> {
    const dup = await this.locationRepo.findOne({ where: { locationNumber } });
    if (dup) {
      throw new ConflictException(
        `locationNumber "${locationNumber}" already exists`,
      );
    }
  }

  /** Fill/clear bookable columns by type. ROOM requires all; otherwise -> NULL. */
  private async applyBookableFields(
    entity: Location,
    dto: CreateLocationDto | UpdateLocationDto,
    type: LocationType,
    isUpdate = false,
  ): Promise<void> {
    if (type !== LocationType.ROOM) {
      entity.departmentId = null;
      entity.capacity = null;
      entity.openFrom = null;
      entity.openTo = null;
      entity.openDays = null;
      return;
    }

    // ROOM: take the new value (update) or fall back to the existing one.
    const departmentId =
      dto.departmentId ?? (isUpdate ? entity.departmentId : null);
    const capacity = dto.capacity ?? (isUpdate ? entity.capacity : null);

    if (!departmentId)
      throw new BadRequestException('ROOM requires departmentId');
    if (capacity == null)
      throw new BadRequestException('ROOM requires capacity');

    const dept = await this.departmentRepo.findOne({
      where: { id: departmentId },
    });
    if (!dept) throw new NotFoundException('Department not found');

    entity.departmentId = departmentId;
    entity.capacity = capacity;

    if (dto.openTimeRule !== undefined && dto.openTimeRule !== null) {
      const parsed = parseOpenTimeRule(dto.openTimeRule);
      if (!parsed) throw new BadRequestException('ROOM requires openTimeRule');
      entity.openFrom = parsed.openFrom;
      entity.openTo = parsed.openTo;
      entity.openDays = parsed.openDays;
    } else if (!isUpdate || entity.openDays == null) {
      throw new BadRequestException('ROOM requires openTimeRule');
    }
  }

  /** Disallow setting the parent to the node itself or one of its descendants (cycle). */
  private async assertNoCycle(
    nodeId: string,
    newParentId: string | null | undefined,
  ): Promise<void> {
    if (!newParentId) return;
    if (newParentId === nodeId) {
      throw new BadRequestException('A location cannot be its own parent');
    }
    const rows: Array<{ id: string }> = await this.locationRepo.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM location WHERE parent_id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT c.id FROM location c
         JOIN descendants d ON c.parent_id = d.id
         WHERE c.deleted_at IS NULL
       )
       SELECT id FROM descendants WHERE id = $2`,
      [nodeId, newParentId],
    );
    if (rows.length > 0) {
      throw new BadRequestException(
        'Cannot move a location under one of its descendants (cycle)',
      );
    }
  }

  /** Fetch the subtree (recursive CTE) then assemble it into a nested tree. */
  private async buildTree(rootId?: string): Promise<LocationNode[]> {
    const rows: Array<Record<string, unknown>> = await this.locationRepo.query(
      `WITH RECURSIVE subtree AS (
         SELECT * FROM location
         WHERE deleted_at IS NULL
           AND ( ($1::bigint IS NULL AND parent_id IS NULL) OR id = $1::bigint )
         UNION ALL
         SELECT c.* FROM location c
         JOIN subtree s ON c.parent_id = s.id
         WHERE c.deleted_at IS NULL
       )
       SELECT * FROM subtree ORDER BY location_number`,
      [rootId ?? null],
    );

    const nodes = new Map<string, LocationNode>();
    for (const row of rows) {
      const node = this.rawToNode(row);
      nodes.set(node.id, node);
    }

    const roots: LocationNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /** Map entity (camelCase) -> node response. */
  private toNode(loc: Location): LocationNode {
    return {
      id: loc.id,
      name: loc.name,
      locationNumber: loc.locationNumber,
      type: loc.type,
      parentId: loc.parentId,
      departmentId: loc.departmentId,
      capacity: loc.capacity,
      openTimeRule: formatOpenTimeRule({
        openDays: loc.openDays ?? [],
        openFrom: loc.openFrom ?? undefined,
        openTo: loc.openTo ?? undefined,
      }),
      isBookable: loc.isBookable,
      children: [],
    };
  }

  /** Map a raw row (snake_case from the raw query) -> node response. */
  private rawToNode(row: Record<string, unknown>): LocationNode {
    const openDays = (row.open_days as number[] | null) ?? [];
    const openFrom = (row.open_from as string | null) ?? undefined;
    const openTo = (row.open_to as string | null) ?? undefined;
    const type = row.type as LocationType;
    const departmentId = (row.department_id as string | null) ?? null;
    const capacity = (row.capacity as number | null) ?? null;
    return {
      id: row.id as string,
      name: row.name as string,
      locationNumber: row.location_number as string,
      type,
      parentId: (row.parent_id as string | null) ?? null,
      departmentId,
      capacity,
      openTimeRule: formatOpenTimeRule({ openDays, openFrom, openTo }),
      isBookable:
        type === LocationType.ROOM &&
        departmentId != null &&
        capacity != null &&
        openDays.length > 0,
      children: [],
    };
  }

  private async invalidateTree(): Promise<void> {
    await this.cache.invalidateTag(CacheTag.LOCATION);
  }
}
