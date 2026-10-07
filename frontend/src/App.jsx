import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_ROOT = 'http://localhost:5000';
const api = axios.create({ baseURL: `${API_ROOT}/api` });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('campuscare-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const DEPARTMENTS = [
  'Faculty/Teaching', 'Transport', 'Electrical/Maintenance', 'Housekeeping',
  'Hostel', 'Canteen Committee', 'Examination', 'Infrastructure', 'Library',
  'Laboratory', 'Anti-Ragging',
];
const STATUSES = ['Submitted', 'Under Review', 'Work In Progress', 'Resolved', 'Rejected'];

const prettyDate = (date) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(date));

function StaffAccess({ onClose, onAuthenticated }) {
  const [role, setRole] = useState('staff');
  const [form, setForm] = useState({ name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const guestKey = localStorage.getItem('campuscare-guest-key') || crypto.randomUUID();
      localStorage.setItem('campuscare-guest-key', guestKey);
      const response = await api.post('/auth/open-access', { ...form, role, guestKey });
      onAuthenticated(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to connect to the staff portal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card staff-access-modal">
        <div className="modal-title">
          <div><p className="eyebrow">DEMO ROLE ACCESS</p><h3>Choose a staff view</h3></div>
          <button className="close-btn" onClick={onClose} aria-label="Close staff access">×</button>
        </div>
        <p className="muted">Select a role to open its dashboard. No email or password is required for demo access.</p>
        <p className="role-access-warning">Demo only: anyone can select Admin / Management. Do not expose this portal publicly.</p>
        <div className="access-role-list">
          <button className={role === 'staff' ? 'access-role selected' : 'access-role'} onClick={() => setRole('staff')}><b>Staff</b><span>Update or raise complaints</span></button>
          <button className={role === 'hod' ? 'access-role selected' : 'access-role'} onClick={() => setRole('hod')}><b>HOD</b><span>Update or raise complaints</span></button>
          <button className={role === 'management' ? 'access-role selected' : 'access-role'} onClick={() => setRole('management')}><b>Admin / Management</b><span>All departments</span></button>
        </div>
        {role !== 'management' && (
          <div className="staff-access-form">
            <label>{role === 'hod' ? 'HOD name' : 'Staff name'}
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Optional" />
            </label>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="staff-auth-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={busy} onClick={submit}>{busy ? 'Opening…' : `Continue as ${role === 'management' ? 'Admin / Management' : role === 'hod' ? 'HOD' : 'Staff'}`}</button>
        </div>
      </section>
    </div>
  );
}

function ComplaintCard({ complaint, user, onVote, onComment, onUpdate }) {
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [staffUpdate, setStaffUpdate] = useState({
    status: complaint.status,
    progress: complaint.progress,
    eta: complaint.eta,
    department: complaint.department,
    assignedTo: complaint.assignedToId || '',
    message: '',
  });
  const ownVote = complaint.votes?.[user.id];
  const staff = ['staff', 'faculty', 'hod', 'admin', 'management'].includes(user.role);
  const management = ['admin', 'management'].includes(user.role);
  const canAssign = ['hod', 'admin', 'management'].includes(user.role);
  const staffDirectoryDepartment = user.openAccess && user.role === 'hod' && !user.department
    ? complaint.department
    : user.department;

  useEffect(() => {
    if (!canAssign) return;
    api.get('/auth/staff', { params: management ? {} : { department: staffDirectoryDepartment } })
      .then((response) => setStaffDirectory(response.data))
      .catch((requestError) => console.error('Unable to load staff directory', requestError));
  }, [canAssign, management, staffDirectoryDepartment]);

  const sendComment = async (event) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    const succeeded = await onComment(complaint.id, comment.trim());
    if (succeeded) setComment('');
    setBusy(false);
  };

  const saveUpdate = async (event) => {
    event.preventDefault();
    setBusy(true);
    const succeeded = await onUpdate(complaint.id, staffUpdate);
    if (succeeded) setEditing(false);
    setBusy(false);
  };

  return (
    <article className="complaint-card">
      <div className="card-vote">
        <button aria-label="Upvote complaint" className={ownVote === 'up' ? 'vote-arrow selected' : 'vote-arrow'} onClick={() => onVote(complaint.id, 'up')}>▲</button>
        <strong>{complaint.voteScore || 0}</strong>
        <button aria-label="Downvote complaint" className={ownVote === 'down' ? 'vote-arrow selected' : 'vote-arrow'} onClick={() => onVote(complaint.id, 'down')}>▼</button>
        <span>votes</span>
      </div>

      <div className="card-content">
        <div className="card-heading">
          <div className="tag-row">
            <span className="category-tag">{complaint.department}</span>
            <span className={`priority-tag priority-${complaint.priority?.toLowerCase()}`}>{complaint.priority} priority</span>
          </div>
          <span className={`status-badge status-${complaint.status.toLowerCase().replaceAll(' ', '-')}`}>{complaint.status}</span>
        </div>

        <h3>{complaint.title}</h3>
        <p className="complaint-description">{complaint.description}</p>
        <div className="complaint-facts">
          {complaint.studentName && (staff || complaint.createdBy === user.id) && <span>Student: {complaint.studentName} · Roll No: {complaint.rollNumber}</span>}
          <span>⌖ {complaint.location}</span>
          <span>Submitted by {complaint.author}</span>
          <span>Assigned: {complaint.assignedTo || complaint.department}</span>
          <span>ETA: {complaint.eta || 'Pending review'}</span>
          <span>{prettyDate(complaint.createdAt)}</span>
        </div>

        {complaint.evidence?.length > 0 && (
          <div className="evidence-row">
            {complaint.evidence.map((file) => (
              <a key={file.url} href={`${API_ROOT}${file.url}`} target="_blank" rel="noreferrer">▧ {file.name}</a>
            ))}
          </div>
        )}

        <section className="progress-section">
          <div className="progress-label"><span>Resolution progress</span><strong>{complaint.progress || 0}%</strong></div>
          <div className="progress-track"><div style={{ width: `${complaint.progress || 0}%` }} /></div>
          <div className="progress-steps">
            {['Submitted', 'Under Review', 'Work In Progress', 'Resolved'].map((step, index) => {
              const current = STATUSES.indexOf(complaint.status);
              const active = complaint.status === 'Rejected' ? index === 0 : index <= current;
              return <span key={step} className={active ? 'step active' : 'step'}><i>{active ? '✓' : index + 1}</i>{step}</span>;
            })}
          </div>
        </section>

        {complaint.actionLog?.length > 0 && (
          <details className="action-history">
            <summary>Department action log <span>{complaint.actionLog.length} updates</span></summary>
            <div className="timeline">
              {[...complaint.actionLog].reverse().map((action) => (
                <div className="timeline-item" key={action.id}>
                  <i />
                  <div><p>{action.message}</p><small>{action.author} · {action.department} · {prettyDate(action.createdAt)}</small></div>
                </div>
              ))}
            </div>
          </details>
        )}

        {staff && (
          <div className="staff-controls">
            <button className="subtle-btn" onClick={() => setEditing(!editing)}>{editing ? 'Close update' : 'Update complaint'}</button>
            {editing && (
              <form className="staff-form" onSubmit={saveUpdate}>
                <label>Status<select value={staffUpdate.status} onChange={(event) => setStaffUpdate({ ...staffUpdate, status: event.target.value })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>Progress %<input type="number" min="0" max="100" value={staffUpdate.progress} onChange={(event) => setStaffUpdate({ ...staffUpdate, progress: event.target.value })} /></label>
                <label>ETA<input value={staffUpdate.eta || ''} onChange={(event) => setStaffUpdate({ ...staffUpdate, eta: event.target.value })} placeholder="e.g. 3 days" /></label>
                {management && <label>Department<select value={staffUpdate.department} onChange={(event) => setStaffUpdate({ ...staffUpdate, department: event.target.value, assignedTo: '' })}>{DEPARTMENTS.map((department) => <option key={department}>{department}</option>)}</select></label>}
                {canAssign && <label>Assigned staff<select value={staffUpdate.assignedTo} onChange={(event) => setStaffUpdate({ ...staffUpdate, assignedTo: event.target.value })}><option value="">Unassigned</option>{staffDirectory.filter((member) => member.department === staffUpdate.department).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>}
                <label className="wide-field">Action update<input value={staffUpdate.message} onChange={(event) => setStaffUpdate({ ...staffUpdate, message: event.target.value })} placeholder="Describe the department action" /></label>
                <button className="primary-btn" disabled={busy}>Save update</button>
              </form>
            )}
          </div>
        )}

        <div className="discussion-head">
          <button className="discussion-toggle" onClick={() => setShowComments(!showComments)}>
            {showComments ? 'Hide discussion' : `Discussion · ${complaint.comments?.length || 0}`}
          </button>
        </div>
        {showComments && (
          <div className="discussion">
            {complaint.comments?.map((item) => (
              <div className="comment" key={item.id}>
                <span className={`avatar avatar-${item.role}`}>{item.author?.slice(0, 1).toUpperCase()}</span>
                <div><p><strong>{item.author}</strong><span className="role-chip">{item.role}</span></p><div>{item.text}</div><small>{prettyDate(item.createdAt)}</small></div>
              </div>
            ))}
            <form className="comment-form" onSubmit={sendComment}>
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={staff ? 'Respond to this discussion…' : 'Add a helpful comment…'} />
              <button className="primary-btn" disabled={busy || !comment.trim()}>Post</button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem('campuscare-token')));
  const [complaints, setComplaints] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [view, setView] = useState('overview');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showStaffAccess, setShowStaffAccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentName: '', rollNumber: '', title: '', department: DEPARTMENTS[0], priority: 'Medium', location: '', description: '' });
  const [files, setFiles] = useState([]);

  const staff = user && ['staff', 'faculty', 'hod', 'admin', 'management'].includes(user.role);
  const canRaiseComplaint = !staff || ['staff', 'faculty', 'hod'].includes(user.role);
  const displayName = user?.guest ? 'Student Access' : user?.name;
  const roleName = ({ faculty: 'Staff', admin: 'Admin / Management' })[user?.role] || (user?.role === 'hod' ? 'HOD' : user?.role);

  const loadDashboard = useCallback(async () => {
    if (!localStorage.getItem('campuscare-token')) return;
    try {
      const [complaintResponse, notificationResponse] = await Promise.all([
        api.get('/complaints'),
        api.get('/complaints/notifications'),
      ]);
      setComplaints(complaintResponse.data);
      setNotifications(notificationResponse.data);
      setError('');
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        localStorage.removeItem('campuscare-token');
        setUser(null);
      } else {
        setError(requestError.response?.data?.message || 'Unable to load dashboard data.');
      }
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('campuscare-token');
    if (!token) {
      const guestKey = localStorage.getItem('campuscare-guest-key') || crypto.randomUUID();
      localStorage.setItem('campuscare-guest-key', guestKey);
      api.post('/auth/guest', { guestKey })
        .then((response) => onAuthenticated(response.data))
        .catch((requestError) => setError(requestError.response?.data?.message || 'Could not connect to CampusCare. Please try again.'))
        .finally(() => setAuthLoading(false));
      return;
    }
    api.get('/auth/me')
      .then((response) => setUser(response.data.user))
      .catch((requestError) => {
        if (requestError.response?.status === 401) {
          localStorage.removeItem('campuscare-token');
          const guestKey = localStorage.getItem('campuscare-guest-key') || crypto.randomUUID();
          localStorage.setItem('campuscare-guest-key', guestKey);
          api.post('/auth/guest', { guestKey })
            .then((response) => onAuthenticated(response.data))
            .catch((guestError) => setError(guestError.response?.data?.message || 'Could not connect to CampusCare. Please try again.'));
        } else {
          setError(requestError.response?.data?.message || 'Could not reconnect to CampusCare. Please try again.');
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    loadDashboard();
    const refreshTimer = window.setInterval(loadDashboard, 15000);
    return () => window.clearInterval(refreshTimer);
  }, [user, loadDashboard]);

  const visibleComplaints = useMemo(() => complaints.filter((complaint) => {
    if (view === 'mine' && complaint.createdBy !== user?.id) return false;
    if (department !== 'all' && complaint.department !== department) return false;
    if (status !== 'all' && complaint.status !== status) return false;
    const query = search.trim().toLowerCase();
    const studentDetails = staff || complaint.createdBy === user?.id
      ? `${complaint.studentName || ''} ${complaint.rollNumber || ''}`
      : '';
    if (query && !`${complaint.title} ${complaint.description} ${complaint.location} ${complaint.department} ${studentDetails}`.toLowerCase().includes(query)) return false;
    return true;
  }), [complaints, view, user, department, status, search]);

  const counts = useMemo(() => ({
    total: complaints.length,
    open: complaints.filter((item) => !['Resolved', 'Rejected'].includes(item.status)).length,
    resolved: complaints.filter((item) => item.status === 'Resolved').length,
    high: complaints.filter((item) => ['High', 'Critical'].includes(item.priority) && !['Resolved', 'Rejected'].includes(item.status)).length,
  }), [complaints]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const onAuthenticated = ({ token, user: signedInUser }) => {
    localStorage.setItem('campuscare-token', token);
    setUser(signedInUser);
    setShowStaffAccess(false);
    setView('overview');
    setError('');
  };

  const signOut = () => {
    localStorage.removeItem('campuscare-token');
    setUser(null);
    setComplaints([]);
    setNotifications([]);
    const guestKey = localStorage.getItem('campuscare-guest-key') || crypto.randomUUID();
    localStorage.setItem('campuscare-guest-key', guestKey);
    api.post('/auth/guest', { guestKey })
      .then((response) => onAuthenticated(response.data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Unable to start guest access.'));
  };

  const handleVote = async (id, direction) => {
    try {
      await api.patch(`/complaints/${id}/vote`, { direction });
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save vote.');
    }
  };

  const handleComment = async (id, text) => {
    try {
      await api.post(`/complaints/${id}/comments`, { text });
      await loadDashboard();
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to post comment.');
      return false;
    }
  };

  const handleUpdate = async (id, update) => {
    try {
      await api.patch(`/complaints/${id}/updates`, update);
      await loadDashboard();
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save complaint update.');
      return false;
    }
  };

  const submitComplaint = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    files.forEach((file) => payload.append('evidence', file));
    try {
      await api.post('/complaints', payload);
      setForm({ studentName: '', rollNumber: '', title: '', department: DEPARTMENTS[0], priority: 'Medium', location: '', description: '' });
      setFiles([]);
      setShowForm(false);
      setView('all');
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to submit complaint.');
    } finally {
      setBusy(false);
    }
  };

  const markNotificationsRead = async () => {
    try {
      await api.patch('/complaints/notifications/read-all');
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update notifications.');
    }
  };

  if (authLoading) return <div className="loading-screen">Loading your CampusCare dashboard…</div>;
  if (!user) {
    return (
      <div className="loading-screen guest-error">
        <p>{error || 'Opening CampusCare…'}</p>
        <button className="primary-btn" onClick={signOut}>Retry guest access</button>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <a className="brand-panel" href="#home" onClick={() => setView('overview')}>
          <div className="brand-mark">CC</div>
          <div><p className="label">CampusCare</p><h1>TKR College</h1></div>
        </a>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="sidebar-nav">
          <button className={view === 'overview' || view === 'all' ? 'nav-item active' : 'nav-item'} onClick={() => setView('overview')}><span className="nav-icon">▦</span><span>Dashboard</span></button>
          <button className={view === 'mine' ? 'nav-item active' : 'nav-item'} onClick={() => setView('mine')}><span className="nav-icon">▤</span><span>My complaints</span></button>
          <button className={view === 'all' ? 'nav-item active' : 'nav-item'} onClick={() => setView('all')}><span className="nav-icon">◎</span><span>{staff ? 'All complaints' : 'Community feed'}</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini"><span className="avatar avatar-user">{user.guest ? 'S' : user.name.slice(0, 1).toUpperCase()}</span><div><strong>{displayName}</strong><small>{user.guest ? 'Student view' : `${roleName}${user.department ? ` · ${user.department}` : ''}`}</small></div></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">{staff ? 'STAFF WORKSPACE' : 'STUDENT SERVICES'}</p><h2>{view === 'mine' ? 'My complaints' : view === 'all' ? 'Complaint register' : 'Campus overview'}</h2></div>
          <div className="topbar-actions">
            <div className="user-greeting"><span>{staff ? `${roleName} access` : 'Good day,'}</span><strong>{displayName}</strong></div>
            {staff ? <button className="ghost-btn staff-access-btn" onClick={signOut}>Student access</button> : <button className="ghost-btn staff-access-btn" onClick={() => setShowStaffAccess(true)}>Staff / HOD / Admin access</button>}
            <div className="notification-wrap">
              <button className="notification-btn" aria-label="Notifications" onClick={() => setShowNotifications(!showNotifications)}>♧{unreadCount > 0 && <i>{unreadCount}</i>}</button>
              {showNotifications && <div className="notification-popover">
                <div className="popover-heading"><strong>Notifications</strong><button onClick={markNotificationsRead}>Mark all read</button></div>
                {notifications.length === 0 ? <p className="muted">You’re all caught up.</p> : notifications.slice(0, 8).map((item) => (
                  <div className={item.readAt ? 'notification-item read' : 'notification-item'} key={item.id}><span>{item.message}</span><small>{prettyDate(item.createdAt)}</small></div>
                ))}
              </div>}
            </div>
            {canRaiseComplaint && <button className="primary-btn" onClick={() => setShowForm(true)}>＋ Raise complaint</button>}
          </div>
        </header>

        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

        <section className="welcome-banner">
          <div><span className="welcome-kicker">CAMPUSCARE · ISSUE RESOLUTION</span><h3>{staff ? 'Your action moves campus forward.' : 'A better campus starts with being heard.'}</h3><p>{user.openAccess && ['staff', 'hod'].includes(user.role) ? 'Review and update campus complaints, or submit a new report.' : user.role === 'staff' || user.role === 'faculty' ? 'Your queue shows complaints assigned to you.' : user.role === 'hod' ? `Manage reports for ${user.department}.` : staff ? 'Review and manage complaints across all departments.' : 'See what needs attention, share your voice, and follow your reports to resolution.'}</p></div>
          <div className="welcome-illustration" aria-hidden="true"><span>✓</span><i /><i /><i /></div>
        </section>

        <section className="stats-grid">
          <div className="stat-card"><span className="stat-icon icon-blue">▤</span><div><small>Total reports</small><strong>{counts.total}</strong></div><span className="stat-foot">In the campus portal</span></div>
          <div className="stat-card"><span className="stat-icon icon-amber">◷</span><div><small>In progress</small><strong>{counts.open}</strong></div><span className="stat-foot">Being reviewed or actioned</span></div>
          <div className="stat-card"><span className="stat-icon icon-green">✓</span><div><small>Resolved</small><strong>{counts.resolved}</strong></div><span className="stat-foot">Closed successfully</span></div>
          <div className="stat-card"><span className="stat-icon icon-red">△</span><div><small>Priority attention</small><strong>{counts.high}</strong></div><span className="stat-foot">High or critical reports</span></div>
        </section>

        <section className="register-section">
          <div className="section-heading"><div><p className="eyebrow">TRACK · DISCUSS · RESOLVE</p><h3>{view === 'mine' ? 'Your reports' : 'Complaint register'}</h3></div><span className="result-count">{visibleComplaints.length} {visibleComplaints.length === 1 ? 'report' : 'reports'}</span></div>
          <div className="filter-toolbar">
            <label className="search-input"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search complaints, locations…" /></label>
            <select aria-label="Filter by department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          <div className="complaint-list">
            {visibleComplaints.length === 0 ? <div className="empty-state"><span>◌</span><h4>No reports to show</h4><p>Try another filter or be the first to raise an issue.</p>{canRaiseComplaint && <button className="primary-btn" onClick={() => setShowForm(true)}>Raise a complaint</button>}</div>
              : visibleComplaints.map((complaint) => <ComplaintCard key={complaint.id} complaint={complaint} user={user} onVote={handleVote} onComment={handleComment} onUpdate={handleUpdate} />)}
          </div>
        </section>
      </main>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <section className="modal-card">
            <div className="modal-title"><div><p className="eyebrow">COMPLAINT SUBMISSION</p><h3>Raise a complaint</h3></div><button className="close-btn" onClick={() => setShowForm(false)}>×</button></div>
            <p className="muted">Add your student details and enough information for the department to investigate your report.</p>
            <form className="complaint-form" onSubmit={submitComplaint}>
              <label>Student name<input required maxLength="100" value={form.studentName} onChange={(event) => setForm({ ...form, studentName: event.target.value })} placeholder="Full name" /></label>
              <label>Roll number<input required maxLength="40" value={form.rollNumber} onChange={(event) => setForm({ ...form, rollNumber: event.target.value })} placeholder="College roll number" /></label>
              <label className="wide-field">Subject<input required maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="A short summary of the issue" /></label>
              <label>Category<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
              <label className="wide-field">Location<input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Building, room, or campus area" /></label>
              <label className="wide-field">Description<textarea required rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe what happened and when…" /></label>
              <label className="wide-field upload-label">Evidence images <span>· optional, up to 4 images (5 MB each)</span><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 4))} /></label>
              {files.length > 0 && <p className="selected-files wide-field">{files.map((file) => file.name).join(' · ')}</p>}
              <div className="modal-actions wide-field"><button type="button" className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button></div>
            </form>
          </section>
        </div>
      )}
      {showStaffAccess && <StaffAccess onClose={() => setShowStaffAccess(false)} onAuthenticated={onAuthenticated} />}
    </div>
  );
}
