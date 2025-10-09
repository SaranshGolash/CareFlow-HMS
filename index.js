const express = require('express');
const pg = require('pg');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Automatically convert Postgres NUMERIC (type code 1700) to JavaScript float
// This is necessary because node-pg returns DECIMAL/NUMERIC as strings by default.
const NUMERIC_OID = 1700;
pg.types.setTypeParser(NUMERIC_OID, (value) => {
    return value === null ? null : parseFloat(value);
});

const app = express();

// Database connection
const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // CRITICAL for Render deployment: Requires SSL connection
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

// --- AUTHORIZATION MIDDLEWARE ---

// Check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/login');
};

// Check if user is an Admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error_msg', 'Access denied. You must be an administrator.');
    res.redirect('/');
};

// --- CORE ROUTES ---

app.get('/', async (req, res) => {
    res.render('index');
});

// Appointments
app.get('/appointments', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const result = await db.query('SELECT * FROM appointments WHERE user_id = $1 ORDER BY id DESC', [userId]);
        const appointments = result.rows;
        res.render('appointments', { appointments });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error fetching appointments');
        res.render('appointments', { appointments: [] });
    }
});

app.get('/newappointments', isAuthenticated, async (req, res) => {
    res.render('newappointments');
});

app.post('/newappointments', isAuthenticated, async (req, res) => {
    const { patient_name, gender, phone, doctor_name } = req.body;
    const userId = req.session.user.id;
    try {
        const query = 'INSERT INTO appointments (patient_name, gender, phone, doctor_name, user_id) VALUES ($1, $2, $3, $4, $5)';
        await db.query(query, [patient_name, gender, phone, doctor_name, userId]);
        req.flash('success_msg', 'Appointment added successfully');
        res.redirect('/appointments');
    } catch (err) {
        console.error('Error adding appointment:', err);
        req.flash('error_msg', 'Error adding appointment. Please try again.');
        res.redirect('/newappointments');
    }
});

// Medical Records
app.get('/records', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const result = await db.query('SELECT * FROM medical_records WHERE user_id = $1 ORDER BY record_date DESC, record_id DESC', [userId]);
        const records = result.rows;
        res.render('records', { 
            records: records,
            username: req.session.user.username 
        });

    } catch (err) {
        console.error('Error fetching medical records:', err);
        req.flash('error_msg', 'Error fetching your medical records.');
        res.render('records', { records: [], username: req.session.user.username });
    }
});

app.get('/records/:id', isAuthenticated, async (req, res) => {
    const recordId = req.params.id;
    const userId = req.session.user.id;

    try {
        const query = `
            SELECT * FROM medical_records 
            WHERE record_id = $1 AND user_id = $2
        `;
        const result = await db.query(query, [recordId, userId]);
        const record = result.rows[0];

        if (!record) {
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


// Monitoring
app.get('/monitoring', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const result = await db.query(
            `SELECT 
                reading_timestamp, heart_rate, temperature, spo2, glucose_level, systolic_bp, diastolic_bp
             FROM health_vitals 
             WHERE user_id = $1 
             ORDER BY reading_timestamp ASC`,
            [userId]
        );
        
        const rawVitals = result.rows.map(vital => ({
            ...vital,
            glucose_level: vital.glucose_level ? parseFloat(vital.glucose_level) : null,
            temperature: vital.temperature ? parseFloat(vital.temperature) : null,
            spo2: vital.spo2 ? parseFloat(vital.spo2) : null
        }));

        // Data structure for Chart.js
        const chartData = {
            labels: rawVitals.map(v => new Date(v.reading_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
            heartRate: rawVitals.map(v => v.heart_rate),
            systolicBP: rawVitals.map(v => v.systolic_bp),
            diastolicBP: rawVitals.map(v => v.diastolic_bp),
            glucose: rawVitals.map(v => v.glucose_level)
        };

        const latestVitals = rawVitals.length > 0 ? rawVitals[rawVitals.length - 1] : null;

        res.render('monitoring', { 
            vitals: rawVitals.slice(-10).reverse(),
            latest: latestVitals,
            chartData: chartData,
            username: req.session.user.username 
        });

    } catch (err) {
        console.error('Error fetching health monitoring data:', err);
        req.flash('error_msg', 'Error fetching health monitoring data.');
        res.render('monitoring', { vitals: [], latest: null, chartData: {}, username: req.session.user.username });
    }
});

// User Management Routes
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard');
});

app.get('/settings', isAuthenticated, (req, res) => {
    res.render('settings');
});

app.post('/settings', isAuthenticated, async (req, res) => {
    const { username, email, password, new_password } = req.body;
    const userId = req.session.user.id;
    
    try {
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        if (!user) {
            req.session.destroy();
            req.flash('error_msg', 'Session expired. Please log in again.');
            return res.redirect('/login');
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) {
            req.flash('error_msg', 'Current password is required and must be correct to update profile.');
            return res.redirect('/settings');
        }

        let updateQuery = 'UPDATE users SET username = $1, email = $2';
        const queryParams = [username, email];
        let paramIndex = 3;

        if (new_password) {
            const newPasswordHash = await bcrypt.hash(new_password, 10);
            updateQuery += `, password_hash = $${paramIndex}`;
            queryParams.push(newPasswordHash);
            paramIndex++;
        }

        updateQuery += ` WHERE id = $${paramIndex}`;
        queryParams.push(userId);

        await db.query(updateQuery, queryParams);

        req.session.user.username = username;
        req.session.user.email = email;

        req.flash('success_msg', 'Profile updated successfully.');
        res.redirect('/settings');

    } catch (err) {
        if (err.code === '23505') {
            req.flash('error_msg', 'That username or email is already taken.');
        } else {
            console.error('Settings update error:', err);
            req.flash('error_msg', 'An error occurred during update.');
        }
        res.redirect('/settings');
    }
});

// --- ADMIN MANAGEMENT ROUTES ---

// Display the Service Catalog
app.get('/services', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM services ORDER BY category, service_name');
        const services = result.rows;
        
        // Format cost for display consistency
        const formattedServices = services.map(s => ({
            ...s,
            cost: parseFloat(s.cost).toFixed(2)
        }));

        res.render('service_catalog', { services: formattedServices });
    } catch (err) {
        console.error('Error fetching service catalog:', err);
        req.flash('error_msg', 'Error retrieving service data.');
        res.render('service_catalog', { services: [] });
    }
});

// Add a New Service
app.post('/services', isAuthenticated, isAdmin, async (req, res) => {
    const { service_name, category, cost, description } = req.body;
    
    if (!service_name || !category || !cost || isNaN(cost)) {
        req.flash('error_msg', 'Service Name, Category, and a valid Cost are required.');
        return res.redirect('/services');
    }

    try {
        const query = `
            INSERT INTO services (service_name, category, cost, description)
            VALUES ($1, $2, $3, $4)
        `;
        await db.query(query, [service_name, category, cost, description]);

        req.flash('success_msg', `Service "${service_name}" added successfully.`);
        res.redirect('/services');
    } catch (err) {
        if (err.code === '23505') {
            req.flash('error_msg', 'A service with that name already exists.');
        } else {
            console.error('Error adding new service:', err);
            req.flash('error_msg', 'An error occurred while adding the service.');
        }
        res.redirect('/services');
    }
});

// Delete a Service (using method-override)
app.delete('/services/:id', isAuthenticated, isAdmin, async (req, res) => {
    const serviceId = req.params.id;

    try {
        const result = await db.query('DELETE FROM services WHERE service_id = $1', [serviceId]);

        if (result.rowCount > 0) {
            req.flash('success_msg', 'Service deleted successfully.');
        } else {
            req.flash('error_msg', 'Service not found.');
        }
        res.redirect('/services');
    } catch (err) {
        console.error('Error deleting service:', err);
        req.flash('error_msg', 'An error occurred while deleting the service.');
        res.redirect('/services');
    }
});


// New Record Form
app.get('/newrecord', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const patientResult = await db.query('SELECT id, username, email FROM users WHERE role = $1 ORDER BY username', ['user']);
        const patients = patientResult.rows;

        res.render('newrecord', { 
            patients: patients,
            doctor_name: req.session.user.username 
        });

    } catch (err) {
        console.error('Error fetching patient list:', err);
        req.flash('error_msg', 'Error preparing record form.');
        res.redirect('/records');
    }
});

app.post('/newrecord', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, diagnosis, treatment_plan, doctor_notes, blood_pressure, allergies, record_date } = req.body;
    
    try {
        const query = `
            INSERT INTO medical_records 
            (user_id, diagnosis, treatment_plan, doctor_notes, blood_pressure, allergies, record_date) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        
        await db.query(query, [
            patient_id, 
            diagnosis, 
            treatment_plan, 
            doctor_notes, 
            blood_pressure, 
            allergies, 
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

app.get('/add-vitals', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const patientResult = await db.query('SELECT id, username, email FROM users WHERE role = $1 ORDER BY username', ['user']);
        const patients = patientResult.rows;

        res.render('add_vitals', { 
            patients: patients,
            admin_username: req.session.user.username 
        });

    } catch (err) {
        console.error('Error fetching patient list for vitals form:', err);
        req.flash('error_msg', 'Error preparing vitals input form.');
        res.redirect('/monitoring');
    }
});

app.post('/add-vitals', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, heart_rate, temperature, spo2, glucose_level, systolic_bp, diastolic_bp, reading_timestamp } = req.body;
    
    if (!patient_id) {
        req.flash('error_msg', 'Patient must be selected.');
        return res.redirect('/add-vitals');
    }

    try {
        const query = `
            INSERT INTO health_vitals 
            (user_id, heart_rate, temperature, spo2, glucose_level, systolic_bp, diastolic_bp, reading_timestamp) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await db.query(query, [
            patient_id, 
            heart_rate || null, 
            temperature || null, 
            spo2 || null, 
            glucose_level || null, 
            systolic_bp || null, 
            diastolic_bp || null, 
            reading_timestamp || new Date().toISOString()
        ]);

        req.flash('success_msg', `Vitals successfully added for Patient ID ${patient_id}.`);
        res.redirect('/monitoring');
    } catch (err) {
        console.error('Error adding new vital data:', err);
        req.flash('error_msg', 'Error adding vitals. Database insertion failed.');
        res.redirect('/add-vitals');
    }
});


// Authentication routes
app.get('/login', async (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (user) {
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (isMatch) {
                req.session.user = { 
                    id: user.id, 
                    username: user.username,
                    email: user.email,
                    role: user.role
                };
                req.flash('success_msg', 'Login successful! Welcome back.');
                res.redirect('/');
            } else {
                req.flash('error_msg', 'Invalid password. Please try again.'); 
                res.redirect('/login');
            }
        } else {
            req.flash('error_msg', 'User not found with that email address.'); 
            res.redirect('/login');
        }
    } catch (err) {
        console.error('CRITICAL LOGIN ERROR:', err.message, err.stack);
        req.flash('error_msg', 'An internal server error prevented login.');
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
        const password_hash = await bcrypt.hash(password, saltRounds);
        const query = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email';
        const result = await db.query(query, [username, email, password_hash]);
        const newUser = result.rows[0];

        req.session.user = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: 'user' // Default role
        };

        req.flash('success_msg', 'Registration successful! Welcome to CareFlow HMS.');
        res.redirect('/');
    } catch (err) {
        if (err.code === '23505') {
            req.flash('error_msg', 'Username or email already exists.');
        } else {
            console.error('Signup error:', err);
            req.flash('error_msg', 'An error occurred during registration.');
        }
        res.redirect('/signup');
    }
});

app.post('/logout', async (req, res) => {
    req.flash('success_msg', 'You have been successfully logged out.');
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }

        res.clearCookie('connect.sid'); 
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