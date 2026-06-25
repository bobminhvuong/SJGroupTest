/**
 * NƠI DUY NHẤT khai báo cấu hình cache cho từng "module": prefix + tags + ttl.
 *
 * File này CHỈ chứa DỮ LIỆU (không có logic Redis). RedisService đọc config ở đây
 * để remember()/setTagged()/invalidateTag(). Đổi prefix/tag/ttl 1 chỗ duy nhất.
 *
 * Dùng object có tên field (không dùng tuple [prefix, tags, ttl]) để type-safe,
 * tránh truy cập theo index (cfg[1], cfg[2]) dễ nhầm khi đổi thứ tự.
 */

/**
 * Tuple gọn cho 1 module: [prefix, tags, ttl(giây)].
 * Named tuple -> IDE vẫn hiện nhãn từng phần tử khi hover.
 */
export type CacheTuple = readonly [
  prefix: string,
  tags: readonly string[],
  ttl: number,
];

/**
 * Bảng config cache theo module — mỗi module 1 DÒNG.
 * Thêm module mới = thêm 1 entry. Nhân rộng tới hàng trăm module vẫn gọn.
 */
export const CACHE_MODULES = {
  LOCATION_TREE: ['location:tree', ['location'], 600],
  // BOOKING_LIST:  ['booking:list',  ['booking'],  120],
  // DEPARTMENT_ALL:['department:all',['department'], 3600],
} satisfies Record<string, CacheTuple>;

export type CacheModuleName = keyof typeof CACHE_MODULES;

/** Object đã chuẩn hoá để service dùng (không đụng tới index). */
export interface ModuleCacheConfig {
  prefix: string;
  tags: string[];
  ttl: number;
}

/**
 * Lấy config 1 module và destructure tuple -> object.
 * Đây là NƠI DUY NHẤT truy cập theo vị trí; phần còn lại của code chỉ thấy
 * .prefix / .tags / .ttl nên không sợ nhầm thứ tự.
 */
export const getCacheConfig = (name: CacheModuleName): ModuleCacheConfig => {
  const [prefix, tags, ttl] = CACHE_MODULES[name];
  return { prefix, tags: [...tags], ttl };
};

/**
 * Lock key cho khoá nghiệp vụ (chống double-booking) — TÁCH BIỆT với lock
 * rebuild cache trong remember(). Đây là khoá theo phòng + ngày.
 */
export const LockKey = {
  booking: (locationId: string, dateISO: string): string =>
    `lock:booking:${locationId}:${dateISO}`,
} as const;

/** TTL cho khoá nghiệp vụ (ms). Getter để đọc env sau khi ConfigModule nạp .env. */
export const LockTtl = {
  get bookingMs(): number {
    return Number(process.env.BOOKING_LOCK_TTL_MS ?? 5000);
  },
} as const;
