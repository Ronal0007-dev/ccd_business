require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { sequelize } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bizregistry_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/locations', require('./routes/locations'));
app.use('/businessmen', require('./routes/businessmen'));
app.use('/users', require('./routes/users'));

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

app.use((req, res) => {
  res.status(404).render('auth/login', {
    title: '404 Not Found', error: ['Page not found.'], success: []
  });
});

sequelize.sync({ alter: true })
  .then(() => {
    console.log('✅ Database synced.');
    app.listen(PORT, () => console.log(`🚀 BizRegistry running at http://localhost:${PORT}`));
  })
  .catch(err => { console.error('❌ DB sync failed:', err); process.exit(1); });
