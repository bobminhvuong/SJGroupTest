import { PartialType } from '@nestjs/swagger';
import { CreateLocationDto } from './create-location.dto';

/**
 * Update a location. All fields optional (PartialType). Changing `parentId` moves the
 * node — the service checks it does not create a cycle (cannot set the parent to the
 * node itself or one of its descendants).
 */
export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
