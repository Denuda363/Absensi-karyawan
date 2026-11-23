# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **PII Isolation**: User emails and roles live exclusively in `/users/{userId}` and are readable only by the document owner or a verified admin.
2. **No Self-Escalated Roles**: Non-admin users cannot create a `/users/{userId}` document with `role: 'admin'`, nor can they mutate their `role` or `uid`.
3. **Attendance Relational Integrity**: Every `/attendance/{recordId}` and `/lateSettlements/{settlementId}` document must reference an existing `/employees/{employeeId}` document via `exists()`. Non-admins may only create/update/read their own attendance records (`userId == request.auth.uid`) and cannot set `entryType: 'manual_admin'`.
4. **Payroll & Finance Admin-Only Isolation**: All `/payrollSettings`, `/payrollProfiles`, `/payrollAdjustments`, `/payrollRaises`, `/payrollStatuses`, `/financeAccounts`, `/financeCategories`, `/financeTransactions`, `/financeTransfers`, and `/securityConfig` documents are strictly readable and writable only by verified admins.
5. **Financial Relational & Transfer Integrity**: Every `/financeTransactions/{txId}` create must verify an existing `categoryId` in `/financeCategories`, and every `/financeTransfers/{transferId}` create must verify both `fromAccountId` and `toAccountId` exist in `/financeAccounts` and are distinct (`fromAccountId != toAccountId`).
6. **Temporal Integrity & Bounded Payloads**: All `createdAt` and `updatedAt` timestamps must match `request.time`; `createdAt`, `userId`, and `employeeId` are immutable after creation. Arrays (`offDays <= 7`, `customOffDates <= 31`, `shifts <= 20`, `branches <= 30`) and every string field enforce explicit `.size()` boundaries.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Unauthenticated request attempting to read `/employees` or write `/attendance/rec1`.
2. **Privilege Escalation on Signup**: Non-admin creating `/users/{uid}` with `role: "admin"`.
3. **Role Mutation Attack**: Non-admin updating `/users/{uid}` to change `role` from `"employee"` to `"admin"`.
4. **PII Cross-Read**: Authenticated non-admin attempting `get` on `/users/other_uid`.
5. **Shadow Ghost Field Injection**: Creating `/attendance/rec1` with an extra undeclared field `isVerified: true`.
6. **Identity Spoofing**: Non-admin creating `/attendance/rec1` with `userId: "victim_uid"`.
7. **Orphaned Attendance / Payroll Record**: Creating `/attendance/rec1` or `/payrollProfiles/missing_emp` referencing a non-existent `employeeId`.
8. **Admin Entry Type Spoofing**: Non-admin creating `/attendance/rec1` with `entryType: "manual_admin"`.
9. **Unauthorized Payroll / Finance Read**: Non-admin attempting to read `/payrollProfiles` or `/financeTransactions`.
10. **Self-Transfer / Orphaned Finance Tx**: Creating `/financeTransfers/tr1` with `fromAccountId == toAccountId` or `/financeTransactions/tx1` with non-existent `categoryId`.
11. **Path ID Poisoning / Oversized String**: Creating `/employees/bad$$id` or injecting a 2KB string into `notes`.
12. **Unverified Email Spoofing**: Request with bootstrapped admin email in token where `email_verified == false`.
