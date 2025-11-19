
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
require('dotenv').config();
require('./db'); // Initialize DB

const paymentService = require('./services/payment');
console.log('paymentService keys:', Object.keys(paymentService));
console.log('initiatePayment is function?', typeof paymentService.initiatePayment);

const staticRoutes = require('./routes/staticRoutes');
const adminRoutes = require('./routes/adminRoutes');
const memberRoutes = require('./routes/memberRoutes');
const contributionRoutes = require('./routes/contributionRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const fundRoutes = require('./routes/fundRoutes');
const omaRoutes = require('./routes/omaRoutes');
const fundSummaryRoutes = require('./routes/fundSummaryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const supportRoutes = require('./routes/supportRoutes');

const { requireAuth, requireRole, allowRoles, requireVerifiedEmail } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------- Middleware -----------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Fixed path

// Session configuration - FIXED for production
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // Auto-set based on environment
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true 
  },
  store: require('./config/sessionStore') // Add proper session store
}));

// Flash messages
app.use(flash());

// Make session and flash available in views
app.use((req, res, next) => {
  console.log('[DEBUG] Session object:', req.session);
  res.locals.flash = req.flash();
  res.locals.user = req.session.user || null;
  res.locals.omaUser = req.session.omaUser || null;
  res.locals.currentPath = req.path; // Useful for navigation
  next();
});

// ----------------- Routes -----------------
app.get('/', (req, res) => res.render('home', { user: req.session.user }));

// Public routes
app.use(staticRoutes);
app.use('/oma', omaRoutes);
app.use('/auth', authRoutes);
app.use('/', authRoutes);

// Email verification middleware (add this if missing)
const { checkVerification } = require('./middleware/auth');

// Protected routes with proper ordering
app.use('/admin', requireAuth, requireRole('admin'), adminRoutes);
app.use('/member', requireAuth, requireVerifiedEmail, allowRoles('chairman','admin'), memberRoutes);
app.use('/contributions', requireAuth, requireVerifiedEmail, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), contributionRoutes);
app.use('/payments', requireAuth, requireVerifiedEmail, paymentRoutes);
app.use('/support', requireAuth, requireVerifiedEmail, supportRoutes);

// General authenticated routes
app.use('/', requireAuth, requireVerifiedEmail, userRoutes);
app.use('/', requireAuth, requireVerifiedEmail, fundRoutes);
app.use('/', requireAuth, requireVerifiedEmail, fundSummaryRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { 
    title: 'Page Not Found',
    user: req.session.user 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
    user: req.session.user
  });
});

// Remove the tempUsers cleanup if not defined, or define it properly
// If you need temporary user storage, use a proper database solution

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

