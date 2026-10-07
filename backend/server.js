const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in backend/.env before starting the API.');
}

const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', persistence: 'local-json-database' });
});
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);

app.use((error, req, res, next) => {
  if (error instanceof require('multer').MulterError) {
    return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE'
      ? 'Each image must be 5 MB or smaller.'
      : 'Upload no more than 4 evidence images.' });
  }
  if (error.message === 'Only image evidence is allowed.') {
    return res.status(400).json({ message: error.message });
  }
  console.error('Unhandled request error:', error);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

app.listen(port, () => {
  console.log(`CampusCare API running at http://localhost:${port}`);
  console.log(`Persistent database: ${process.env.DATABASE_FILE || path.join(__dirname, 'data', 'campuscare.json')}`);
});
