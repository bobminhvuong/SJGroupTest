import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { CreateLocationTypeDto } from '../dto/create-location-type.dto';
import { UpdateLocationTypeDto } from '../dto/update-location-type.dto';
import { LocationTypeService } from '../services/location-type.service';

@ApiTags('location-types')
@Controller('location-types')
export class LocationTypeController {
  constructor(private readonly locationTypeService: LocationTypeService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new location type' })
  create(@Body() dto: CreateLocationTypeDto) {
    return this.locationTypeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all location types' })
  findAll() {
    return this.locationTypeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a location type by id' })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.locationTypeService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a location type' })
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateLocationTypeDto,
  ) {
    return this.locationTypeService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete a location type (blocked if referenced by active locations)',
  })
  remove(@Param('id', ParseIdPipe) id: string) {
    return this.locationTypeService.remove(id);
  }
}
