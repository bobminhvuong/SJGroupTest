import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { Department } from './entities/department.entity';

/**
 * Department: Minimal CRUD (create + list + detail). Still exports TypeOrmModule so
 * Location/Booking can inject Repository<Department>.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Department])],
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [TypeOrmModule, DepartmentService],
})
export class DepartmentModule {}
