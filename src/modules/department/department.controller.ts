import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { ListDepartmentDto } from './dto/list-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('departments')
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @ApiOperation({
    summary: 'Create department (prevent duplicate code & name)',
  })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List departments (search by code/name, paginated)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by code or name (case-insensitive, partial match)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default 20)',
  })
  findAll(@Query() dto: ListDepartmentDto) {
    return this.departmentService.findAll(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department details' })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.departmentService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update department (prevent duplicate code & name)',
  })
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete department (soft delete)' })
  remove(@Param('id', ParseIdPipe) id: string) {
    return this.departmentService.remove(id);
  }
}
