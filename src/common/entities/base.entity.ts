import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Cột chung cho MỌI bảng: khoá chính UUID + audit timestamps + soft delete.
 *
 * - @DeleteDateColumn -> cột `deleted_at`. Khi xoá bằng softRemove()/softDelete(),
 *   TypeORM set `deleted_at` thay vì DELETE thật, và tự loại bản ghi đã xoá khỏi
 *   các truy vấn find() mặc định (muốn lấy cả đã xoá: withDeleted: true).
 *
 * Tất cả entity (Location, Booking, Department) extends class này.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
