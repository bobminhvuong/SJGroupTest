import { PartialType } from '@nestjs/swagger';
import { CreateDepartmentDto } from './create-department.dto';

/** Update department — all fields optional; same uniqueness rules as create. */
export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}
