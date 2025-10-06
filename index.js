const express = require('express');
const pg = require('pg');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcrypt');
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
    secret: process.env.SESSION_SECRET || 'your-secret-key-very-secure',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Flash messages
app.use(flash());

// Global variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/login');
};

// Routes
app.get('/', async (req, res) => {
    res.render('index');
});

app.get('/appointments', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id; // Get ID of the logged-in user's ID
        const result = await db.query('SELECT * FROM appointments WHERE user_id = $1 ORDER BY id DESC', [userId]);
        const appointments = result.rows; // Fetch appointments from the database
        res.render('appointments', { appointments });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error fetching appointments');
        res.render('appointments', { appointments: [] }); // Render with empty appointments
    }
});

app.get('/records', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id; // Getting the logged in user's Id
        const result = await db.query('SELECT * FROM medical_records WHERE user_id = $1 ORDER BY record_date DESC', [userId]);
        const records = result.rows; // Fetching records from the database

        res.render('records', {
            records: records,
            username: req.session.user.username
        });
    } catch (err) {
        console.log('Error fetching medical records', err);
        req.flash('error_msg', 'Error fetching your medical records');
        res.render('records', {
            records: [],
            username: req.session.user.username
        });
    }
});

// Middleware to check if user is an Admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error_msg', 'Access denied. You must be an administrator.');
    res.redirect('/');
};

// Route to show the form (Requires Admin Role)
app.get('/newrecord', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Fetch all users to populate a dropdown (so admin can select the patient)
        const patientResult = await db.query('SELECT id, username, email FROM users WHERE role = $1 ORDER BY username', ['user']);
        const patients = patientResult.rows;

        res.render('newrecord', { 
            patients: patients,
            // Assuming current user is the doctor/admin
            doctor_name: req.session.user.username 
        });

    } catch (err) {
        console.error('Error fetching patient list:', err);
        req.flash('error_msg', 'Error preparing record form.');
        res.redirect('/records');
    }
});

// POST route to submit the new medical record (Requires Admin Role)
app.post('/newrecord', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, diagnosis, treatment_plan, doctor_notes, blood_pressure, allergies, record_date } = req.body;
    
    // Admin's username who is adding the record
    const admin_user = req.session.user.username; 
    
    try {
        const query = `INSERT INTO medical_records 
            (user_id, diagnosis, treatment_plan, doctor_notes, blood_pressure, allergies, record_date) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)`;
        
        await db.query(query, [
            patient_id, 
            diagnosis, 
            treatment_plan, 
            doctor_notes, 
            blood_pressure, 
            allergies, 
            // Use the date from the form or fallback to today
            record_date || new Date().toISOString().split('T')[0]
        ]);

        req.flash('success_msg', `Medical record successfully added for Patient ID ${patient_id}.`);
        res.redirect('/records');
    } catch (err) {
        console.error('Error adding new medical record:', err);
        req.flash('error_msg', 'Error adding record. Please check inputs and try again.');
        res.redirect('/newrecord');
    }
});

app.get('/newappointments', isAuthenticated, async (req, res) => {
    res.render('newappointments');
});

// Post request to add an appointment
app.post('/newappointments', isAuthenticated, async (req, res) => {
    console.log(req.body);
    const { patient_name, gender, phone, doctor_name } = req.body;
    const userId = req.session.user.id; // Get the user ID from the session
    try {
        const query = 'INSERT INTO appointments (patient_name, gender, phone, doctor_name, user_id) VALUES ($1, $2, $3, $4, $5)';
        await db.query(query, [patient_name, gender, phone, doctor_name, userId]);
        req.flash('success_msg', 'Appointment added successfully');
        res.redirect('/appointments'); // Redirect to appointments page
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error adding appointment. Please try again.');
        res.redirect('/newappointments'); // Redirect back to new appointments page
    }
});

// Authentication routes (login, signup)
app.get('/login', async (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (user) {
            // Compare submitted password with stored hashed password
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (isMatch) {
                // Set session and redirect to home page
                req.session.user = { 
                    id: user.id, 
                    username: user.username,
                    email: user.email,
                    role: user.role
                };
                req.flash('success_msg', 'Login successful! Welcome back.');
                res.redirect('/');
            } else {
                req.flash('error_msg', 'Invalid Credentials (password). Please try again.');
                res.redirect('/login');
            }
        } else {
            req.flash('error_msg', 'Invalid Credentials (username). Please try again.');
            res.redirect('/login');
        }
    } catch (err) {
            console.error('Login error:', err);
            req.flash('error_msg', 'An internal error occurred during login.');
            res.redirect('/login');
        }
});

app.get('/signup', async (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    const saltRounds = 10;

    try {
        // Hash the password
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Insert new user into the database
        const query = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email';
        const result = await db.query(query, [username, email, password_hash]);
        const newUser = result.rows[0];

        // Log the user in immediately after signup
        req.session.user = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email
        };

        req.flash('success_msg', 'Registration successful! Welcome to CareFlow HMS.');
        res.redirect('/');
    } catch (err) {
        if (err.code === '23505') {
            // PostgreSQL unique vioalation error code
            req.flash('error_msg', 'Username or email already exists.');
        } else {
            console.error('Signup error:', err);
            req.flash('error_msg', 'An error occurred during registration.');
        }
    }
});

app.post('/logout', async (req, res) => {
    req.flash('success_msg', 'You have been successfully logged out.');
    
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); // Clear session cookie by assuming default cookie name
        res.redirect('/');
    });
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