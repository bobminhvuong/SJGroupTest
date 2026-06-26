# 00 — Overview & Scope

## Context
Manage a building location hierarchy (Building > Floor > Room) and meeting room booking system, with rules based on department / capacity / open time.

## In-scope
1. CRUD for Location (self-referencing tree).
2. Create/read/cancel Booking with 3-rule validation + overlap prevention.
3. Exception handling, logging, Swagger docs.
4. Redis: cache location tree + distributed lock.
5. Seed sample data from example tables in the assignment.

## Out-of-scope
- Full Authentication/Authorization (can mock `department` via header/body).
- Frontend / UI.
- Multi-tenant, fine-grained permissions.
- Payments, email notifications.

## Sample Data (from assignment)
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

> Node without Department/Capacity/Open Time = structural node (not bookable).

## Definition of Done
- All checklists in section 3 of `CLAUDE.md` are met.
- Swagger runs, booking happy path and edge case tests pass.
- README contains ERD + system design.
- Push to GitHub, send link to `luc.le@coe.surbana.tech`.
