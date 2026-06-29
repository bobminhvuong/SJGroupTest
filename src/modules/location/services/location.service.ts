import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CacheService } from '../../../shared/cache/cache.contracts';
import { CacheTag } from '../../../shared/cache/cache-keys';
import {
  formatOpenTimeRule,
  parseOpenTimeRule,
} from '../../../common/open-time/open-time';
import { PagedResult } from '../../../common/dto/paged-result';
import { Department } from '../../department/entities/department.entity';
import { CreateLocationDto } from '../dto/create-location.dto';
import { UpdateLocationDto } from '../dto/update-location.dto';
import { Location } from '../entities/location.entity';
import { LocationTypeService } from './location-type.service';

/** One tree node returned to the client (formatted openTimeRule + isBookable flag). */
export interface LocationNode {
  id: string;
  name: string;
  locationNumber: string;
  type: string;
  parentId: string | null;
  capacity: number | null;
  openTimeRule: string | null;
  isBookable: boolean;
  /** Ids of departments allowed to book this node (empty for non-bookable nodes). */
  departmentIds: string[];
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
    private readonly locationTypeService: LocationTypeService,
  ) {}

  // ── CREATE ──────────────────────────────────────────────────────────────────
  async create(dto: CreateLocationDto): Promise<Location> {
    let parent: Location | null = null;
    if (dto.parentId) {
      parent = await this.locationRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent location not found');
    }

    // Placement rule: a type may only be a root / placed under certain parent types.
    await this.assertPlacementAllowed(dto.type, parent);

    await this.assertNumberFree(dto.locationNumber);

    const entity = this.locationRepo.create({
      name: dto.name,
      locationNumber: dto.locationNumber,
      type: dto.type,
      parentId: dto.parentId ?? null,
    });
    const bookable = await this.applyBookableFields(entity, dto, dto.type);
    entity.departments = await this.resolveDepartments(
      bookable,
      dto.departmentIds,
      dto.type,
    );

    const saved = await this.locationRepo.save(entity);
    await this.invalidateTree();
    return saved;
  }

  // ── READ ────────────────────────────────────────────────────────────────────
  /** Nested tree (cached). rootId null = all root Buildings. Optional type filter. */
  async getTree(rootId?: string, type?: string): Promise<LocationNode[]> {
    if (rootId) {
      const exists = await this.locationRepo.findOne({ where: { id: rootId } });
      if (!exists) throw new NotFoundException('Root location not found');
    }

    return this.cache.remember(
      'LOCATION_TREE',
      { rootId: rootId ?? null, type: type ?? null },
      () => this.buildTree(rootId, type),
    );
  }

  /** Detail of a single node + its direct children. */
  async findOne(
    id: string,
  ): Promise<LocationNode & { children: LocationNode[] }> {
    const node = await this.locationRepo.findOne({
      where: { id },
      relations: { departments: true },
    });
    if (!node) throw new NotFoundException('Location not found');

    const children = await this.locationRepo.find({
      where: { parentId: id },
      relations: { departments: true },
      order: { locationNumber: 'ASC' },
    });
    const result = this.toNode(node);
    result.children = children.map((c) => this.toNode(c));
    return result;
  }

  /**
   * Raw entity + its allowed departments (for other modules such as Booking, which needs
   * the department set to enforce the Department Matching rule). Throws 404 if not found.
   */
  async getEntityOrFail(id: string): Promise<Location> {
    const node = await this.locationRepo.findOne({
      where: { id },
      relations: { departments: true },
    });
    if (!node) throw new NotFoundException('Location not found');
    return node;
  }

  /** List parent locations (nodes with parent_id IS NULL only) with pagination. */
  async listParents(query: {
    page: number;
    limit: number;
    type?: string;
  }): Promise<PagedResult<LocationNode>> {
    const { page, limit, type } = query;

    const qb = this.locationRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.departments', 'departments')
      .where('l.deleted_at IS NULL')
      .andWhere('l.parent_id IS NULL');

    if (type) {
      qb.andWhere('l.type = :type', { type });
    }

    const [parents, total] = await qb
      .orderBy('l.location_number', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return new PagedResult(
      parents.map((loc) => this.toNode(loc)),
      total,
      page,
      limit,
    );
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    const node = await this.locationRepo.findOne({
      where: { id },
      relations: { departments: true },
    });
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

    // Re-validate placement when type or parent changes (the resulting node must still
    // satisfy its type's allow_root / allowed_parent_types rule).
    if (dto.type !== undefined || dto.parentId !== undefined) {
      let parent: Location | null = null;
      if (node.parentId) {
        parent = await this.locationRepo.findOne({
          where: { id: node.parentId },
        });
        if (!parent) throw new NotFoundException('Parent location not found');
      }
      await this.assertPlacementAllowed(nextType, parent);
    }

    node.type = nextType;
    let bookable = node.isBookable;
    if (
      dto.type !== undefined ||
      dto.capacity !== undefined ||
      dto.openTimeRule !== undefined
    ) {
      bookable = await this.applyBookableFields(node, dto, nextType, true);
    } else {
      bookable = (await this.locationTypeService.getByCodeOrFail(nextType))
        .isBookable;
    }

    // Departments: clear when the node is no longer bookable; otherwise replace only
    // when the caller sent departmentIds (undefined = leave the existing set untouched).
    if (!bookable) {
      node.departments = [];
    } else if (dto.departmentIds !== undefined) {
      node.departments = await this.resolveDepartments(
        bookable,
        dto.departmentIds,
        nextType,
      );
    }

    const saved = await this.locationRepo.save(node);
    await this.invalidateTree();
    return saved;
  }

  // ── DELETE (soft) ────────────────────────────────────────────────────────────
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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  private async assertNumberFree(locationNumber: string): Promise<void> {
    const dup = await this.locationRepo.findOne({ where: { locationNumber } });
    if (dup) {
      throw new ConflictException(
        `locationNumber "${locationNumber}" already exists`,
      );
    }
  }

  /**
   * Location-placement rule (data-driven from location_types):
   *  - no parent  -> the type must allow being a root (allow_root = true);
   *  - has parent -> the parent's type must be in the type's allowed_parent_types.
   * Throws 400 with a clear message otherwise.
   */
  private async assertPlacementAllowed(
    typeCode: string,
    parent: Location | null,
  ): Promise<void> {
    const lt = await this.locationTypeService.getByCodeOrFail(typeCode);
    const allowed = lt.allowedParentTypes ?? [];

    if (!parent) {
      if (!lt.allowRoot) {
        const hint = allowed.length
          ? `it must be placed under: ${allowed.join(', ')}`
          : 'it has no valid parent types configured';
        throw new BadRequestException(
          `"${typeCode}" cannot be a root node; ${hint}`,
        );
      }
      return;
    }

    if (!allowed.includes(parent.type)) {
      const hint = allowed.length ? allowed.join(', ') : '(root only)';
      throw new BadRequestException(
        `"${typeCode}" cannot be placed under "${parent.type}"; allowed parent types: ${hint}`,
      );
    }
  }

  /**
   * Fill/clear bookable columns based on the type's is_bookable flag (read from the
   * location_types table — not a hardcoded code). A bookable type requires capacity +
   * open time; any other type clears them to NULL.
   */
  private async applyBookableFields(
    entity: Location,
    dto: CreateLocationDto | UpdateLocationDto,
    type: string,
    isUpdate = false,
  ): Promise<boolean> {
    const locationType = await this.locationTypeService.getByCodeOrFail(type);

    if (!locationType.isBookable) {
      entity.capacity = null;
      entity.openFrom = null;
      entity.openTo = null;
      entity.openDays = null;
      return false;
    }

    const capacity = dto.capacity ?? (isUpdate ? entity.capacity : null);
    if (capacity == null)
      throw new BadRequestException(`${type} requires capacity`);
    entity.capacity = capacity;

    if (dto.openTimeRule !== undefined && dto.openTimeRule !== null) {
      const parsed = parseOpenTimeRule(dto.openTimeRule);
      if (!parsed)
        throw new BadRequestException(`${type} requires openTimeRule`);
      entity.openFrom = parsed.openFrom;
      entity.openTo = parsed.openTo;
      entity.openDays = parsed.openDays;
    } else if (!isUpdate || entity.openDays == null) {
      throw new BadRequestException(`${type} requires openTimeRule`);
    }
    return true;
  }

  /**
   * Resolve + validate the department set for a node. A bookable node must list at least
   * one existing department (so the Department Matching rule is enforceable); a
   * non-bookable node never carries departments.
   */
  private async resolveDepartments(
    bookable: boolean,
    departmentIds: string[] | null | undefined,
    type: string,
  ): Promise<Department[]> {
    if (!bookable) return [];

    const ids = [...new Set(departmentIds ?? [])];
    if (ids.length === 0) {
      throw new BadRequestException(
        `${type} requires at least one departmentId`,
      );
    }

    const departments = await this.departmentRepo.find({
      where: { id: In(ids) },
    });
    if (departments.length !== ids.length) {
      const found = new Set(departments.map((d) => d.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Unknown departmentId(s): ${missing.join(', ')}`,
      );
    }
    return departments;
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
         SELECT id FROM locations WHERE parent_id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT c.id FROM locations c
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
  private async buildTree(
    rootId?: string,
    type?: string,
  ): Promise<LocationNode[]> {
    const typeFilter = type ? ` AND type = $2::text` : '';
    const params = [rootId ?? null, type ?? null].filter(
      (v, i) => i === 0 || type,
    );

    const rows: Array<Record<string, unknown>> = await this.locationRepo.query(
      `WITH RECURSIVE subtree AS (
         SELECT * FROM locations
         WHERE deleted_at IS NULL
           AND ( ($1::bigint IS NULL AND parent_id IS NULL) OR id = $1::bigint )
           ${typeFilter}
         UNION ALL
         SELECT c.* FROM locations c
         JOIN subtree s ON c.parent_id = s.id
         WHERE c.deleted_at IS NULL
           ${typeFilter}
       )
       SELECT s.*,
              ld.dept_ids
       FROM subtree s
       LEFT JOIN (
         SELECT location_id, array_agg(department_id ORDER BY department_id) AS dept_ids
         FROM location_departments
         GROUP BY location_id
       ) ld ON ld.location_id = s.id
       ORDER BY s.location_number`,
      params,
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

  private toNode(loc: Location): LocationNode {
    return {
      id: loc.id,
      name: loc.name,
      locationNumber: loc.locationNumber,
      type: loc.type,
      parentId: loc.parentId,
      capacity: loc.capacity,
      openTimeRule: formatOpenTimeRule({
        openDays: loc.openDays ?? [],
        openFrom: loc.openFrom ?? undefined,
        openTo: loc.openTo ?? undefined,
      }),
      isBookable: loc.isBookable,
      departmentIds: (loc.departments ?? []).map((d) => d.id),
      children: [],
    };
  }

  private rawToNode(row: Record<string, unknown>): LocationNode {
    const openDays = (row.open_days as number[] | null) ?? [];
    const openFrom = (row.open_from as string | null) ?? undefined;
    const openTo = (row.open_to as string | null) ?? undefined;
    const type = row.type as string;
    const capacity = (row.capacity as number | null) ?? null;
    // dept_ids comes from array_agg in the CTE; bigint[] -> string[] (may contain a
    // single NULL when there are no mappings, which we filter out).
    const departmentIds = ((row.dept_ids as Array<string | null> | null) ?? [])
      .filter((id): id is string => id != null)
      .map((id) => String(id));
    return {
      id: row.id as string,
      name: row.name as string,
      locationNumber: row.location_number as string,
      type,
      parentId: (row.parent_id as string | null) ?? null,
      capacity,
      openTimeRule: formatOpenTimeRule({ openDays, openFrom, openTo }),
      // Mirror Location.isBookable: capacity + open hours present (only bookable types
      // ever get these populated).
      isBookable: capacity != null && openDays.length > 0,
      departmentIds,
      children: [],
    };
  }

  private async invalidateTree(): Promise<void> {
    await this.cache.invalidateTag(CacheTag.LOCATION);
  }
}
