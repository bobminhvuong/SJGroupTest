import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@ApiTags('departments')
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo department (chặn trùng code & name)' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách department' })
  findAll() {
    return this.departmentService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết department' })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.departmentService.findOne(id);
  }
}
