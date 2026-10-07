# CampusCare API

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set a private `JWT_SECRET`. `ADMIN_INVITE_CODE` is only used by the optional credential-based registration endpoint.
3. Run `npm start`.

The API persists accounts, complaints, votes, comments, action history, and notifications to `data/campuscare.json`. Uploaded image evidence is saved under `uploads/`. Keep `.env`, `data/`, and `uploads/` private and backed up.

Students use the direct student-access portal. The Staff Portal's `POST /api/auth/open-access` endpoint creates a signed demo session after role selection, with no credentials, invitation code, or department selection. Direct demo Staff and HOD sessions can view and update all complaints and submit new complaints. Admin/Management can manage all departments and assign staff.

Complaint submissions require `studentName` and `rollNumber` fields. Student identity details are returned only to the complaint submitter and staff roles; other students receive complaints without those fields.

**Demo-only security warning:** `open-access` is intentionally unauthenticated. Any visitor can claim any role, including Admin/Management, and then use that role's permissions. Do not expose this API publicly or use it for real college data. Replace it with verified staff authentication before deployment.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/open-access`, `GET /api/auth/me`
- `GET /api/complaints` (authenticated; supports department, status, priority, search, and mine filters)
- `POST /api/complaints` (multipart form, requires `studentName` and `rollNumber`, up to four image evidence files)
- `PATCH /api/complaints/:id/vote`, `POST /api/complaints/:id/comments`
- `PATCH /api/complaints/:id/updates` (role-scoped staff access)
- `GET /api/auth/staff` (staff directory, scoped by role)
- `GET /api/complaints/notifications`, `PATCH /api/complaints/notifications/read-all`
