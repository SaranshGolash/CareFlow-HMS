const express = require('express');
const pg = require('pg');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcrypt');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

// FIX: Automatically convert Postgres NUMERIC (type code 1700) to JavaScript float
const NUMERIC_OID = 1700;
pg.types.setTypeParser(NUMERIC_OID, (value) => {
    return value === null ? null : parseFloat(value);
});

const app = express();

// Initialize open ai client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env/Render
});

const checkDoctorPatientRelationship = async (doctorId, patientId) => {
    const result = await db.query(
        'SELECT 1 FROM appointments WHERE doctor_id = $1 AND user_id = $2 LIMIT 1',
        [doctorId, patientId]
    );
    return result.rowCount > 0;
};

console.log("OpenAI API Key loaded:", process.env.OPENAI_API_KEY ? 'Yes' : 'NO - THIS IS THE PROBLEM!');

// --- 1. Database Connection Pool Setup (CRITICAL FIX) ---
const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('Database Pool connected successfully'))
    .catch(err => console.error('Database connection error:', err));

// Set global variable 'db' to the Pool instance for consistency
const db = pool;

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

// --- PASSPORT (Google OAuth) CONFIGURATION ---
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization: determines what user data to store in the session
passport.serializeUser((user, done) => {
    done(null, user.id); // Store only the user's database ID in the session
});

// Passport deserialization: fetches the user data from the DB using the session ID
passport.deserializeUser(async (id, done) => {
    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
        const user = result.rows[0];
        done(null, user); // Attach the full user object to req.user
    } catch (err) {
        done(err);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback" // This must match the URL in your Google Console
  },
  async (accessToken, refreshToken, profile, done) => {
    // This is the core "findOrCreate" logic
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const username = profile.displayName;

    try {
        // 1. Check if user already exists via Google ID
        let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        let user = userResult.rows[0];

        if (user) {
            // User found, log them in
            return done(null, user);
        }

        // 2. Not found? Check if they have a local account with the same email
        userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        user = userResult.rows[0];

        if (user) {
            // Email found! Link the account by adding their Google ID
            const linkQuery = 'UPDATE users SET google_id = $1 WHERE email = $2 RETURNING *';
            const linkedUserResult = await db.query(linkQuery, [googleId, email]);
            return done(null, linkedUserResult.rows[0]);
        }
        
        // 3. Not found at all? Create a new user
        const createQuery = `
            INSERT INTO users (username, email, google_id, role) 
            VALUES ($1, $2, $3, 'user') 
            RETURNING *
        `;
        const newUserResult = await db.query(createQuery, [username, email, googleId]);
        return done(null, newUserResult.rows[0]);

    } catch (err) {
        return done(err);
    }
  }
));

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

// Middleware to check if user is an Admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error_msg', 'Access denied. You must be an administrator.');
    res.redirect('/');
};

// --- HELPER FUNCTIONS ---

// Reusable Audit Log function
const logAudit = (userId, actionType, targetId, req) => {
    // Use req.ip to get the user's IP address
    const ip = req.ip;
    db.query(
        'INSERT INTO audit_log (user_id, ip_address, action_type, target_id) VALUES ($1, $2, $3, $4)',
        [userId, ip, actionType, targetId]
    ).catch(err => {
        console.error('Audit Log Write Failed:', err);
    });
};

// Middleware to check if user is a doctor or an admin
const isDoctorOrAdmin = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'doctor')) {
        return next();
    }
    req.flash('error_msg', 'Access denied. You must be a doctor or administrator.');
    res.redirect('/');
};

// --- Reusable Functions ---

// Function to fetch all active services
const fetchServices = async () => {
    try {
        const result = await db.query('SELECT service_id, service_name, cost, description, category FROM services WHERE is_active = TRUE ORDER BY category, service_name');
        
        // Ensure cost is formatted for display consistency
        return result.rows.map(s => ({
            ...s,
            cost: parseFloat(s.cost).toFixed(2)
        }));
    } catch (err) {
        console.error('Error in fetchServices:', err);
        return [];
    }
};
// Function to fetch a specific invoice with items
const fetchInvoiceDetails = async (invoiceId, userId = null) => {
    const client = await db.connect();
    try {
        let invoiceQuery = 'SELECT * FROM invoices WHERE invoice_id = $1';
        const params = [invoiceId];

        // Security check: ensure non-admin users only see their invoices
        if (userId) {
            invoiceQuery += ' AND user_id = $2';
            params.push(userId);
        }

        const invoiceResult = await client.query(invoiceQuery, params);
        const invoice = invoiceResult.rows[0];

        if (!invoice) return null;

        const itemsResult = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
        invoice.items = itemsResult.rows;

        return invoice;
    } finally {
        client.release();
    }
};

// --- ROUTES ---

// Home Route
app.get('/', async (req, res) => {
    res.render('index');
});

// Appointments
app.get('/appointments', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const isAdminUser = req.session.user.role === 'admin';
    
    let query = 'SELECT * FROM appointments ';
    const params = [];

    // --- CRITICAL FIX: Filtering Logic ---
    if (!isAdminUser) {
        // If the user is NOT an admin, filter by their specific ID
        query += 'WHERE user_id = $1 ';
        params.push(userId);
    }
    // -------------------------------------
    
    query += 'ORDER BY id DESC';

    try {
        const result = await db.query(query, params);
        const appointments = result.rows;
        
        // Pass isAdmin to the frontend so the view can adjust labels/actions if necessary
        res.render('appointments', { 
            appointments: appointments,
            isAdmin: isAdminUser // Pass status for frontend logic/labels
        });
    } catch (err) {
        console.error('Error fetching appointments:', err);
        req.flash('error_msg', 'Error fetching appointments');
        res.render('appointments', { 
            appointments: [], 
            isAdmin: isAdminUser 
        });
    }
});

app.get('/newappointments', isAuthenticated, async (req, res) => {
    try {
        // Fetch all users with the 'doctor' role to populate the dropdown
        const doctorsResult = await db.query("SELECT id, username FROM users WHERE role = 'doctor' ORDER BY username");
        
        res.render('newappointments', {
            doctors: doctorsResult.rows // Pass the list of doctors to the form
        });
    } catch (err) {
        console.error('Error fetching doctors list:', err);
        req.flash('error_msg', 'Could not load the list of doctors.');
        res.render('newappointments', { doctors: [] }); // Render with an empty list on error
    }
});

// POST: Handle new appointment creation and queue a reminder
app.post('/newappointments', isAuthenticated, async (req, res) => {
    const { patient_name, gender, phone, doctor_id, doctor_name, appointment_date, appointment_time } = req.body;
    const userId = req.session.user.id;
    
    // Acquire a client from the connection pool for the transaction
    const client = await db.connect();
    
    try {
        await client.query('BEGIN');
        // 1. Get the day of the week (0=Sunday, 1=Monday, etc.) from the submitted date
        const selectedDate = new Date(appointment_date + "T00:00:00");
        const dayOfWeek = selectedDate.getDay();

        // 2. Check the doctor's schedule for that day
        const scheduleQuery = `
            SELECT start_time, end_time FROM doctor_schedules 
            WHERE doctor_id = $1 AND day_of_week = $2
        `;
        const scheduleResult = await client.query(scheduleQuery, [doctor_id, dayOfWeek]);

        if (scheduleResult.rows.length === 0) {
            // If no rows are returned, the doctor does not work on this day.
            throw new Error("Validation Failed: The selected doctor is not available on this day.");
        }

        // 3. Check if the submitted time is within the doctor's schedule
        const slot = scheduleResult.rows[0];
        if (appointment_time < slot.start_time || appointment_time > slot.end_time) {
            // If the time is outside the slot, throw an error.
            throw new Error(`Validation Failed: The selected time is outside the doctor's available hours (${new Date('1970-01-01T' + slot.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date('1970-01-01T' + slot.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`);
        }
        // --- END OF VALIDATION ---

        // 4. Insert the new appointment (if validation passed)
        const appointmentQuery = `
            INSERT INTO appointments (patient_name, gender, phone, doctor_id, doctor_name, user_id, status, appointment_date, appointment_time) 
            VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7, $8)
        `;
        await client.query(appointmentQuery, [patient_name, gender, phone, doctor_id, doctor_name, userId, appointment_date, appointment_time]);
        
        // 5. Calculate reminder time and queue the reminder
        const appointmentDateTime = new Date(`${appointment_date}T${appointment_time}`);
        const reminderTimestamp = new Date(appointmentDateTime.getTime() - (24 * 60 * 60 * 1000));

        const notificationQuery = `
            INSERT INTO notifications (user_id, type, status, send_at)
            VALUES ($1, 'Appointment Reminder', 'Queued', $2)
        `;
        await client.query(notificationQuery, [userId, reminderTimestamp]);

        // If everything succeeds, commit the transaction
        await client.query('COMMIT');
        
        req.flash('success_msg', 'Appointment scheduled successfully. A reminder has been set for 24 hours prior.');
        res.redirect('/appointments');

    } catch (err) {
        // If any query (including our validation) fails, roll back
        await client.query('ROLLBACK');
        
        // Pass the specific validation error message back to the user
        if (err.message.startsWith("Validation Failed:")) {
            req.flash('error_msg', err.message);
        } else {
            // For all other errors
            console.error('Error in new appointment transaction:', err);
            req.flash('error_msg', 'Error scheduling appointment. The operation was canceled.');
        }
        res.redirect('/newappointments');
    } finally {
        // ALWAYS release the client back to the pool
        client.release();
    }
});

// Handle Appointment Confirmation (Patient Action)
app.post('/appointments/:id/confirm', isAuthenticated, async (req, res) => {
    const appointmentId = req.params.id;
    const userId = req.session.user.id; // Patient ID

    try {
        // Ensure the appointment belongs to the user AND the status is not already Paid/Canceled
        const query = `
            UPDATE appointments
            SET status = 'Confirmed'
            WHERE id = $1 AND user_id = $2 AND status = 'Pending'
            RETURNING id
        `;
        const result = await db.query(query, [appointmentId, userId]);

        if (result.rowCount > 0) {
            req.flash('success_msg', 'Your appointment has been successfully confirmed. Thank you!');
        } else {
            req.flash('error_msg', 'Could not confirm appointment. It may already be confirmed or canceled.');
        }
        
        res.redirect('/appointments');
    } catch (err) {
        console.error('Error confirming appointment:', err);
        req.flash('error_msg', 'A server error occurred during confirmation.');
        res.redirect('/appointments');
    }
});

// Records of patients view route
app.get('/records', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // --- UPDATED QUERY: LEFT JOIN with appointments to get doctor_name ---
        const query = `
            SELECT 
                mr.*, 
                a.doctor_name 
            FROM 
                medical_records mr
            LEFT JOIN 
                appointments a ON mr.appointment_id = a.id
            WHERE 
                mr.user_id = $1 
            ORDER BY 
                record_date DESC
        `;
        
        const result = await db.query(query, [userId]);
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
        // --- UPDATED QUERY: JOIN with users AND LEFT JOIN with appointments ---
        const query = `
            SELECT 
                mr.*, 
                u.username,
                a.doctor_name
            FROM 
                medical_records mr
            JOIN 
                users u ON mr.user_id = u.id
            LEFT JOIN
                appointments a ON mr.appointment_id = a.id
            WHERE 
                mr.record_id = $1 AND mr.user_id = $2
        `;
        const result = await db.query(query, [recordId, userId]);
        const record = result.rows[0];

        if (!record) {
            req.flash('error_msg', 'Medical record not found or access denied.');
            return res.redirect('/records');
        }
        logAudit(userId, 'VIEWED_OWN_RECORD', record.record_id, req);
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


// --- AUTHENTICATION ROUTES ---

// GET /auth/google
// This route starts the authentication process.
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'] // Ask Google for the user's profile info and email
  })
);

// GET /auth/google/callback
// This is the URL Google redirects back to after authentication.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }), // If login fails, redirect to /login
  (req, res) => {
    // Successful authentication, redirect to the correct dashboard.
    req.flash('success_msg', 'You are now logged in via Google.');
    if (req.user.role === 'doctor') {
        res.redirect('/doctor/dashboard');
    } else {
        res.redirect('/');
    }
  }
);

app.get('/login', async (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (user) {
            // Check if user has a password. If not, they must use Google.
            if (!user.password_hash) {
                req.flash('error_msg', 'That email is registered with Google. Please "Sign in with Google" instead.');
                return res.redirect('/login');
            }
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (isMatch) {
                // Set session data
                req.session.user = { 
                    id: user.id, 
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    wallet_balance: parseFloat(user.wallet_balance)
                };
                logAudit(user.id, 'USER_LOGIN_SUCCESS', user.id, req);
                req.flash('success_msg', 'Login successful! Welcome back.');
                if (user.role === 'doctor') {
                    return res.redirect('/doctor/dashboard');
                }
                return res.redirect('/'); // Default redirect for patient/admin
            } else {
                if(user) logAudit(user.id, 'USER_LOGIN_FAILED', user.id, req);
                req.flash('error_msg', 'Invalid password. Please try again.'); 
                res.redirect('/login');
            }
        } else {
            req.flash('error_msg', 'User not found with that email address.'); 
            res.redirect('/login');
        }
    } catch (err) {
        console.error('Login processing error:', err);
        req.flash('error_msg', 'An internal error occurred during login processing.');
        res.redirect('/login');
    }
});

// GET: Display the Signup Page
app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    // FIX: Destructure the new 'phone' field from the request body
    const { username, email, password, phone } = req.body;
    const saltRounds = 10;

    // Basic validation for password match on the server-side
    if (password !== req.body.confirm_password) {
        req.flash('error_msg', 'Passwords do not match.');
        return res.redirect('/signup');
    }

    try {
        const password_hash = await bcrypt.hash(password, saltRounds);

        // FIX: Update the INSERT query to include the phone number
        const query = `
            INSERT INTO users (username, email, password_hash, phone) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id, username, email, role
        `;
        // Use 'phone || null' to handle the optional field
        const result = await db.query(query, [username, email, password_hash, phone || null]);
        const newUser = result.rows[0];

        // Log the user in immediately
        req.session.user = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role
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
            console.error('Error destroying session:', err);
            return res.redirect('/'); 
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/');
    });
});


// --- USER MANAGEMENT ROUTES ---

app.get('/dashboard', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    let lowStockCount = 0; // Initialize lowStockCount for all users

    try {
        // --- 1. Fetch Wallet and Counters (Code remains the same) ---
        const userDetailsResult = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [userId]);
        const walletBalance = userDetailsResult.rows[0].wallet_balance ? parseFloat(userDetailsResult.rows[0].wallet_balance).toFixed(2) : '0.00';

        const apptResult = await db.query('SELECT COUNT(*) FROM appointments WHERE user_id = $1', [userId]);
        const apptCount = parseInt(apptResult.rows[0].count, 10);

        const recordResult = await db.query('SELECT COUNT(*) FROM medical_records WHERE user_id = $1', [userId]);
        const recordCount = parseInt(recordResult.rows[0].count, 10);

        const vitalResult = await db.query('SELECT COUNT(*) FROM health_vitals WHERE user_id = $1', [userId]);
        const vitalCount = parseInt(vitalResult.rows[0].count, 10);

        const latestVitalResult = await db.query(
            'SELECT reading_timestamp FROM health_vitals WHERE user_id = $1 ORDER BY reading_timestamp DESC LIMIT 1',
            [userId]
        );
        const latestVitalDate = latestVitalResult.rows[0] ? latestVitalResult.rows[0].reading_timestamp : null;
        
        const balanceResult = await db.query(
            'SELECT SUM(total_amount - amount_paid) AS outstanding_balance FROM invoices WHERE user_id = $1 AND status != $2', 
            [userId, 'Paid']
        );
        
        const outstandingBalance = balanceResult.rows[0].outstanding_balance ? 
                                   parseFloat(balanceResult.rows[0].outstanding_balance).toFixed(2) : 
                                   '0.00';

        let recentPrescriptions = [];
        if (req.session.user.role === 'user') {
            const prescriptionsPromise = db.query(`
                SELECT p.*, u.username as doctor_name 
                FROM prescriptions p
                JOIN users u ON p.doctor_id = u.id
                WHERE p.user_id = $1 
                ORDER BY p.issued_at DESC 
                LIMIT 5
            `, [userId]);
            recentPrescriptions = (await prescriptionsPromise).rows;
        }

        // --- 2. Fetch Low Stock Count (Admin Only Logic) ---
        if (req.session.user.role === 'admin') {
            const lowStockResult = await db.query(
                'SELECT COUNT(*) AS count FROM inventory WHERE current_stock <= low_stock_threshold'
            );
            // Update the variable that was initialized outside the try block
            lowStockCount = parseInt(lowStockResult.rows[0].count, 10); 
        }
        // ---------------------------------------------------
        
        // Update Session with Fresh Wallet Balance (Good UX)
        req.session.user.wallet_balance = parseFloat(walletBalance);


        // --- 3. FINAL Render Call ---
        res.render('dashboard', {
            apptCount: apptCount,
            recordCount: recordCount,
            vitalCount: vitalCount,
            latestVitalDate: latestVitalDate,
            outstandingBalance: outstandingBalance,
            walletBalance: walletBalance,
            prescriptions: recentPrescriptions,
            lowStockCount: lowStockCount // Passed regardless of the admin check outcome
        });
        // -----------------------------

    } catch (err) {
        console.error('Dashboard data fetch error:', err);
        req.flash('error_msg', 'Failed to load dashboard data.');
        
        // Ensure ALL variables are passed on error as well
        res.render('dashboard', {
            apptCount: 0,
            recordCount: 0,
            vitalCount: 0,
            latestVitalDate: null,
            outstandingBalance: '0.00',
            walletBalance: '0.00',
            prescriptions: [],
            lowStockCount: 0 
        });
    }
});

app.get('/settings', isAuthenticated, (req, res) => {
    res.render('settings');
});

// POST: Handles Profile (username, email, insurance) Updates
app.post('/settings/update', isAuthenticated, async (req, res) => {
    // 1. Get all data from the form
    const { username, email, user_id, insurance_provider, policy_number } = req.body;
    const userId = req.session.user.id;

    if (parseInt(user_id) !== userId) {
        req.flash('error_msg', 'Authorization failed.');
        return res.redirect('/settings');
    }

    try {
        // 2. Update the database
        const query = `
            UPDATE users 
            SET username = $1, email = $2, insurance_provider = $3, policy_number = $4 
            WHERE id = $5
        `;
        await db.query(query, [username, email, insurance_provider, policy_number, userId]);

        logAudit(userId, 'UPDATED_PROFILE', userId, req);

        // 3. Update the session object with ALL new data ---
        req.session.user.username = username;
        req.session.user.email = email;
        req.session.user.insurance_provider = insurance_provider;
        req.session.user.policy_number = policy_number;

        req.flash('success_msg', 'Profile updated successfully!');
        res.redirect('/settings');

    } catch (err) {
        console.error('Profile update error:', err);
        if (err.code === '23505') {
            req.flash('error_msg', 'Email or username already taken.');
        } else {
            req.flash('error_msg', 'An error occurred during profile update.');
        }
        res.redirect('/settings');
    }
});

app.post('/settings/password', isAuthenticated, async (req, res) => {
    const { current_password, new_password, user_id } = req.body;

    if (parseInt(user_id) !== req.session.user.id) {
        req.flash('error_msg', 'Authorization failed.');
        return res.redirect('/settings');
    }

    try {
        // 1. Fetch current hashed password
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [user_id]);
        const user = userResult.rows[0];

        // 2. Compare current password
        const isMatch = await bcrypt.compare(current_password, user.password_hash);

        if (!isMatch) {
            req.flash('error_msg', 'Current password is incorrect.');
            return res.redirect('/settings');
        }

        // 3. Hash the new password
        const saltRounds = 10;
        const new_password_hash = await bcrypt.hash(new_password, saltRounds);

        // 4. Update the database
        const query = 'UPDATE users SET password_hash = $1 WHERE id = $2';
        await db.query(query, [new_password_hash, user_id]);

        logAudit(userId, 'UPDATED_PASSWORD', userId, req);

        req.flash('success_msg', 'Password updated successfully.');
        res.redirect('/settings');

    } catch (err) {
        console.error('Password change error:', err);
        req.flash('error_msg', 'An error occurred during password change.');
        res.redirect('/settings');
    }
});

// GET: Display User's Inbox (Patient and Admin View)
app.get('/inbox', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const isAdminUser = req.session.user.role === 'admin';
    
    let query = `
        SELECT 
            sm.*, 
            u.username, 
            u.email 
        FROM 
            secure_messages sm
        JOIN 
            users u ON sm.user_id = u.id 
    `;
    const params = [];

    if (!isAdminUser) {
        // Patients only see messages linked to their ID
        query += 'WHERE sm.user_id = $1 ';
        params.push(userId);
    }
    
    query += 'ORDER BY created_at DESC';

    try {
        const result = await db.query(query, params);
        res.render('inbox', { 
            messages: result.rows, 
            isAdmin: isAdminUser,
            currentUserId: userId
        });
    } catch (err) {
        console.error('Error fetching inbox messages:', err);
        req.flash('error_msg', 'Failed to load messages.');
        res.render('inbox', { messages: [], isAdmin: isAdminUser, currentUserId: userId });
    }
});

// GET: Display Form to Send a New Message
app.get('/new-message', isAuthenticated, (req, res) => {
    res.render('new_message');
});

// POST: Handle Sending New Message
app.post('/new-message', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const senderRole = req.session.user.role;
    // Get the username from the session (must be available upon login)
    const senderUsername = req.session.user.username; 
    
    const { subject, message_body } = req.body;

    if (!subject || !message_body) {
        req.flash('error_msg', 'Subject and message body are required.');
        return res.redirect('/new-message');
    }

    try {
        const query = `
            INSERT INTO secure_messages (user_id, sender_role, subject, message_body, sender_username)
            VALUES ($1, $2, $3, $4, $5)
        `;
        // NOTE: We are now passing the username as $5
        await db.query(query, [userId, senderRole, subject, message_body, senderUsername]);

        req.flash('success_msg', 'Your message has been sent securely.');
        res.redirect('/inbox');
    } catch (err) {
        console.error('Error saving new message:', err);
        req.flash('error_msg', 'Failed to send message due to a server error.');
        res.redirect('/new-message');
    }
});


// --- NEW ROUTE: Consultation and End/Feedback Page ---
app.get('/consultation-end', isAuthenticated, (req, res) => {
    // This route serves as a quick landing page for thank you/feedback.
    res.render('consultation_end');
});

// GET: Teleconsultation Mock (Updated to pass user_id for feedback form)
app.get('/teleconsultation/:id', isAuthenticated, async (req, res) => {
    const appointmentId = req.params.id;
    const userId = req.session.user.id;
    
    try {
        const result = await db.query('SELECT * FROM appointments WHERE id = $1 AND user_id = $2', [appointmentId, userId]);
        
        if (result.rowCount === 0 && req.session.user.role !== 'admin') {
            req.flash('error_msg', 'Access denied to this appointment call.');
            return res.redirect('/appointments');
        }
        
        res.render('teleconsultation', { 
            appointmentId: appointmentId, 
            doctorName: result.rows[0]?.doctor_name || 'Staff' 
        });
    } catch (err) {
        console.error('Error fetching appointment for call:', err);
        res.render('error', { message: 'Could not start consultation.', error: { status: 500 } });
    }
});

// GET: Consultation End/Feedback Page (Renders the form)
app.get('/consultation-end', isAuthenticated, (req, res) => {
    // Pass the user ID to securely link feedback
    res.render('consultation_end', { userId: req.session.user.id });
});

// POST: Submit Feedback and store in DB
app.post('/submit-feedback', isAuthenticated, async (req, res) => {
    const { user_id, rating, feedback_effectiveness, comments } = req.body;
    const currentUserId = req.session.user.id;

    // Security Check: Ensure the user is submitting feedback for themselves
    if (parseInt(user_id) !== currentUserId) {
        req.flash('error_msg', 'Authorization failed. Cannot submit feedback for another user.');
        return res.redirect('/appointments');
    }

    try {
        const query = `
            INSERT INTO consultation_feedback (user_id, effectiveness_rating, star_rating, comments)
            VALUES ($1, $2, $3, $4)
        `;
        // Note: The star rating is hardcoded to 4 in the frontend form for simplicity, but we'll use a placeholder variable here.
        await db.query(query, [currentUserId, feedback_effectiveness, 4, comments || null]); 

        req.flash('success_msg', 'Thank you for your valuable feedback!');
        res.redirect('/appointments'); // Redirect back to appointments list
    } catch (err) {
        console.error('Error saving feedback:', err);
        req.flash('error_msg', 'Failed to submit feedback due to a server error.');
        res.redirect('/appointments');
    }
});

// --- NEW WALLET ROUTES ---

// GET: Display the Patient's Wallet/Deposit Page
app.get('/wallet', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const isAdminUser = req.session.user.role === 'admin';

    let query = 'SELECT id, username, wallet_balance, email FROM users ';
    const params = [];
    
    // CRITICAL FIX: Only add the WHERE clause if the user is NOT an admin.
    if (!isAdminUser) { 
        query += 'WHERE id = $1';
        params.push(userId);
    }
    
    query += ' ORDER BY id';

    try {
        const usersResult = await db.query(query, params);
        
        // Fetch recent transactions for the LOGGED-IN user only (for the transaction list view)
        const transactionsResult = await db.query(
            'SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
            [userId]
        );

        res.render('wallet', { 
            usersData: usersResult.rows, // This now contains ALL users if Admin, or 1 user if Patient.
            transactions: transactionsResult.rows,
            isAdmin: isAdminUser
        });
    } catch (err) {
        console.error('Error fetching wallet data:', err);
        req.flash('error_msg', 'Failed to load wallet data.');
        res.redirect('/dashboard');
    }
});

// POST: Handles Patient Deposit (Mock Transaction)
app.post('/wallet/deposit', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { deposit_amount } = req.body;
    const amount = parseFloat(deposit_amount);

    if (isNaN(amount) || amount <= 0) {
        req.flash('error_msg', 'Invalid deposit amount.');
        return res.redirect('/wallet');
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Update user's wallet balance
        const updateQuery = 'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance';
        const userUpdate = await client.query(updateQuery, [amount, userId]);
        
        // 2. Log the transaction
        const transactionQuery = `
            INSERT INTO wallet_transactions (user_id, amount, transaction_type, description)
            VALUES ($1, $2, 'Deposit', $3)
        `;
        await client.query(transactionQuery, [userId, amount, `Online deposit via payment gateway mock.`]);

        await client.query('COMMIT');
        
        // Update the session balance for immediate display (Optional but good UX)
        req.session.user.wallet_balance = parseFloat(userUpdate.rows[0].wallet_balance);

        req.flash('success_msg', `$${amount.toFixed(2)} added to your wallet!`);
        res.redirect('/wallet');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Wallet deposit error:', err);
        req.flash('error_msg', 'Deposit failed due to a system error.');
        res.redirect('/wallet');
    } finally {
        client.release();
    }
});

// POST: Handles Patient Withdrawal (Mock Transaction)
// Placement: Place this in the "NEW WALLET ROUTES" section of your index.js.
app.post('/wallet/withdraw', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { withdraw_amount } = req.body;
    const amount = parseFloat(withdraw_amount);

    if (isNaN(amount) || amount <= 0) {
        req.flash('error_msg', 'Invalid withdrawal amount.');
        return res.redirect('/wallet');
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch current balance and lock the row for the transaction
        const balanceResult = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const currentBalance = parseFloat(balanceResult.rows[0].wallet_balance);

        // 2. CRITICAL CHECK: Ensure user has sufficient funds
        if (amount > currentBalance) {
            await client.query('ROLLBACK');
            req.flash('error_msg', 'Insufficient funds in your wallet to withdraw this amount.');
            return res.redirect('/wallet');
        }

        // 3. Update user's wallet balance (subtract the amount)
        const updateQuery = 'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2 RETURNING wallet_balance';
        const userUpdate = await client.query(updateQuery, [amount, userId]);
        
        // 4. Log the transaction (Amount is logged as negative for withdrawal)
        const transactionQuery = `
            INSERT INTO wallet_transactions (user_id, amount, transaction_type, description)
            VALUES ($1, $2, 'Withdrawal', $3)
        `;
        // Log the amount as negative for auditing purposes
        await client.query(transactionQuery, [userId, -amount, `Funds withdrawn from wallet.`]); 

        await client.query('COMMIT');
        
        // 5. Update the session balance
        req.session.user.wallet_balance = parseFloat(userUpdate.rows[0].wallet_balance);

        req.flash('success_msg', `$${amount.toFixed(2)} successfully withdrawn.`);
        res.redirect('/wallet');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Wallet withdrawal error:', err);
        req.flash('error_msg', 'Withdrawal failed due to a system error.');
        res.redirect('/wallet');
    } finally {
        client.release();
    }
});

// DOCTOR ROUTES

// GET: Doctor's Dashboard (Shows upcoming AND past appointments)
app.get('/doctor/dashboard', isAuthenticated, async (req, res) => {
    // Security check: ensure only doctors can access this page
    if (req.session.user.role !== 'doctor') {
        req.flash('error_msg', 'Access denied.');
        return res.redirect('/');
    }
    
    const doctorId = req.session.user.id;
    const doctorName = req.session.user.username;

    try {
        // UPDATED QUERY: Fetch ALL appointments for the logged-in doctor, sorted by most recent first.
        const query = `
            SELECT * FROM appointments 
            WHERE doctor_id = $1 
            ORDER BY appointment_date DESC, appointment_time DESC
        `;
        const result = await db.query(query, [doctorId]);
        
        // --- NEW LOGIC: Separate appointments into UPCOMING and PAST ---
        const allAppointments = result.rows;
        const upcomingAppointments = [];
        const pastAppointments = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison

        allAppointments.forEach(appt => {
            const apptDate = new Date(appt.appointment_date);
            if (apptDate >= today) {
                upcomingAppointments.push(appt);
            } else {
                pastAppointments.push(appt);
            }
        });

        // Reverse the upcoming appointments to show the soonest first
        upcomingAppointments.reverse();
        // ----------------------------------------------------------------

        res.render('doctor_dashboard', { 
            upcomingAppointments: upcomingAppointments, // Pass upcoming list
            pastAppointments: pastAppointments,         // Pass past list
            doctorName: doctorName 
        });

    } catch (err) {
        console.error('Error fetching doctor dashboard data:', err);
        req.flash('error_msg', 'Could not load your dashboard.');
        res.redirect('/');
    }
});

// GET: Consolidated view of a single appointment (Record + Vitals)
app.get('/doctor/appointment/:id', isAuthenticated, async (req, res) => {
    // Security check: ensure only doctors can access this page
    if (req.session.user.role !== 'doctor') {
        req.flash('error_msg', 'Access denied.');
        return res.redirect('/');
    }
    
    const appointmentId = req.params.id;
    const doctorId = req.session.user.id;

    try {
        // --- 1. Fetch Core Appointment & Patient Details ---
        // We join with the users table to get patient info.
        // We also check that the appointment belongs to the logged-in doctor.
        const appointmentQuery = `
            SELECT a.*, u.username as patient_username, u.email as patient_email 
            FROM appointments a
            JOIN users u ON a.user_id = u.id
            WHERE a.id = $1 AND a.doctor_id = $2
        `;
        const appointmentPromise = db.query(appointmentQuery, [appointmentId, doctorId]);

        // --- 2. Fetch the Linked Medical Record ---
        const medicalRecordPromise = db.query('SELECT * FROM medical_records WHERE appointment_id = $1', [appointmentId]);
        
        // --- 3. Fetch Latest Vitals (on the day of the appointment) ---
        // This query depends on the result of the first query, so it runs after.
        const appointmentResult = await appointmentPromise;
        if (appointmentResult.rows.length === 0) {
            req.flash('error_msg', 'Appointment not found or you do not have permission to view it.');
            return res.redirect('/doctor/dashboard');
        }
        const appointment = appointmentResult.rows[0];
        
        const vitalsQuery = `
            SELECT * FROM health_vitals 
            WHERE user_id = $1 AND reading_timestamp::date <= $2 
            ORDER BY reading_timestamp DESC 
            LIMIT 1
        `;
        const vitalsPromise = db.query(vitalsQuery, [appointment.user_id, appointment.appointment_date]);

        // --- 4. Resolve all promises and render ---
        const [medicalRecordResult, latestVitalsResult] = await Promise.all([medicalRecordPromise, vitalsPromise]);

        res.render('doctor_appointment_view', {
            appointment: appointment,
            medicalRecord: medicalRecordResult.rows[0] || null, // Pass the record or null if not found
            latestVitals: latestVitalsResult.rows[0] || null   // Pass latest vitals or null
        });

    } catch (err) {
        console.error('Error fetching consolidated appointment data:', err);
        req.flash('error_msg', 'Could not load appointment details.');
        res.redirect('/doctor/dashboard');
    }
});

// --- API ROUTES ---

// GET: Fetches a specific doctor's AVAILABLE appointment slots for a specific DATE
app.get('/api/doctor-slots/:doctorId/:date', isAuthenticated, async (req, res) => {
    const { doctorId, date } = req.params;
    
    try {
        // This query now correctly casts TIME to TIMESTAMP before using generate_series
        const query = `
            WITH schedule AS (
                -- 1. Find the schedule for the given doctor and day
                SELECT start_time, end_time 
                FROM doctor_schedules
                WHERE doctor_id = $1 
                  AND day_of_week = EXTRACT(DOW FROM $2::DATE)
            ),
            
            all_slots AS (
                -- 2. CRITICAL FIX: Combine the provided DATE ($2) with the TIME
                --    to create a valid TIMESTAMP for generate_series.
                SELECT generate_series(
                    ($2::DATE + s.start_time),
                    ($2::DATE + s.end_time) - INTERVAL '30 minutes',
                    '30 minutes'::interval
                ) AS slot_timestamp -- This is now a full timestamp
                FROM schedule s
                WHERE s.start_time IS NOT NULL AND s.start_time < s.end_time 
            ),
            
            booked_slots AS (
                -- 3. Find all appointments already booked for that doctor on that day
                SELECT appointment_time 
                FROM appointments
                WHERE doctor_id = $1 AND appointment_date = $2
            )
            
            -- 4. Select only the TIME part of the available slots
            SELECT slot_timestamp::TIME AS slot_time
            FROM all_slots
            WHERE slot_timestamp::TIME NOT IN (SELECT appointment_time FROM booked_slots)
            ORDER BY slot_time;
        `;
        
        const result = await db.query(query, [doctorId, date]);
        
        // This will now correctly return [] if the schedule was empty or all slots were booked
        res.json(result.rows.map(row => row.slot_time));

    } catch (err) {
        // This catch block is what's sending the 500 error
        console.error('API Error fetching doctor slots:', err);
        res.status(500).json({ error: 'Failed to fetch available slots' });
    }
});

// --- API ROUTES (Chatbot using OpenAI) ---

app.post('/api/chat', isAuthenticated, async (req, res) => {
    const userMessage = req.body.message;
    const userId = req.session.user.id; 

    if (!userMessage) {
        return res.status(400).json({ error: 'Message content is required.' });
    }

    const client = await db.connect(); 
    try {
        // --- 1. BUILD CONTEXT (Fetch data in parallel) ---
        
        // Query 1: Get User Info
        const userPromise = client.query("SELECT username, role FROM users WHERE id = $1", [userId]);
        
        // Query 2: Get Financial Info (Outstanding Balance)
        const balancePromise = client.query(
            "SELECT SUM(total_amount - amount_paid) AS outstanding_balance FROM invoices WHERE user_id = $1 AND status != 'Paid'",
            [userId]
        );

        // Query 3: Get Next Appointment
        const apptPromise = client.query(
            `SELECT doctor_name, appointment_date, appointment_time 
             FROM appointments 
             WHERE user_id = $1 AND appointment_date >= CURRENT_DATE 
             ORDER BY appointment_date ASC, appointment_time ASC 
             LIMIT 1`,
            [userId]
        );

        // Wait for all queries to finish
        const [userResult, balanceResult, apptResult] = await Promise.all([userPromise, balancePromise, apptPromise]);

        // --- 2. ASSEMBLE THE CONTEXT PROMPT ---
        const user = userResult.rows[0];
        const outstandingBalance = balanceResult.rows[0].outstanding_balance ? parseFloat(balanceResult.rows[0].outstanding_balance).toFixed(2) : '0.00';
        const nextAppointment = apptResult.rows[0];

        // Create the detailed system prompt
        let systemPrompt = `You are a helpful AI assistant for CareFlow HMS.
You are speaking to a user named ${user.username} (User ID: ${userId}). Their role is '${user.role}'.
Their current outstanding balance is $${outstandingBalance}.`;
        
        if (nextAppointment) {
            const apptDate = new Date(nextAppointment.appointment_date).toLocaleDateString();
            const apptTime = new Date('1970-01-01T' + nextAppointment.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            systemPrompt += ` They have an upcoming appointment with Dr. ${nextAppointment.doctor_name} on ${apptDate} at ${apptTime}.`;
        } else {
            systemPrompt += " They have no upcoming appointments scheduled.";
        }
        
        systemPrompt += ` Answer the user's query based on this context. Today's date is ${new Date().toLocaleDateString()}.`;

        // --- 3. Call OpenAI with Context ---
        await client.query('BEGIN');
        let aiResponseText = "Sorry, I couldn't process that request at the moment."; 
        try {
            console.log("Sending context-aware prompt to OpenAI...");
            
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt }, // The new context-aware prompt
                    { role: "user", content: userMessage }     // The user's actual question
                ],
            });
            
            aiResponseText = completion.choices[0]?.message?.content?.trim() || aiResponseText;
            console.log("OpenAI Response:", aiResponseText); 

        } catch (aiError) {
             console.error("!!! OpenAI API CRASH:", aiError); 
             if (aiError.status === 401) {
                 aiResponseText = "OpenAI API authentication failed. Check your API key.";
             } else if (aiError.status === 429) {
                 aiResponseText = "OpenAI API rate limit reached or billing issue.";
             } else {
                 aiResponseText = "Sorry, the AI service couldn't respond. Please try again later.";
             }
        }

        // --- 4. Save and Respond ---
        const historyQuery = `
            INSERT INTO chat_history (user_id, user_message, ai_response)
            VALUES ($1, $2, $3)
        `;
        await client.query(historyQuery, [userId, userMessage, aiResponseText]); 
        await client.query('COMMIT');

        res.json({ reply: aiResponseText });

    } catch (dbOrOtherError) { 
        await client.query('ROLLBACK');
        console.error('Chat processing or DB error:', dbOrOtherError); 
        res.status(500).json({ error: 'Failed to process chat message due to a server error.' }); 
    } finally {
        client.release();
    }
});

// GET: View Invoices List (Admin or Patient-Specific)
app.get('/invoices', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const isAdminUser = req.session.user.role === 'admin';
    
    let query = 'SELECT * FROM invoices ';
    const params = [];

    if (!isAdminUser) {
        query += 'WHERE user_id = $1 ';
        params.push(userId);
    }
    
    query += 'ORDER BY invoice_date DESC';

    try {
        const result = await db.query(query, params);
        res.render('invoices', { invoices: result.rows, isAdmin: isAdminUser });
    } catch (err) {
        console.error('Error fetching invoices:', err);
        req.flash('error_msg', 'Error fetching invoice data.');
        res.redirect(isAdminUser ? '/dashboard' : '/');
    }
});

// GET: View Single Invoice Detail / Payment Portal
app.get('/invoices/:id', isAuthenticated, async (req, res) => {
    const invoiceId = parseInt(req.params.id);
    const userId = req.session.user.id;
    const isAdminUser = req.session.user.role === 'admin';
    
    try {
        const invoice = await fetchInvoiceDetails(invoiceId, isAdminUser ? null : userId);

        if (!invoice) {
            req.flash('error_msg', 'Invoice not found or access denied.');
            return res.redirect('/invoices');
        }

        // Fetch the user's current wallet balance from the session
        const walletBalance = req.session.user.wallet_balance || 0;
        
        res.render('pay_invoice', { 
            invoice: invoice, 
            items: invoice.items,
            user: req.session.user,
            walletBalance: parseFloat(walletBalance) // Pass wallet balance to the view
        });

    } catch (err) {
        console.error(`Error loading invoice ${invoiceId}:`, err);
        req.flash('error_msg', 'Error loading invoice details.');
        res.redirect('/invoices');
    }
});


// POST: Process Payment (Mock Transaction for Card/Wallet)
app.post('/pay-invoice', isAuthenticated, async (req, res) => {
    const { invoice_id, payment_amount, outstanding_balance } = req.body;
    const userId = req.session.user.id;
    
    const amount = parseFloat(payment_amount);
    const outstanding = parseFloat(outstanding_balance);
    const invoiceId = parseInt(invoice_id);

    // Security check: Ensure the payment amount is valid
    if (isNaN(amount) || amount <= 0 || amount > outstanding) {
        req.flash('error_msg', 'Invalid payment amount submitted. Amount must be positive and not exceed outstanding balance.');
        return res.redirect(`/invoices/${invoiceId}`);
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Lock the invoice row and check ownership
        const checkQuery = 'SELECT total_amount, amount_paid FROM invoices WHERE invoice_id = $1 AND user_id = $2 FOR UPDATE';
        const checkResult = await client.query(checkQuery, [invoiceId, userId]);
        const invoice = checkResult.rows[0];

        if (!invoice) {
            throw new Error('Invoice not found or unauthorized access.');
        }

        // 2. Calculate new payment status
        const newPaidAmount = parseFloat(invoice.amount_paid) + amount;
        let newStatus = 'Partial';
        if (newPaidAmount >= parseFloat(invoice.total_amount) - 0.005) { // Floating point safety
            newStatus = 'Paid';
        }
        
        // 3. Update the Invoice record
        const updateQuery = `
            UPDATE invoices 
            SET amount_paid = $1, status = $2 
            WHERE invoice_id = $3
        `;
        await client.query(updateQuery, [newPaidAmount.toFixed(2), newStatus, invoiceId]);

        // 4. Log the transaction
        const transactionQuery = `
            INSERT INTO wallet_transactions (user_id, amount, transaction_type, reference_id, description)
            VALUES ($1, $2, 'Payment', $3, $4)
        `;
        // We log the payment amount as a negative value against the user's account
        await client.query(transactionQuery, [userId, -amount, 'Payment', `invoice_${invoiceId}`, `Card payment for Invoice #${invoiceId}`]);

        await client.query('COMMIT');

        req.flash('success_msg', `Payment of $${amount.toFixed(2)} processed successfully! Status: ${newStatus}.`);
        res.redirect(`/invoices/${invoiceId}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Payment processing error:', err);
        req.flash('error_msg', `Payment failed: ${err.message}`);
        res.redirect(`/invoices/${invoiceId}`);
    } finally {
        client.release();
    }
});

// POST: Pay an Invoice using the internal Wallet (Patient-only)
app.post('/invoices/:id/pay-with-wallet', isAuthenticated, async (req, res) => {
    const invoiceId = parseInt(req.params.id);
    const userId = req.session.user.id;
    const outstandingBalance = parseFloat(req.body.outstanding_balance); // Get amount from form

    // Make sure user isn't an admin
    if (req.session.user.role === 'admin') {
        req.flash('error_msg', 'Admins cannot pay invoices.');
        return res.redirect(`/invoices/${invoiceId}`);
    }

    const client = await db.connect(); // Get a client from the pool for a transaction
    try {
        await client.query('BEGIN');

        // 1. Lock and check user's wallet balance
        const userResult = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const walletBalance = parseFloat(userResult.rows[0].wallet_balance);

        // 2. Check for sufficient funds
        if (walletBalance < outstandingBalance) {
            await client.query('ROLLBACK');
            req.flash('error_msg', 'Insufficient funds in your wallet. Please deposit more money first.');
            return res.redirect(`/invoices/${invoiceId}`);
        }

        // 3. Subtract from wallet
        const newWalletBalance = walletBalance - outstandingBalance;
        await client.query('UPDATE users SET wallet_balance = $1 WHERE id = $2', [newWalletBalance, userId]);

        // 4. Update the invoice (mark as paid)
        await client.query(
            "UPDATE invoices SET amount_paid = total_amount, status = 'Paid' WHERE invoice_id = $1 AND user_id = $2",
            [invoiceId, userId]
        );
        
        // 5. Log the wallet transaction
        await client.query(
            'INSERT INTO wallet_transactions (user_id, amount, transaction_type, reference_id, description) VALUES ($1, $2, $3, $4, $5)',
            [userId, -outstandingBalance, 'Payment', `invoice_${invoiceId}`, `Payment for Invoice #${invoiceId}`]
        );

        // 6. Commit the transaction
        await client.query('COMMIT');

        // 7. Update the session balance
        req.session.user.wallet_balance = newWalletBalance;

        req.flash('success_msg', `Payment of $${outstandingBalance.toFixed(2)} successful! Your invoice is now paid.`);
        res.redirect(`/invoices/${invoiceId}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Wallet payment processing error:', err);
        req.flash('error_msg', 'Payment failed due to a server error.');
        res.redirect(`/invoices/${invoiceId}`);
    } finally {
        client.release();
    }
});

// GET: Doctor views a specific patient's list of medical records
app.get('/doctor/patient/:userId/records', isAuthenticated, isDoctorOrAdmin, async (req, res) => {
    const patientId = req.params.userId;
    const doctorId = req.session.user.id;

    try {
        // 1. SECURITY CHECK: Verify the doctor has an appointment history with this patient.
        const hasRelationship = await checkDoctorPatientRelationship(doctorId, patientId);
        if (!hasRelationship) {
            req.flash('error_msg', 'Access Denied: You do not have a recorded appointment with this patient.');
            return res.redirect('/doctor/dashboard');
        }

        // 2. Fetch data if authorized
        const patientResult = await db.query('SELECT username FROM users WHERE id = $1', [patientId]);
        const recordsResult = await db.query('SELECT mr.*, a.doctor_name FROM medical_records mr LEFT JOIN appointments a ON mr.appointment_id = a.id WHERE mr.user_id = $1 ORDER BY record_date DESC', [patientId]);
        
        // 3. REUSE records.ejs for the view
        res.render('records', {
            records: recordsResult.rows,
            username: patientResult.rows[0].username,
            isDoctorView: true // Pass a flag to the template
        });

    } catch (err) {
        console.error('Error fetching patient records for doctor:', err);
        req.flash('error_msg', 'Failed to load patient history.');
        res.redirect('/doctor/dashboard');
    }
});

// GET: Doctor views a specific patient's health monitoring/vitals
app.get('/doctor/patient/:userId/monitoring', isAuthenticated, isDoctorOrAdmin, async (req, res) => {
    const patientId = req.params.userId;
    const doctorId = req.session.user.id;
    
    try {
        // 1. SECURITY CHECK (Remains the same)
        const hasRelationship = await checkDoctorPatientRelationship(doctorId, patientId);
        if (!hasRelationship) {
            req.flash('error_msg', 'Access Denied.');
            return res.redirect('/doctor/dashboard');
        }

        // 2. Fetch data (Remains the same)
        const patientResult = await db.query('SELECT username FROM users WHERE id = $1', [patientId]);
        const vitalsResult = await db.query('SELECT * FROM health_vitals WHERE user_id = $1 ORDER BY reading_timestamp ASC', [patientId]);
        
        // --- START OF CRITICAL FIX ---
        // 3. Process data for Chart.js (This was missing)
        const rawVitals = vitalsResult.rows.map(vital => ({
            ...vital,
            glucose_level: vital.glucose_level ? parseFloat(vital.glucose_level) : null,
            temperature: vital.temperature ? parseFloat(vital.temperature) : null,
            spo2: vital.spo2 ? parseFloat(vital.spo2) : null
        }));

        const chartData = {
            labels: rawVitals.map(v => new Date(v.reading_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
            heartRate: rawVitals.map(v => v.heart_rate),
            systolicBP: rawVitals.map(v => v.systolic_bp),
            diastolicBP: rawVitals.map(v => v.diastolic_bp),
            glucose: rawVitals.map(v => v.glucose_level)
        };
        // --- END OF CRITICAL FIX ---

        const latestVitals = rawVitals.length > 0 ? rawVitals[rawVitals.length - 1] : null;
        
        // 4. REUSE monitoring.ejs for the view, now with chartData
        res.render('monitoring', {
            vitals: rawVitals.slice(-10).reverse(), // Show last 10 readings in table
            latest: latestVitals,
            chartData: chartData, // Pass the processed chart data
            username: patientResult.rows[0].username,
            isDoctorView: true // Pass the flag
        });
    } catch (err) {
        console.error('Error fetching patient vitals for doctor:', err);
        req.flash('error_msg', 'Could not load patient monitoring data.');
        res.redirect('/doctor/dashboard');
    }
});

// GET: Doctor views a specific medical record detail page
app.get('/doctor/record/:id', isAuthenticated, isDoctorOrAdmin, async (req, res) => {
    const recordId = req.params.id;
    const doctorId = req.session.user.id;

    try {
        // 1. Fetch the record first to get the patient's user_id
        const recordResult = await db.query('SELECT user_id FROM medical_records WHERE record_id = $1', [recordId]);
        if (recordResult.rows.length === 0) {
            req.flash('error_msg', 'Medical record not found.');
            return res.redirect('/doctor/dashboard');
        }
        const patientId = recordResult.rows[0].user_id;

        // 2. SECURITY CHECK
        const hasRelationship = await checkDoctorPatientRelationship(doctorId, patientId);
        if (!hasRelationship) {
            req.flash('error_msg', 'Access Denied: You are not authorized to view this patient\'s record.');
            return res.redirect('/doctor/dashboard');
        }
        
        // 3. Fetch full record details if authorized
        const query = `
            SELECT mr.*, u.username, a.doctor_name FROM medical_records mr
            JOIN users u ON mr.user_id = u.id
            LEFT JOIN appointments a ON mr.appointment_id = a.id
            WHERE mr.record_id = $1
        `;
        const result = await db.query(query, [recordId]);

        logAudit(doctorId, 'DOCTOR_VIEWED_RECORD', record.record_id, req);

        // 4. REUSE view_record.ejs for the view
        res.render('view_record', { record: result.rows[0] });

    } catch (err) {
        console.error(`Error fetching record ID ${recordId} for doctor:`, err);
        req.flash('error_msg', 'An error occurred while retrieving the record.');
        res.redirect('/doctor/dashboard');
    }
});

// ADMIN MANAGEMENT ROUTES

// --- ADMIN MANAGEMENT ROUTES (Staff & Schedule) ---

// GET: Display the Staff Management Page (List all users)
app.get('/admin/staff', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT id, username, email, role FROM users ORDER BY id ASC');
        res.render('admin_staff', { users: result.rows });
    } catch (err) {
        console.error('Error fetching staff list:', err);
        req.flash('error_msg', 'Failed to load staff list.');
        res.redirect('/dashboard');
    }
});

// POST: Update a User's Role (Admin action)
app.post('/admin/staff/update-role', isAuthenticated, isAdmin, async (req, res) => {
    const { user_id, new_role } = req.body;

    // Prevent admin from accidentally demoting themselves (optional check)
    if (parseInt(user_id) === req.session.user.id) {
        req.flash('error_msg', 'You cannot change your own role.');
        return res.redirect('/admin/staff');
    }

    try {
        await db.query('UPDATE users SET role = $1 WHERE id = $2', [new_role, user_id]);
        req.flash('success_msg', 'User role updated successfully.');
        res.redirect('/admin/staff');
    } catch (err) {
        console.error('Error updating user role:', err);
        req.flash('error_msg', 'Failed to update role.');
        res.redirect('/admin/staff');
    }
});

// GET: Page to Manage a Specific Doctor's Schedule
app.get('/admin/schedule/:id', isAuthenticated, isAdmin, async (req, res) => {
    const doctorId = req.params.id;
    try {
        const userResult = await db.query('SELECT id, username FROM users WHERE id = $1 AND role = $2', [doctorId, 'doctor']);
        if (userResult.rows.length === 0) {
            req.flash('error_msg', 'Doctor not found.');
            return res.redirect('/admin/staff');
        }
        
        const scheduleResult = await db.query('SELECT * FROM doctor_schedules WHERE doctor_id = $1 ORDER BY day_of_week', [doctorId]);
        
        res.render('admin_schedule', {
            doctor: userResult.rows[0],
            schedule: scheduleResult.rows
        });
    } catch (err) {
        console.error('Error fetching schedule:', err);
        req.flash('error_msg', 'Failed to load schedule.');
        res.redirect('/admin/staff');
    }
});

// POST: Add a new weekly schedule entry for a doctor
app.post('/admin/schedule', isAuthenticated, isAdmin, async (req, res) => {
    const { doctor_id, day_of_week, start_time, end_time } = req.body;

    try {
        await db.query(
            'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
            [doctor_id, day_of_week, start_time, end_time]
        );
        req.flash('success_msg', 'Schedule entry added.');
        res.redirect(`/admin/schedule/${doctor_id}`);
    } catch (err) {
        if (err.code === '23505') { // Unique constraint violation
            req.flash('error_msg', 'An entry for this day already exists. Please delete the old one first.');
        } else {
            console.error('Error adding schedule:', err);
            req.flash('error_msg', 'Failed to add schedule entry.');
        }
        res.redirect(`/admin/schedule/${doctor_id}`);
    }
});

// DELETE: Remove a schedule entry
app.delete('/admin/schedule/:id', isAuthenticated, isAdmin, async (req, res) => {
    const scheduleId = req.params.id;
    // We need the doctorId to redirect back to the correct page
    const doctorId = req.body.doctor_id; 
    
    try {
        await db.query('DELETE FROM doctor_schedules WHERE schedule_id = $1', [scheduleId]);
        req.flash('success_msg', 'Schedule entry removed.');
        res.redirect(`/admin/schedule/${doctorId}`);
    } catch (err) {
        console.error('Error deleting schedule:', err);
        req.flash('error_msg', 'Failed to remove schedule entry.');
        res.redirect(`/admin/schedule/${doctorId}`);
    }
});

// GET: Admin Audit Log Viewer
app.get('/admin/audit-log', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                al.log_id, al.action_type, al.target_id, al.ip_address, al.timestamp,
                u.username AS user_username, 
                u.role AS user_role
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.timestamp DESC
            LIMIT 100 -- Limit to 100 most recent logs for performance
        `;
        const result = await db.query(query);
        res.render('admin_audit_log', { logs: result.rows });
    } catch (err) {
        console.error('Error fetching audit log:', err);
        req.flash('error_msg', 'Failed to load audit log.');
        res.redirect('/dashboard');
    }
});

// GET: Mock Insurance Claim Page (Admin Only)
app.get('/claim/:invoice_id', isAuthenticated, isAdmin, async (req, res) => {
    const { invoice_id } = req.params;
    const client = await db.connect();

    try {
        const invoiceQuery = `
            SELECT i.*, u.username, u.email, u.insurance_provider, u.policy_number 
            FROM invoices i
            JOIN users u ON i.user_id = u.id
            WHERE i.invoice_id = $1
        `;
        const invoiceResult = await client.query(invoiceQuery, [invoice_id]);

        if (invoiceResult.rows.length === 0) {
            req.flash('error_msg', 'Invoice not found.');
            return res.redirect('/invoices');
        }

        const itemsResult = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice_id]);

        res.render('claim_form', {
            invoice: invoiceResult.rows[0],
            items: itemsResult.rows
        });

    } catch (err) {
        console.error('Error generating claim form:', err);
        req.flash('error_msg', 'Failed to load claim data.');
        res.redirect('/invoices');
    } finally {
        client.release();
    }
});

// --- Email Reminders API ---

// GET: Fetches all reminders that are due, including appointment details.
app.get('/api/get-due-reminders', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Find all queued reminders, join with users and appointments
        const remindersResult = await db.query(`
            SELECT 
                n.notification_id, 
                u.email, 
                u.username,
                a.appointment_date, 
                a.appointment_time,
                a.doctor_name
            FROM notifications n
            JOIN users u ON n.user_id = u.id
            LEFT JOIN appointments a ON n.user_id = a.user_id 
                AND n.send_at BETWEEN (a.appointment_date + a.appointment_time - INTERVAL '25 hours') 
                AND (a.appointment_date + a.appointment_time - INTERVAL '23 hours') -- Link reminder to the specific appointment
            WHERE n.status = 'Queued' AND n.send_at <= CURRENT_TIMESTAMP
        `);
        
        // Return the list including appointment details as JSON
        res.json(remindersResult.rows);

    } catch (err) {
        console.error('API Error: Could not fetch due reminders with details:', err);
        res.status(500).json({ error: 'Failed to fetch reminders' });
    }
});

// POST: Updates the status of reminders after they have been sent by the frontend.
app.post('/api/update-reminder-status', isAuthenticated, isAdmin, async (req, res) => {
    // Expects an array of notification IDs that were successfully sent
    const { sentIds } = req.body;

    if (!sentIds || !Array.isArray(sentIds) || sentIds.length === 0) {
        return res.status(400).json({ error: 'No valid IDs provided' });
    }

    try {
        await db.query("UPDATE notifications SET status = 'Sent' WHERE notification_id = ANY($1::int[])", [sentIds]);
        res.json({ success: true, message: `${sentIds.length} reminders updated.` });
    } catch (err) {
        console.error('API Error: Could not update reminder statuses:', err);
        res.status(500).json({ error: 'Failed to update statuses in database' });
    }
});

// GET: Display the E-Prescribing Form
app.get('/prescribe/:record_id', isAuthenticated, isDoctorOrAdmin, async (req, res) => {
    const recordId = req.params.record_id;
    try {
        // Fetch the medical record and join with users to get patient name
        const query = `
            SELECT mr.record_id, mr.user_id, u.username as patient_name
            FROM medical_records mr
            JOIN users u ON mr.user_id = u.id
            WHERE mr.record_id = $1
        `;
        const result = await db.query(query, [recordId]);

        if (result.rows.length === 0) {
            req.flash('error_msg', 'Medical record not found.');
            return res.redirect('/dashboard'); // Or doctor's dashboard
        }
        res.render('new_prescription', { record: result.rows[0] });
    } catch (err) {
        console.error('Error fetching record for prescription:', err);
        req.flash('error_msg', 'Failed to load prescription form.');
        res.redirect('/dashboard');
    }
});

// POST: Save the New Prescription
app.post('/prescribe', isAuthenticated, isDoctorOrAdmin, async (req, res) => {
    const { record_id, user_id, medication_name, dosage, frequency, duration, notes } = req.body;
    const doctorId = req.session.user.id; // The logged-in doctor/admin is the prescriber

    if (!record_id || !user_id || !medication_name || !dosage || !frequency) {
        req.flash('error_msg', 'All required fields (Medication, Dosage, Frequency) must be filled.');
        return res.redirect(`/prescribe/${record_id}`);
    }

    try {
        const query = `
            INSERT INTO prescriptions 
            (record_id, user_id, doctor_id, medication_name, dosage, frequency, duration, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await db.query(query, [record_id, user_id, doctorId, medication_name, dosage, frequency, duration, notes]);

        req.flash('success_msg', 'Prescription issued successfully.');
        res.redirect(`/records/${record_id}`); // Redirect back to the patient's record detail page
    } catch (err) {
        console.error('Error issuing prescription:', err);
        req.flash('error_msg', 'Failed to issue prescription due to a server error.');
        res.redirect(`/prescribe/${record_id}`);
    }
});

// POST: Admin Adjustment (Legal Issue/Correction ONLY)
// Note: This needs to be a separate route to isolate admin actions for security.
app.post('/admin/wallet/adjust', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, adjustment_amount, adjustment_reason, action_type } = req.body;
    const amount = parseFloat(adjustment_amount);
    const patientId = parseInt(patient_id);

    if (isNaN(amount) || !patientId || !adjustment_reason || !['add', 'subtract'].includes(action_type)) {
        req.flash('error_msg', 'Invalid adjustment data.');
        return res.redirect('/wallet');
    }
    
    // Determine final amount to apply (positive or negative)
    const finalAmount = action_type === 'subtract' ? -amount : amount;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Update user's wallet balance
        const updateQuery = 'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2';
        await client.query(updateQuery, [finalAmount, patientId]);
        
        // 2. Log the transaction
        const transactionQuery = `
            INSERT INTO wallet_transactions (user_id, amount, transaction_type, reference_id, description)
            VALUES ($1, $2, 'Adjustment', $3, $4)
        `;
        await client.query(transactionQuery, [patientId, finalAmount, req.session.user.username, `Admin Action (${adjustment_reason})`]);

        await client.query('COMMIT');

        logAudit(req.session.user.id, 'ADMIN_WALLET_ADJUSTMENT', patientId, req);

        req.flash('success_msg', `Balance for User ID ${patientId} adjusted by $${finalAmount.toFixed(2)}.`);
        res.redirect('/wallet');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Admin wallet adjustment error:', err);
        req.flash('error_msg', 'Adjustment failed due to system error.');
        res.redirect('/wallet');
    } finally {
        client.release();
    }
});

// GET: New Medical Record Form (Admin Only)
app.get('/newrecord', isAuthenticated, isAdmin, async (req, res) => {
    let patients = [];
    let appointments = []; // 1. Initialized to empty array

    try {
        const patientResult = await db.query('SELECT id, username, email FROM users WHERE role = $1 ORDER BY username', ['user']);
        patients = patientResult.rows;

        // 2. Fetch appointments (if this query fails, 'appointments' remains [])
        const appointmentResult = await db.query('SELECT id, patient_name, doctor_name FROM appointments ORDER BY id DESC LIMIT 50');
        appointments = appointmentResult.rows;

    } catch (err) {
        console.error('Error fetching data for new record form (DB check):', err);
        req.flash('error_msg', 'Database connection error prevented loading necessary patient/appointment lists.');
        // Do NOT return or redirect here. Let the code proceed to render with []
    }

    // 3. CRITICAL: Render happens once and always passes the variable.
    res.render('newrecord', { 
        patients: patients, 
        appointments: appointments, // GUARANTEED to be an array (fetched or empty)
        doctor_name: req.session.user.username 
    });
});

// POST: Save New Medical Record (Admin Only)
app.post('/newrecord', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, diagnosis, treatment_plan, doctor_notes, blood_pressure, allergies, record_date, appointment_id } = req.body;
    
    try {
        const query = `
            INSERT INTO medical_records 
            (user_id, diagnosis, treatment_plan, doctor_notes, blood_pressure, allergies, record_date, appointment_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await db.query(query, [
            patient_id, 
            diagnosis, 
            treatment_plan, 
            doctor_notes, 
            blood_pressure, 
            allergies, 
            record_date || new Date().toISOString().split('T')[0],
            appointment_id || null
        ]);

        req.flash('success_msg', `Medical record successfully added for Patient ID ${patient_id}.`);
        res.redirect('/records');
    } catch (err) {
        console.error('Error adding new medical record:', err);
        req.flash('error_msg', 'Error adding record. Please check inputs and try again.');
        res.redirect('/newrecord');
    }
});

// GET: Add Vitals Form (Admin Only)
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

// POST: Save New Vitals (Admin Only)
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

// GET: Display the Service Catalog (Admin Only)
app.get('/services', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Run queries concurrently for efficiency
        const servicesPromise = db.query('SELECT * FROM services ORDER BY category, service_name');
        const inventoryPromise = db.query('SELECT item_id, item_name FROM inventory ORDER BY item_name');
        
        const [servicesResult, inventoryResult] = await Promise.all([servicesPromise, inventoryPromise]);

        const formattedServices = servicesResult.rows.map(s => ({
            ...s,
            cost: parseFloat(s.cost).toFixed(2)
        }));

        res.render('service_catalog', { 
            services: formattedServices,
            inventory: inventoryResult.rows
        });
    } catch (err) {
        console.error('Error fetching service catalog:', err);
        req.flash('error_msg', 'Error retrieving service data.');
        res.render('service_catalog', { services: [], inventory: [] });
    }
});

// POST: Add a New Service (Admin Only)
app.post('/services', isAuthenticated, isAdmin, async (req, res) => {
    const { service_name, category, cost, description, linked_inventory_item_id } = req.body;
    
    if (!service_name || !category || !cost || isNaN(cost)) {
        req.flash('error_msg', 'Service Name, Category, and a valid Cost are required.');
        return res.redirect('/services');
    }

    try {
        const query = `
            INSERT INTO services (service_name, category, cost, description, linked_inventory_item_id)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await db.query(query, [service_name, category, cost, description, linked_inventory_item_id || null]);

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

// 3. DELETE: Route to handle deleting a service from the table
app.delete('/services/:id', isAuthenticated, isAdmin, async (req, res) => {
    const serviceId = req.params.id;

    try {
        const result = await db.query('DELETE FROM services WHERE service_id = $1 RETURNING service_name', [serviceId]);

        if (result.rowCount > 0) {
            req.flash('success_msg', `Service "${result.rows[0].service_name}" deleted successfully.`);
        } else {
            req.flash('error_msg', 'Service not found.');
        }
        res.redirect('/services');
    } catch (err) {
        console.error('Error deleting service:', err);
        req.flash('error_msg', 'Error deleting service. It may be linked to existing invoices.');
        res.redirect('/services');
    }
});

// NEW PUBLIC ROUTE: Service Catalog (Accessible to everyone)
app.get('/public-services', async (req, res) => {
    let services = []; // Initialize services as an empty array

    try {
        // Fetch services data using the reusable function
        services = await fetchServices(); 
        
        // Render the public view, passing the fetched service data
        res.render('public_services', { services: services });
    } catch (err) {
        console.error('Error fetching public services:', err);
        req.flash('error_msg', 'Could not load service catalog.');
        
        // Render with an empty array on error to prevent EJS crash
        res.render('public_services', { services: [] }); 
    }
});

// GET: Display Invoice Generation Form (Admin Only)
app.get('/new-invoice', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const patientsResult = await db.query('SELECT id, username, email FROM users WHERE role = $1 ORDER BY username', ['user']);
        const services = await fetchServices(); 
        
        res.render('new_invoice', { 
            patients: patientsResult.rows,
            services: services
        });
    } catch (err) {
        console.error('Error loading invoice form data:', err);
        req.flash('error_msg', 'Failed to load data for the invoice form.');
        res.redirect('/dashboard');
    }
});

// POST: Generate and Save the Invoice (Transaction + Inventory Fix)
app.post('/new-invoice', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, record_id, due_date, service_ids, quantities } = req.body;

    if (!patient_id || !due_date || !service_ids || service_ids.length === 0) {
        req.flash('error_msg', 'Patient, Due Date, and at least one Service are required.');
        return res.redirect('/new-invoice');
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        // Fetch service details, including the inventory link
        const serviceDetailsResult = await client.query(
            'SELECT service_id, service_name, cost, linked_inventory_item_id FROM services WHERE service_id = ANY($1)', 
            [service_ids]
        );
        const serviceDetails = serviceDetailsResult.rows;

        let totalAmount = 0;
        
        // Insert Invoice
        const invoiceQuery = `
            INSERT INTO invoices (user_id, record_id, due_date, total_amount) 
            VALUES ($1, $2, $3, $4) RETURNING invoice_id
        `;
        const invoiceResult = await client.query(invoiceQuery, [patient_id, record_id || null, due_date, 0.00]);
        const invoiceId = invoiceResult.rows[0].invoice_id;

        // Loop through items, insert them, AND update inventory
        for (let i = 0; i < service_ids.length; i++) {
            const serviceId = parseInt(service_ids[i]);
            const quantity = parseInt(quantities[i]) || 1;
            const detail = serviceDetails.find(s => s.service_id === serviceId);

            if (detail) {
                // Add item to invoice
                const cost = parseFloat(detail.cost);
                totalAmount += cost * quantity;
                await client.query(
                    'INSERT INTO invoice_items (invoice_id, service_name, cost_per_unit, quantity) VALUES ($1, $2, $3, $4)',
                    [invoiceId, detail.service_name, cost, quantity]
                );

                // Check if this service is linked to an inventory item
                if (detail.linked_inventory_item_id) {
                    const inventoryId = detail.linked_inventory_item_id;
                    
                    // Check stock and lock the row to prevent race conditions
                    const stockCheck = await client.query(
                        'SELECT current_stock FROM inventory WHERE item_id = $1 FOR UPDATE', 
                        [inventoryId]
                    );

                    if (stockCheck.rows.length === 0) {
                        throw new Error(`Linked inventory item (ID: ${inventoryId}) not found.`);
                    }

                    const currentStock = stockCheck.rows[0].current_stock;
                    
                    // Check if stock is sufficient
                    if (currentStock < quantity) {
                        throw new Error(`Insufficient stock for "${detail.service_name}". Only ${currentStock} units left, but ${quantity} were requested.`);
                    }

                    // Decrement the stock
                    await client.query(
                        'UPDATE inventory SET current_stock = current_stock - $1, last_updated = CURRENT_TIMESTAMP WHERE item_id = $2',
                        [quantity, inventoryId]
                    );
                }
            }
        }

        // 4. Update the Invoice with the final total amount
        await client.query('UPDATE invoices SET total_amount = $1 WHERE invoice_id = $2', [totalAmount.toFixed(2), invoiceId]);

        await client.query('COMMIT');
        req.flash('success_msg', `Invoice #${invoiceId} generated and inventory updated.`);
        res.redirect('/invoices');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in new invoice transaction:', err);
        req.flash('error_msg', `Error: ${err.message}`);
        res.redirect('/new-invoice');
    } finally {
        client.release();
    }
});

// GET: Display Inventory List and Management Form (Admin Only)
app.get('/inventory', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM inventory ORDER BY current_stock ASC');
        const items = result.rows;

        res.render('inventory_catalog', { items: items });
    } catch (err) {
        console.error('Error fetching inventory:', err);
        req.flash('error_msg', 'Error retrieving inventory data.');
        res.render('inventory_catalog', { items: [] });
    }
});

// POST: Add a New Inventory Item (Admin Only)
app.post('/inventory', isAuthenticated, isAdmin, async (req, res) => {
    const { item_name, current_stock, unit, low_stock_threshold } = req.body;
    
    if (!item_name || !current_stock || !unit) {
        req.flash('error_msg', 'Item Name, Stock, and Unit are required.');
        return res.redirect('/inventory');
    }

    try {
        const query = `
            INSERT INTO inventory (item_name, current_stock, unit, low_stock_threshold)
            VALUES ($1, $2, $3, $4)
        `;
        await db.query(query, [item_name, current_stock, unit, low_stock_threshold || 10]);

        req.flash('success_msg', `Inventory item "${item_name}" added successfully.`);
        res.redirect('/inventory');
    } catch (err) {
        if (err.code === '23505') {
            req.flash('error_msg', 'An item with that name already exists.');
        } else {
            console.error('Error adding new inventory item:', err);
            req.flash('error_msg', 'An error occurred while adding the item.');
        }
        res.redirect('/inventory');
    }
});

// POST: Update an existing inventory item's stock (SET new value)
app.post('/inventory/update/:id', isAuthenticated, isAdmin, async (req, res) => {
    const itemId = req.params.id;
    // We use a dynamic name 'new_stock_value' to avoid conflicts
    const newStock = parseInt(req.body.new_stock_value);

    if (isNaN(newStock) || newStock < 0) {
        req.flash('error_msg', 'Invalid stock quantity. Must be a positive number.');
        return res.redirect('/inventory');
    }

    try {
        const result = await db.query(
            'UPDATE inventory SET current_stock = $1, last_updated = CURRENT_TIMESTAMP WHERE item_id = $2 RETURNING item_name',
            [newStock, itemId]
        );

        if (result.rowCount > 0) {
            req.flash('success_msg', `Stock for "${result.rows[0].item_name}" has been set to ${newStock}.`);
        } else {
            req.flash('error_msg', 'Item not found.');
        }
        res.redirect('/inventory');
    } catch (err) {
        console.error('Error updating stock:', err);
        req.flash('error_msg', 'An error occurred while updating stock.');
        res.redirect('/inventory');
    }
});

// DELETE: Delete an Inventory Item (Admin Only)
app.delete('/inventory/:id', isAuthenticated, isAdmin, async (req, res) => {
    const itemId = req.params.id;

    try {
        const result = await db.query('DELETE FROM inventory WHERE item_id = $1 RETURNING item_name', [itemId]);

        if (result.rowCount > 0) {
            req.flash('success_msg', `Item "${result.rows[0].item_name}" deleted.`);
        } else {
            req.flash('error_msg', 'Item not found.');
        }
        res.redirect('/inventory');
    } catch (err) {
        console.error('Error deleting item:', err);
        req.flash('error_msg', 'Error deleting item. Check for dependencies.');
        res.redirect('/inventory');
    }
});

// Appointment Status Update

// POST: Allows Admin to update the status of ANY appointment (e.g., Cancel, Mark as Completed)
app.post('/admin/appointments/:id/status', isAuthenticated, isAdmin, async (req, res) => {
    const appointmentId = req.params.id;
    // The new status is passed via the form body
    const { status: newStatus } = req.body; 

    // Basic validation on status
    if (!['Confirmed', 'Canceled', 'Completed'].includes(newStatus)) {
        req.flash('error_msg', 'Invalid status update attempt.');
        return res.redirect('/appointments');
    }

    try {
        const query = `
            UPDATE appointments
            SET status = $1
            WHERE id = $2
            RETURNING patient_name
        `;
        const result = await db.query(query, [newStatus, appointmentId]);

        if (result.rowCount > 0) {
            req.flash('success_msg', `Appointment for ${result.rows[0].patient_name} successfully set to "${newStatus}".`);
        } else {
            req.flash('error_msg', 'Appointment not found.');
        }
        
        res.redirect('/appointments');
    } catch (err) {
        console.error('Error updating appointment status:', err);
        req.flash('error_msg', 'A server error occurred while updating the status.');
        res.redirect('/appointments');
    }
});

// GET: Display the Admin Reporting and Analytics Dashboard
app.get('/admin/analytics', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // --- 1. Prepare Concurrent Database Queries (KPIs) ---
        
        // A. Total Users and Admins
        const userCountPromise = db.query('SELECT role, COUNT(*) FROM users GROUP BY role');
        
        // B. Total Appointments by Status
        const apptStatusPromise = db.query('SELECT status, COUNT(*) FROM appointments GROUP BY status');
        
        // C. Revenue Metrics (Total Billed vs. Total Paid)
        const revenuePromise = db.query(`
            SELECT 
                SUM(total_amount) AS total_billed, 
                SUM(amount_paid) AS total_collected,
                SUM(total_amount - amount_paid) AS total_outstanding
            FROM invoices
        `);
        
        // D. Low Stock Count (Reusing existing logic)
        const lowStockPromise = db.query(
            'SELECT COUNT(*) AS count FROM inventory WHERE current_stock <= low_stock_threshold'
        );

        // --- 2. Execute all queries concurrently ---
        const [
            userCounts, 
            apptStatuses, 
            revenueMetrics, 
            lowStock
        ] = await Promise.all([
            userCountPromise, 
            apptStatusPromise, 
            revenuePromise, 
            lowStockPromise
        ]);

        // --- 3. Format Data for Frontend ---
        
        // Format User Counts: {user: N, admin: M}
        const userStats = userCounts.rows.reduce((acc, row) => {
            acc[row.role] = parseInt(row.count, 10);
            return acc;
        }, { user: 0, admin: 0 });
        
        // Format Revenue: Ensure numbers are float/fixed
        const revenueStats = revenueMetrics.rows[0] || {};
        const totalBilled = parseFloat(revenueStats.total_billed || 0).toFixed(2);
        const totalCollected = parseFloat(revenueStats.total_collected || 0).toFixed(2);
        const totalOutstanding = parseFloat(revenueStats.total_outstanding || 0).toFixed(2);
        
        // Format Appointment Statuses: {[status]: N}
        const apptStats = apptStatuses.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count, 10);
            return acc;
        }, { Pending: 0, Confirmed: 0, Canceled: 0, Completed: 0 });
        
        // Low Stock Count
        const lowStockCount = parseInt(lowStock.rows[0].count, 10);

        // --- 4. Render View ---
        res.render('admin_analytics', {
            userStats,
            apptStats,
            totalBilled,
            totalCollected,
            totalOutstanding,
            lowStockCount
        });

    } catch (err) {
        console.error('CRITICAL ANALYTICS DATA FETCH ERROR:', err);
        req.flash('error_msg', 'Failed to load comprehensive analytics data due to a server error.');
        res.redirect('/dashboard');
    }
});

// GET: Admin View All Patient Feedback
app.get('/admin/feedback', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Join with the users table to get the patient's username
        const query = `
            SELECT 
                cf.*, 
                u.username, 
                u.email 
            FROM 
                consultation_feedback cf
            JOIN 
                users u ON cf.user_id = u.id
            ORDER BY 
                cf.submitted_at DESC
        `;
        const result = await db.query(query);
        
        res.render('admin_feedback', { 
            feedback: result.rows 
        });

    } catch (err) {
        console.error('Error fetching admin feedback:', err);
        req.flash('error_msg', 'Could not load feedback data.');
        res.redirect('/dashboard'); // Redirect to the main admin dashboard on error
    }
});

// GET: Public Services
app.get('/public-services', async (req, res) => {
    try {
        const services = await fetchServices();
        res.render('public_services', { services });
    } catch (err) {
        console.error('Error fetching public services:', err);
        req.flash('error_msg', 'Could not load service catalog.');
        res.render('public_services', { services: [] });
    }
});


// --- ERROR HANDLING ---

// 404 handler
app.use((req, res, next) => {
    res.status(404).render('error', { 
        message: 'Page Not Found',
        error: { status: 404 }
    });
});

// General Error handler
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