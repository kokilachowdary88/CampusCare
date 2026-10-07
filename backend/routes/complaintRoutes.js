const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const db = require('../database');
const { requireAuth, requireStaff, isManagementRole, isStaffRole } = require('../middleware/auth');

const router = express.Router();
const departments = [
  'Faculty/Teaching', 'Transport', 'Electrical/Maintenance', 'Housekeeping',
  'Hostel', 'Canteen Committee', 'Examination', 'Infrastructure',
  'Library', 'Laboratory', 'Anti-Ragging',
];
const statuses = ['Submitted', 'Under Review', 'Work In Progress', 'Resolved', 'Rejected'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const uploadDirectory = path.join(__dirname, '..', 'uploads');
const imageTypes = {
  'image/jpeg': { extension: '.jpg', signature: (buffer) => buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: '.png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/gif': { extension: '.gif', signature: (buffer) => buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null },
  'image/webp': { extension: '.webp', signature: (buffer) => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP' },
};
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      callback(null, `${randomUUID()}${imageTypes[file.mimetype]?.extension || '.img'}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, callback) => {
    if (!imageTypes[file.mimetype]) {
      return callback(new Error('Evidence must be a JPEG, PNG, GIF, or WebP image.'));
    }
    return callback(null, true);
  },
});

const findComplaint = (id) => db.get('complaints').find({ id }).value();
const sortNewest = (items) => items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const presentComplaint = (user, complaint) => {
  if (isStaffRole(user.role) || complaint.createdBy === user.id) return complaint;
  const { studentName, rollNumber, ...publicComplaint } = complaint;
  return publicComplaint;
};
const canManageComplaint = (user, complaint) => {
  if (isManagementRole(user.role)) return true;
  if (user.openAccess && ['staff', 'hod'].includes(user.role)) return true;
  if (user.role === 'hod') return complaint.department === user.department;
  if (['staff', 'faculty'].includes(user.role)) {
    return complaint.assignedToId === user.id
      || (!complaint.assignedToId && [user.name, user.email].includes(complaint.assignedTo));
  }
  return false;
};
const discardFiles = (files = []) => {
  for (const file of files) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
};
const validateEvidence = (req, res, next) => {
  const invalidFile = (req.files || []).find((file) => {
    const contents = fs.readFileSync(file.path);
    return !imageTypes[file.mimetype].signature(contents);
  });
  if (!invalidFile) return next();

  discardFiles(req.files);
  return res.status(400).json({ message: 'An evidence file did not match its declared image type.' });
};

router.use(requireAuth);

router.get('/', (req, res) => {
  const { department, status, priority, search, mine } = req.query;
  let results = db.get('complaints').value();
  if (department && department !== 'all') results = results.filter((item) => item.department === department);
  if (status && status !== 'all') results = results.filter((item) => item.status === status);
  if (priority && priority !== 'all') results = results.filter((item) => item.priority === priority);
  if (mine === 'true') results = results.filter((item) => item.createdBy === req.user.id);
  if (['staff', 'faculty'].includes(req.user.role)) {
    results = results.filter((item) => canManageComplaint(req.user, item));
  } else if (req.user.role === 'hod') {
    if (!(req.user.openAccess && !req.user.department)) {
      results = results.filter((item) => item.department === req.user.department);
    }
  } else if (['student'].includes(req.user.role)) {
    results = results.filter((item) => item.visibility !== 'private' || item.createdBy === req.user.id);
  }
  if (typeof search === 'string' && search.trim()) {
    const query = search.trim().toLowerCase();
    results = results.filter((item) =>
      `${item.title} ${item.description} ${item.location} ${item.department}`.toLowerCase().includes(query));
  }
  return res.json(sortNewest(results).map((item) => presentComplaint(req.user, item)));
});

router.post('/', upload.array('evidence', 4), validateEvidence, (req, res) => {
  try {
    const { title, description, department, priority, location } = req.body;
    const studentName = typeof req.body.studentName === 'string' ? req.body.studentName.trim() : '';
    const rollNumber = typeof req.body.rollNumber === 'string' ? req.body.rollNumber.trim() : '';
    if (!studentName || studentName.length > 100 || !rollNumber || rollNumber.length > 40) {
      discardFiles(req.files);
      return res.status(400).json({ message: 'Student name and roll number are required (maximum 100 and 40 characters).'});
    }
    if (!title?.trim() || !description?.trim() || !location?.trim()) {
      discardFiles(req.files);
      return res.status(400).json({ message: 'Title, description, and location are required.' });
    }
    if (!departments.includes(department)) {
      discardFiles(req.files);
      return res.status(400).json({ message: 'Select a valid department.' });
    }
    if (!priorities.includes(priority)) {
      discardFiles(req.files);
      return res.status(400).json({ message: 'Select a valid priority.' });
    }

    const timestamp = new Date().toISOString();
    const complaint = {
      id: randomUUID(),
      studentName,
      rollNumber,
      title: title.trim(),
      description: description.trim(),
      department,
      priority,
      location: location.trim(),
      status: 'Submitted',
      progress: 0,
      eta: 'Pending review',
      assignedTo: '',
      assignedToId: '',
      createdBy: req.user.id,
      author: req.user.name,
      votes: {},
      comments: [],
      actionLog: [{
        id: randomUUID(),
        type: 'submitted',
        message: 'Complaint submitted and sent for review.',
        department,
        author: req.user.name,
        role: req.user.role,
        createdAt: timestamp,
      }],
      evidence: (req.files || []).map((file) => ({
        name: file.originalname,
        url: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    db.get('complaints').unshift(complaint).write();
    return res.status(201).json(complaint);
  } catch (error) {
    discardFiles(req.files);
    console.error('Complaint creation failed:', error);
    return res.status(500).json({ message: 'Unable to submit complaint.' });
  }
});

router.patch('/:id/vote', (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down', 'clear'].includes(direction)) {
    return res.status(400).json({ message: 'Vote must be up, down, or clear.' });
  }
  const complaint = findComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  const votes = { ...complaint.votes };
  if (direction === 'clear' || votes[req.user.id] === direction) delete votes[req.user.id];
  else votes[req.user.id] = direction;
  const score = Object.values(votes).reduce((total, vote) => total + (vote === 'up' ? 1 : -1), 0);
  db.get('complaints').find({ id: complaint.id }).assign({
    votes,
    voteScore: score,
    updatedAt: new Date().toISOString(),
  }).write();
  return res.json(presentComplaint(req.user, { ...complaint, votes, voteScore: score }));
});

router.post('/:id/comments', (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ message: 'Comment cannot be empty.' });
  const complaint = findComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });

  const comment = {
    id: randomUUID(),
    userId: req.user.id,
    author: req.user.name,
    role: req.user.role,
    text,
    createdAt: new Date().toISOString(),
  };
  const updated = { ...complaint, comments: [...complaint.comments, comment], updatedAt: comment.createdAt };
  db.get('complaints').find({ id: complaint.id }).assign(updated).write();

  if (req.user.role === 'student') {
    createNotification(complaint.createdBy, complaint.id, `New comment on “${complaint.title}”.`);
  }
  return res.status(201).json(presentComplaint(req.user, updated));
});

router.patch('/:id/updates', requireStaff, (req, res) => {
  const complaint = findComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  const { status, progress, eta, department, assignedTo, message } = req.body;
  if (!canManageComplaint(req.user, complaint)) {
    return res.status(403).json({ message: 'You can only update complaints within your assigned access.' });
  }
  const hod = req.user.role === 'hod';
  const assignedStaff = ['staff', 'faculty'].includes(req.user.role);
  if (assignedTo !== undefined && typeof assignedTo !== 'string') {
    return res.status(400).json({ message: 'Select a valid staff assignment.' });
  }
  if ((hod || assignedStaff) && department !== undefined && department !== complaint.department) {
    return res.status(403).json({ message: 'Only Admin/Management can reassign a complaint to another department.' });
  }
  if (assignedStaff && assignedTo !== undefined) {
    return res.status(403).json({ message: 'Only HOD or Admin/Management can assign staff.' });
  }
  if (status !== undefined && !statuses.includes(status)) {
    return res.status(400).json({ message: 'Select a valid complaint status.' });
  }
  if (progress !== undefined && (!Number.isFinite(Number(progress)) || Number(progress) < 0 || Number(progress) > 100)) {
    return res.status(400).json({ message: 'Progress must be between 0 and 100.' });
  }
  if (department !== undefined && !departments.includes(department)) {
    return res.status(400).json({ message: 'Select a valid department.' });
  }
  if (department && hod && req.user.department && department !== req.user.department) {
    return res.status(403).json({ message: 'HODs can only manage their own department.' });
  }
  let assignee = null;
  if (assignedTo !== undefined && assignedTo.trim()) {
    assignee = db.get('users').find((user) =>
      ['staff', 'faculty'].includes(user.role)
      && user.department === (department || complaint.department)
      && [user.id, user.name, user.email].includes(assignedTo.trim())).value();
    if (!assignee) {
      return res.status(400).json({ message: 'Select a staff member in the complaint department.' });
    }
  }

  const timestamp = new Date().toISOString();
  const nextStatus = status || complaint.status;
  const statusChanged = nextStatus !== complaint.status;
  const nextProgress = nextStatus === 'Resolved' ? 100 : (progress === undefined ? complaint.progress : Number(progress));
  const updates = {
    status: nextStatus,
    progress: nextProgress,
    eta: typeof eta === 'string' && eta.trim() ? eta.trim() : complaint.eta,
    department: department || complaint.department,
    assignedTo: assignedTo === undefined ? complaint.assignedTo : (assignee?.name || ''),
    assignedToId: assignedTo === undefined ? (complaint.assignedToId || '') : (assignee?.id || ''),
    updatedAt: timestamp,
  };
  const messages = [];
  if (status && status !== complaint.status) messages.push(`Status changed to ${status}.`);
  if (department && department !== complaint.department) messages.push(`Assigned to ${department}.`);
  if (assignedTo !== undefined && updates.assignedToId !== (complaint.assignedToId || '')) {
    messages.push(assignee ? `Assigned to ${assignee.name}.` : 'Staff assignment cleared.');
  }
  if (progress !== undefined && Number(progress) !== complaint.progress) messages.push(`Progress updated to ${nextProgress}%.`);
  if (typeof message === 'string' && message.trim()) messages.push(message.trim());
  if (!messages.length) return res.status(400).json({ message: 'Provide at least one update.' });

  const actionLog = [
    ...complaint.actionLog,
    ...messages.map((entry) => ({
      id: randomUUID(),
      type: 'update',
      message: entry,
      department: updates.department,
      author: req.user.name,
      role: req.user.role,
      createdAt: timestamp,
    })),
  ];
  const updated = { ...complaint, ...updates, actionLog };
  db.get('complaints').find({ id: complaint.id }).assign(updated).write();

  if (statusChanged) {
    const recipients = new Set([complaint.createdBy, ...Object.keys(complaint.votes)]);
    recipients.delete(req.user.id);
    recipients.forEach((userId) => createNotification(userId, complaint.id, `“${complaint.title}” is now ${nextStatus}.`));
  }
  if (updates.assignedToId && updates.assignedToId !== complaint.assignedToId) {
    createNotification(updates.assignedToId, complaint.id, `You were assigned “${complaint.title}”.`);
  }
  return res.json(updated);
});

router.get('/notifications', (req, res) => {
  const items = db.get('notifications')
    .filter({ userId: req.user.id })
    .value()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json(items);
});

router.patch('/notifications/read-all', (req, res) => {
  const timestamp = new Date().toISOString();
  db.get('notifications')
    .filter({ userId: req.user.id })
    .each((notification) => { notification.readAt = timestamp; })
    .write();
  return res.json({ message: 'Notifications marked as read.' });
});

function createNotification(userId, complaintId, message) {
  if (!userId) return;
  db.get('notifications').unshift({
    id: randomUUID(),
    userId,
    complaintId,
    message,
    createdAt: new Date().toISOString(),
    readAt: null,
  }).write();
}

module.exports = router;
