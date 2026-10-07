const jwt = require('jsonwebtoken');
const db = require('../database');

const requireAuth = (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Sign in to continue.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.get('users').find({ id: payload.sub }).value();
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Session is invalid or expired.' });
  }
};

const isStaffRole = (role) => ['staff', 'faculty', 'hod', 'admin', 'management'].includes(role);
const isManagementRole = (role) => ['admin', 'management'].includes(role);

const requireStaff = (req, res, next) => {
  if (!isStaffRole(req.user.role)) {
    return res.status(403).json({ message: 'Staff access is required.' });
  }
  return next();
};

module.exports = { requireAuth, requireStaff, isStaffRole, isManagementRole };
