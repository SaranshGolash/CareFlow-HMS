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
    ssl: {
        rejectUnauthorized: false 
    }
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

// Route to dashboard
app.get('/dashboard', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    try {
        // Count Appointments
        const apptResult = await db.query('SELECT COUNT(*) AS count FROM appointments WHERE user_id = $1', [userId]);
        
        // Count Medical Records
        const recordResult = await db.query('SELECT COUNT(*) AS count FROM medical_records WHERE user_id = $1', [userId]);

        // Get Latest Vital Reading Timestamp
        const vitalDateResult = await db.query(
            'SELECT reading_timestamp FROM health_vitals WHERE user_id = $1 ORDER BY reading_timestamp DESC LIMIT 1', 
            [userId]
        );

        res.render('dashboard', {
            apptCount: apptResult.rows[0].count,
            recordCount: recordResult.rows[0].count,
            latestVitalDate: vitalDateResult.rows[0] ? vitalDateResult.rows[0].reading_timestamp : null
        });

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        req.flash('error_msg', 'Could not load dashboard data.');
        res.render('dashboard', { apptCount: 0, recordCount: 0, latestVitalDate: null });
    }
});

// Route to settings
app.get('/settings', isAuthenticated, async (req, res) => {
    res.render('settings', { currentUser: req.session.user });
});

app.post('/settings', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { username, email, current_password, new_password } = req.body;
    const saltRounds = 10;

    try {
        // Fetch user to verify current password and get stored hash
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/settings');
        }

        // Verify current password
        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            req.flash('error_msg', 'The current password you entered is incorrect.');
            return res.redirect('/settings');
        }

        let updateQuery = 'UPDATE users SET username = $1, email = $2';
        let queryParams = [username, email, userId];
        let paramIndex = 3;

        // Handle Password Change (if new_password is provided)
        if (new_password) {
            if (new_password.length < 6) {
                req.flash('error_msg', 'New password must be at least 6 characters long.');
                return res.redirect('/settings');
            }
            const newPasswordHash = await bcrypt.hash(new_password, saltRounds);
            updateQuery += `, password_hash = $${paramIndex++}`;
            queryParams.splice(2, 0, newPasswordHash); // Inserts a new hash before userId
        }
        
        updateQuery += ' WHERE id = $3 RETURNING id, username, email, role';

        queryParams = [username, email];
        if (new_password) {
             queryParams.push(newPasswordHash);
        }
        queryParams.push(userId);
        
        // Executing update
        const updatedUserResult = await db.query(updateQuery, queryParams);
        const updatedUser = updatedUserResult.rows[0];

        // Updating Session
        req.session.user = {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role
        };

        req.flash('success_msg', 'Profile updated successfully!');
        res.redirect('/settings');

    } catch (err) {
        console.error('Settings update error:', err);
         if (err.code === '23505') { // Unique constraint violation
            req.flash('error_msg', 'Username or Email already exists.');
        } else {
            req.flash('error_msg', 'An error occurred during profile update.');
        }
        res.redirect('/settings');
    }
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

app.get('/monitoring', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id; // Get the logged in user's Id
        const result = await db.query(`SELECT
             reading_timestamp, heart_rate, temperature, spo2, glucose_level, systolic_bp, diastolic_bp 
             FROM health_vitals
             WHERE user_id = $1
             ORDER BY reading_timestamp DESC
             LIMIT 10`,
            [userId]
        );
        const vitals = result.rows; // Fetching vitals from the database
        const latestVitals = vitals.length > 0 ? vitals[0] : null; // Calculating the current/latest metrics
        res.render('monitoring', {
            vitals: vitals,
            latest: latestVitals,
            username: req.session.user.username
        });
    } catch (err) {
        console.log('Error fetching health monitoring data:', err);
        req.flash('error_msg', 'Error fetching your health monitoring data');
        req.render('monitoring', {
            vitals: [],
            latest: null,
            username: req.session.user.username
        });
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

// Route to view a specific medical record
app.get('/records/:id', isAuthenticated, async (req, res) => {
    // Get parameters and current user ID
    const recordId = req.params.id;
    const userId = req.session.user.id; // Security check

    try {
        // Query the database, ensuring the fetched record ID ($1) 
        // also belongs to the currently logged-in user ID ($2).
        const query = `
            SELECT * FROM medical_records 
            WHERE record_id = $1 AND user_id = $2
        `;
        const result = await db.query(query, [recordId, userId]);
        const record = result.rows[0];

        // Handle Unauthorized Access or Not Found
        if (!record) {
            // If the record exists but belongs to another user, or doesn't exist at all,
            // the query returns no rows, triggering this block.
            req.flash('error_msg', 'Medical record not found or access denied.');
            return res.redirect('/records');
        }

        res.render('view_record', { record: record });

    } catch (err) {
        console.error(`Error fetching record ID ${recordId}:`, err);
        req.flash('error_msg', 'An error occurred while retrieving the record.');
        res.redirect('/records');
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

// Route to show the form to add health vitals (Admin Only)
app.get('/add-vitals', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const patientResult = await db.query('SELECT id, username, email FROM users WHERE role = $1 ORDER BY username', ['user']);
        const patients = patientResult.rows;

        res.render('add_vitals', {
            patients: patients,
            admin_username : req.session.user.username
        });
    } catch (err) {
        console.error('Error fetching patient list for vitals form:', err);
        req.flash('error_msg', 'Error preparing vitals input form.');
        res.redirect('/monitoring');
    }
});

//POST Route to submit the new health vitals data (Admin Only)
app.post('/add-vitals', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, heart_rate, temperature, spo2, glucose_level, systolic_bp, diastolic_bp, reading_timestamp } = req.body;

    if(!patient_id) {
        req.flash('error_msg', 'Please select a patient.');
        return res.redirect('/add-vitals');
    }

    try {
        const query = `INSERT INTO health_vitals 
            (user_id, heart_rate, temperature, spo2, glucose_level, systolic_bp, diastolic_bp, reading_timestamp) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        await db.query(query, [
            patient_id,
            heart_rate || null,
            temperature || null, 
            spo2 || null, 
            glucose_level || null, 
            systolic_bp || null, 
            diastolic_bp || null, 
            reading_timestamp || new Date().toISOString() // To provide current time
        ]);

        req.flash(`success_msg', 'Vitals successfully  added for Patient ID ${patient_id}.`);
        res.redirect('/monitoring');
    } catch (err) {
        console.error('Error adding new health vitals data:', err);
        req.flash('error_msg', 'Error adding vitals. Please check inputs and try again.');
        res.redirect('/add-vitals');
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