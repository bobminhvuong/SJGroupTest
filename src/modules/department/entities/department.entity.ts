import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Phòng ban (EFM, FSS, AVS, ASS...). `code` immutable & unique (được tham chiếu
 * bởi location.department_id và dùng để khớp rule department khi booking).
 */
@Entity('department')
export class Department extends BaseEntity {
  @Index('uq_department_code', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  // Chặn trùng name (so khớp chính xác) ở tầng DB; DepartmentService bổ sung
  // kiểm tra case-insensitive ("EFM" vs "efm") trước khi insert.
  @Index('uq_department_name', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 128 })
  name!: string;
}
