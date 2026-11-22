# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **PII Isolation**: User emails and roles live exclusively in `/users/{userId}` and are readable only by the document owner or a verified admin.
2. **No Self-Escalated Roles**: Non-admin users cannot create a `/users/{userId}` document with `role: 'admin'`, nor can they mutate their `role` or `uid`.
3. **Attendance Relational Integrity**: Every `/attendance/{recordId}` document must reference an existing `/employees/{employeeId}` document via `exists()`. Non-admins may only create/update/read their own attendance records (`userId == request.auth.uid`) and cannot set `entryType: 'manual_admin'`.
4. **Overtime Workflow & Terminal Locking**: Non-admins may only create `/overtimeRequests/{requestId}` with `status: 'pending'` and `reviewedBy: ''`. Once `status` becomes `'approved'`, `'rejected'`, or `'cancelled'`, non-admins cannot modify the request. Only admins may transition a request to `'approved'` or `'rejected'`.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`, and `createdAt`, `userId`, `employeeId` are immutable after creation.
6. **Bounded Arrays & Strings**: `offDays` is strictly bounded to `<= 7` integers (`0..6`), `customOffDates` to `<= 31` strings (`YYYY-MM-DD`), and every string field enforces explicit `.size()` limits.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Unauthenticated request attempting to read `/employees` or write `/attendance/rec1`.
2. **Privilege Escalation on Signup**: Non-admin creating `/users/{uid}` with `role: "admin"`.
3. **Role Mutation Attack**: Non-admin updating `/users/{uid}` to change `role` from `"employee"` to `"admin"`.
4. **PII Cross-Read**: Authenticated non-admin attempting `get` on `/users/other_uid`.
5. **Shadow Ghost Field Injection**: Creating `/attendance/rec1` with an extra undeclared field `isVerified: true`.
6. **Identity Spoofing**: Non-admin creating `/attendance/rec1` with `userId: "victim_uid"`.
7. **Orphaned Attendance Record**: Creating `/attendance/rec1` with non-existent `employeeId: "nonexistent_emp"`.
8. **Admin Entry Type Spoofing**: Non-admin creating `/attendance/rec1` with `entryType: "manual_admin"`.
9. **Overtime Self-Approval**: Non-admin creating `/overtimeRequests/ot1` directly with `status: "approved"`.
10. **Terminal State Tampering**: Non-admin updating `/overtimeRequests/ot1` after it is `"approved"` back to `"pending"` or changing `durationHours`.
11. **Path ID Poisoning / Oversized String**: Creating `/employees/bad$$id` or injecting a 2KB string into `notes`.
12. **Unverified Email Spoofing**: Request with admin email in token where `email_verified == false`.
