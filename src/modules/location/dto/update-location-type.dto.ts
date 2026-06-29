import { PartialType } from '@nestjs/swagger';
import { CreateLocationTypeDto } from './create-location-type.dto';

export class UpdateLocationTypeDto extends PartialType(CreateLocationTypeDto) {}
