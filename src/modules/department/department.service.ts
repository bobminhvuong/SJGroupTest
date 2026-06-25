import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { Department } from './entities/department.entity';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  /** Tạo department; chặn trùng `code` và `name` (case-insensitive). */
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

  findAll(): Promise<Department[]> {
    return this.departmentRepo.find({ order: { code: 'ASC' } });
  }

  async findOne(id: string): Promise<Department> {
    const dept = await this.departmentRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }
}
