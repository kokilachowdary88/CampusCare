const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../database');
const { requireAuth, requireStaff } = require('../middleware/auth');

const router = express.Router();
const staffRoles = ['staff', 'hod', 'management', 'faculty', 'admin'];
const departments = [
  'Faculty/Teaching', 'Transport', 'Electrical/Maintenance', 'Housekeeping',
  'Hostel', 'Canteen Committee', 'Examination', 'Infrastructure', 'Library',
  'Laboratory', 'Anti-Ragging',
];

const publicUser = ({ passwordHash, ...user }) => user;

const createToken = (user) => jwt.sign(
  { sub: user.id },
  process.env.JWT_SECRET,
  { expiresIn: '7d' },
);

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'student', inviteCode, department } = req.body;
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!cleanName || !cleanEmail || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Name, valid email, and a password of at least 8 characters are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!['student', ...staffRoles].includes(role)) {
      return res.status(400).json({ message: 'Select a valid account type.' });
    }
    if (staffRoles.includes(role) && (!process.env.ADMIN_INVITE_CODE || inviteCode !== process.env.ADMIN_INVITE_CODE)) {
      return res.status(403).json({ message: 'A valid staff invitation code is required.' });
    }
    if (['staff', 'faculty', 'hod'].includes(role) && !departments.includes(department)) {
      return res.status(400).json({ message: 'Select your assigned department.' });
    }
    if (db.get('users').find({ email: cleanEmail }).value()) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = {
      id: randomUUID(),
      name: cleanName,
      email: cleanEmail,
      department: typeof department === 'string' ? department.trim() : '',
      role,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString(),
    };
    db.get('users').push(user).write();
    return res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Registration failed:', error);
    return res.status(500).json({ message: 'Unable to create account right now.' });
  }
});

router.post('/guest', (req, res) => {
  const guestKey = typeof req.body.guestKey === 'string' ? req.body.guestKey : '';
  if (!/^[0-9a-f-]{36}$/i.test(guestKey)) {
    return res.status(400).json({ message: 'A valid guest session key is required.' });
  }

  const id = `guest-${guestKey}`;
  let user = db.get('users').find({ id }).value();
  if (!user) {
    user = {
      id,
      name: 'Student Access',
      email: '',
      department: '',
      role: 'student',
      guest: true,
      createdAt: new Date().toISOString(),
    };
    db.get('users').push(user).write();
  }
  return res.json({ token: createToken(user), user: publicUser(user) });
});

router.post('/open-access', (req, res) => {
  const { role, department, name, guestKey } = req.body;
  const allowedRoles = ['staff', 'hod', 'management'];
  const cleanDepartment = typeof department === 'string' ? department.trim() : '';
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';

  if (!/^[0-9a-f-]{36}$/i.test(guestKey || '') || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Select a valid staff access level.' });
  }
  if (cleanDepartment && !departments.includes(cleanDepartment)) {
    return res.status(400).json({ message: 'Select a valid department.' });
  }

  const id = `open-${role}-${guestKey}`;
  const user = {
    id,
    name: cleanName || (role === 'management' ? 'Admin / Management' : role === 'hod' ? 'HOD Access' : 'Staff Access'),
    email: '',
    department: role === 'management' ? '' : cleanDepartment,
    role,
    openAccess: true,
    createdAt: new Date().toISOString(),
  };
  const existingUser = db.get('users').find({ id }).value();
  if (existingUser) db.get('users').find({ id }).assign(user).write();
  else db.get('users').push(user).write();

  return res.json({ token: createToken(user), user });
});

router.post('/login', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = db.get('users').find({ email }).value();

    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    return res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: 'Unable to sign in right now.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.get('/staff', requireAuth, requireStaff, (req, res) => {
  const requestedDepartment = typeof req.query.department === 'string' ? req.query.department : '';
  if (requestedDepartment && !departments.includes(requestedDepartment)) {
    return res.status(400).json({ message: 'Select a valid department.' });
  }
  let staff = db.get('users').filter((user) => staffRoles.includes(user.role)).value();

  if (['staff', 'faculty'].includes(req.user.role)) {
    staff = staff.filter((user) => user.id === req.user.id);
  } else if (req.user.role === 'hod' && !(req.user.openAccess && !req.user.department)) {
    staff = staff.filter((user) => user.department === req.user.department);
  }

  if (requestedDepartment) staff = staff.filter((user) => user.department === requestedDepartment);
  return res.json(staff.map(({ id, name, email, role, department }) => ({ id, name, email, role, department })));
});

module.exports = router;
