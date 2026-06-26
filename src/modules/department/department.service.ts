import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { PagedResult } from '../../common/dto/paged-result';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { ListDepartmentDto } from './dto/list-department.dto';
import { Department } from './entities/department.entity';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  /** Create department; prevent duplicate `code` and `name` (case-insensitive). */
  async create(dto: CreateDepartmentDto): Promise<Department> {
    const code = dto.code.trim();
    const name = dto.name.trim();

    const byCode = await this.departmentRepo.findOne({
      where: { code: ILike(code) },
    });
    if (byCode) {
      throw new ConflictException(`Department code "${code}" already exists`);
    }

    const byName = await this.departmentRepo.findOne({
      where: { name: ILike(name) },
    });
    if (byName) {
      throw new ConflictException(`Department name "${name}" already exists`);
    }

    return this.departmentRepo.save(this.departmentRepo.create({ code, name }));
  }

  async findAll(dto: ListDepartmentDto): Promise<PagedResult<Department>> {
    const { page, limit, search } = dto;
    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .orderBy('d.code', 'ASC');

    if (search?.trim()) {
      qb.where('d.code ILIKE :q OR d.name ILIKE :q', { q: `%${search.trim()}%` });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return new PagedResult(data, total, page, limit);
  }

  async findOne(id: string): Promise<Department> {
    const dept = await this.departmentRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }
}
