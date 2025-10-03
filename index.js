const express = require('express');
const pg = require('pg');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
require('dotenv').config();

const app = express();

// Database connection
const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

db.connect()
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.error('Database connection error:', err));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Flash messages
app.use(flash());

// Global variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// Routes
app.get('/', async (req, res) => {
    res.render('index');
});

app.get('/appointments', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM appointments');
        const appointments = result.rows; // Fetch appointments from the database
        res.render('appointments', { appointments });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error fetching appointments');
        res.render('appointments', { appointments: [] }); // Render with empty appointments
    }
});

app.get('/newappointments', async (req, res) => {
    res.render('newappointments');
});

// Post request to add an appointment
app.post('/newappointments', async (req, res) => {
    console.log(req.body);
    const { patient_name, gender, phone, doctor_name } = req.body;
    try {
        await db.query('INSERT INTO appointments (patient_name, gender, phone, doctor_name) VALUES ($1, $2, $3, $4)', [patient_name, gender, phone, doctor_name]);
        req.flash('success_msg', 'Appointment added successfully');
        res.redirect('/appointments'); // Redirect to appointments page
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error adding appointment');
        res.redirect('/newappointments'); // Redirect back to new appointments page
    }
});

// Error handling
app.use((req, res, next) => {
    res.status(404).render('error', { 
        message: 'Page Not Found',
        error: { status: 404 }
    });
});

app.use((err, req, res, next) => {
    res.status(err.status || 500).render('error', {
        message: err.message,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});