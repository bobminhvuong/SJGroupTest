# 00 — Tổng quan & Phạm vi

## Bối cảnh
Quản lý cây địa điểm toà nhà (Building > Floor > Room) và hệ thống đặt phòng họp, với rule theo department / capacity / open time.

## Phạm vi (In-scope)
1. CRUD cho Location (cây tự tham chiếu).
2. Tạo/đọc/huỷ Booking với validate 3 rule + chống overlap.
3. Exception handling, logging, Swagger docs.
4. Redis: cache cây location + distributed lock.
5. Seed dữ liệu mẫu từ bảng ví dụ trong đề.

## Ngoài phạm vi (Out-of-scope)
- Authentication/Authorization đầy đủ (có thể mock `department` qua header/body).
- Frontend / UI.
- Multi-tenant, phân quyền chi tiết.
- Thanh toán, thông báo email.

## Dữ liệu mẫu (từ đề)
| Building | Location Name | Location Number | Department | Capacity | Open Time |
|---|---|---|---|---|---|
| A | Floor 1 | A-01 | | | |
| A | Lobby Level1 | A-01-Lobby | | | |
| A | Meeting Room 1 | A-01-01 | EFM | 10 | Mon to Fri (9AM–6PM) |
| A | Meeting Room 2 | A-01-02 | FSS | 50 | Mon to Fri (9AM–6PM) |
| A | Corridor Floor 1 | A-01-Corridor | | | |
| A | Meeting Room 2 | A-01-03 | AVS | 5 | Mon to Sat (9AM–6PM) |
| B | Floor 5 | B-05 | | | |
| B | Utility Room | B-05-11 | ASS | 30 | Always open |
| B | Sanitary Room | B-05-12 | EFM | 10 | Mon to Fri (9AM–6PM) |
| B | Meeting Toilet | B-05-13 | EFM | 10 | Mon to Fri (9AM–6PM) |
| B | Genset Room | B-05-14 | ASS | 100 | Mon to Sun (9AM–6PM) |
| B | Pantry Floor 5 | B-05-15 | | | |
| B | Corridor Floor 5 | B-05-Corridor | | | |

> Node không có Department/Capacity/Open Time = node cấu trúc (không bookable).

## Tiêu chí hoàn thành (Definition of Done)
- Tất cả checklist mục 3 trong `CLAUDE.md` đạt.
- Swagger chạy được, test booking happy/edge case pass.
- README có ERD + system design.
- Push GitHub, gửi link cho `luc.le@coe.surbana.tech`.
