import { ApiProperty } from '@nestjs/swagger';

export class PageMeta {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

/** Generic paginated response: { data: T[], meta: PageMeta } */
export class PagedResult<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: PageMeta })
  meta: PageMeta;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
