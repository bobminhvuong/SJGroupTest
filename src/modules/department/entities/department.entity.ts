import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Department (EFM, FSS, AVS, ASS...). `code` immutable & unique (referenced by
 * location.department_id and used to match department rule during booking).
 */
@Entity('department')
export class Department extends BaseEntity {
  @Index('uq_department_code', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  // Prevent duplicate name (exact match) at DB level; DepartmentService adds
  // case-insensitive check ("EFM" vs "efm") before insert.
  @Index('uq_department_name', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 128 })
  name!: string;
}
