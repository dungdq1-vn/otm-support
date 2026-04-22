# Firestore Security Specification - OTM Support

## 1. Data Invariants
- **User Role Sensitivity**: Only users with the `Admin` role can modify the `role` field across all users.
- **Relational Integrity**: Tickets and Case Studies must have valid structure and be linkable to users (though current implementation is simple).
- **Immutability**: `createdAt` timestamps cannot be changed after creation.
- **Verification**: Only verified emails are allowed to perform write operations (if email verification is used, but we'll stick to `isSignedIn()` for now or add verification check if possible).

## 2. The Dirty Dozen Payloads

| # | Action | Role | Payload / Intent | Expected Result |
|---|---|---|---|---|
| 1 | `update` user | User | Try to change own role to 'Admin' | **DENIED** |
| 2 | `delete` ticket | Viewer | Attempt to delete any ticket | **DENIED** |
| 3 | `delete` ticket | Editor | Attempt to delete any ticket | **DENIED** |
| 4 | `create` ticket | Viewer | Attempt to create a new ticket | **DENIED** |
| 5 | `update` PIC | Viewer | Attempt to assign a ticket to self | **DENIED** |
| 6 | `create` ticket | Editor | Inject 1MB string into `request` field | **DENIED** |
| 7 | `update` user | Admin | Change another user's email (PII) | **DENIED** |
| 8 | `delete` group | Editor | Delete a group used by tickets | **DENIED** |
| 9 | `create` case | Anonymous| Create a case study without auth | **DENIED** |
| 10| `update` ticket | Editor | Change `createdAt` timestamp | **DENIED** |
| 11| `update` user | User | Change `photoURL` of another user | **DENIED** |
| 12| `create` PIC | User | Create a PIC entry without Admin rights | **DENIED** |

## 3. Implementation Plan
- Define `isValidUser`, `isValidTicket`, `isValidCaseStudy`.
- Use `get()` to check active user role for sensitive operations.
- Enforce `affectedKeys().hasOnly()` for role-specific updates.
- Protect the `users` collection specifically for role escalation.
