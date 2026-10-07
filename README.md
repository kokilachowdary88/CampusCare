# CampusCare — TKR College

CampusCare is a college complaint portal with separate student and staff experiences. Students can submit reports with location, priority, and image evidence; follow progress; vote; discuss; and receive status notifications. Faculty/admin can search reports, assign departments and staff, post action updates, and resolve or reject issues.

## Run locally

Use Node.js 22.12 or newer. Start each service in a separate terminal:

```powershell
cd backend
npm install
npm start
```

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The backend health check is at <http://localhost:5000/health>.

The portal opens directly in student access; a college account is not required to browse, vote, discuss, or submit a report. Staff, HOD, and Admin/Management use **Staff / HOD / Admin access** in the dashboard and select a role without entering credentials or a department. Demo Staff and HOD can review and update campus complaints and submit reports; Admin/Management have campus-wide access.

Complaint submissions include the student's name and roll number. These details are shown to the student who submitted the complaint and staff views, and are hidden from other students.

**Demo-only security warning:** role selection is not authentication. Anyone who can reach this app can choose Admin/Management and manage all complaints. Do not expose this configuration to a public network or use it for real college data. Restore verified staff authentication and authorization before deployment.

## Persistence

The local document database is stored in `backend/data/campuscare.json`; evidence images are stored in `backend/uploads/`. Both directories are local application data and are excluded by `backend/.gitignore`. Back up these files if you need to preserve data across machines. Configure the database path with `DATABASE_FILE`.

Before any public deployment, replace direct role selection with verified staff authentication and authorization. Then set a unique long `JWT_SECRET`, a private `ADMIN_INVITE_CODE`, and an appropriate `FRONTEND_ORIGIN` in the backend environment. Serve the API over HTTPS and use persistent storage for both the database file and uploads.
