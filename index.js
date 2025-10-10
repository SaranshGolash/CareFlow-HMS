const express = require('express');
const pg = require('pg');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// FIX: Automatically convert Postgres NUMERIC (type code 1700) to JavaScript float
const NUMERIC_OID = 1700;
pg.types.setTypeParser(NUMERIC_OID, (value) => {
    return value === null ? null : parseFloat(value);
});

const app = express();

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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// Middleware to check if user is an Admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error_msg', 'Access denied. You must be an administrator.');
    res.redirect('/');
};

// --- Reusable Functions ---

// Function to fetch all active services
const fetchServices = async () => {
    const result = await db.query('SELECT service_id, service_name, cost FROM services WHERE is_active = TRUE ORDER BY category, service_name');
    return result.rows;
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
    try {
        const userId = req.session.user.id;
        const result = await db.query('SELECT * FROM appointments WHERE user_id = $1 ORDER BY id DESC', [userId]);
        const appointments = result.rows;
        res.render('appointments', { appointments });
    } catch (err) {
        console.error('Error fetching appointments:', err);
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

// Records
app.get('/records', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const result = await db.query('SELECT * FROM medical_records WHERE user_id = $1 ORDER BY record_date DESC', [userId]);
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
            SELECT mr.*, u.username 
            FROM medical_records mr
            JOIN users u ON mr.user_id = u.id
            WHERE mr.record_id = $1 AND mr.user_id = $2
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
        console.error('Login processing error (DB/bcrypt hang):', err);
        req.flash('error_msg', 'An internal error occurred during login processing.');
        res.redirect('/login');
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    const saltRounds = 10;

    try {
        const password_hash = await bcrypt.hash(password, saltRounds);
        const query = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, role';
        const result = await db.query(query, [username, email, password_hash]);
        const newUser = result.rows[0];

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
    try {
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
        
        // Calculate Outstanding Balance
        const balanceResult = await db.query(
            'SELECT SUM(total_amount - amount_paid) AS outstanding_balance FROM invoices WHERE user_id = $1 AND status != $2', 
            [userId, 'Paid']
        );
        const outstandingBalance = balanceResult.rows[0].outstanding_balance ? 
                                   parseFloat(balanceResult.rows[0].outstanding_balance).toFixed(2) : 
                                   '0.00';

        res.render('dashboard', {
            apptCount: apptCount,
            recordCount: recordCount,
            vitalCount: vitalCount,
            latestVitalDate: latestVitalDate,
            outstandingBalance: outstandingBalance
        });
    } catch (err) {
        console.error('Dashboard data fetch error:', err);
        req.flash('error_msg', 'Failed to load dashboard data.');
        res.render('dashboard', {
            apptCount: 0,
            recordCount: 0,
            vitalCount: 0,
            latestVitalDate: null,
            outstandingBalance: '0.00'
        });
    }
});

app.get('/settings', isAuthenticated, (req, res) => {
    res.render('settings');
});

app.post('/settings/update', isAuthenticated, async (req, res) => {
    const { username, email, user_id } = req.body;

    // Simplistic check to ensure user is only updating their own data
    if (parseInt(user_id) !== req.session.user.id) {
        req.flash('error_msg', 'Authorization failed.');
        return res.redirect('/settings');
    }

    try {
        const query = 'UPDATE users SET username = $1, email = $2 WHERE id = $3';
        await db.query(query, [username, email, user_id]);

        // Update session data
        req.session.user.username = username;
        req.session.user.email = email;

        req.flash('success_msg', 'Profile updated successfully.');
        res.redirect('/settings');
    } catch (err) {
        console.error('Profile update error:', err);
        if (err.code === '23505') { // Unique constraint violation
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

        req.flash('success_msg', 'Password updated successfully.');
        res.redirect('/settings');

    } catch (err) {
        console.error('Password change error:', err);
        req.flash('error_msg', 'An error occurred during password change.');
        res.redirect('/settings');
    }
});

// --- NEW STRIPE INTEGRATION ROUTES ---

// 1. POST: Create a Stripe Checkout Session/Payment Intent
app.post('/create-checkout-session/:invoiceId', isAuthenticated, async (req, res) => {
    const invoiceId = parseInt(req.params.invoiceId);
    const userId = req.session.user.id;
    const { amount_to_pay } = req.body; // Amount from the form

    if (!amount_to_pay || parseFloat(amount_to_pay) <= 0) {
        return res.status(400).json({ error: 'Invalid payment amount.' });
    }

    try {
        // --- 1. Security Check & Data Retrieval ---
        const invoice = await fetchInvoiceDetails(invoiceId, userId);
        if (!invoice || parseFloat(invoice.total_amount - invoice.amount_paid) < amount_to_pay) {
            return res.status(400).json({ error: 'Invoice invalid, fully paid, or amount exceeds balance.' });
        }
        
        const paymentAmountCents = Math.round(parseFloat(amount_to_pay) * 100);

        // --- 2. Create Stripe Checkout Session ---
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd', // Or your local currency
                        product_data: {
                            name: `Invoice #${invoiceId} Payment`,
                            description: `Payment for outstanding balance on CareFlow HMS.`,
                        },
                        unit_amount: paymentAmountCents, 
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // Success/Cancel URLs must be fully qualified (Render public URL)
            success_url: `${req.protocol}://${req.get('host')}/payment-success?session_id={CHECKOUT_SESSION_ID}&invoice_id=${invoiceId}`,
            cancel_url: `${req.protocol}://${req.get('host')}/invoices/${invoiceId}`,
            client_reference_id: String(invoiceId), // Link to your database ID
            metadata: {
                user_id: userId,
                invoice_id: invoiceId,
            }
        });

        // 3. Redirect the user to the Stripe Checkout Page
        res.json({ id: session.id });

    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).json({ error: 'Could not initiate payment session.' });
    }
});

// 2. GET: Payment Success Handler (Stripe Redirect)
app.get('/payment-success', isAuthenticated, async (req, res) => {
    const sessionId = req.query.session_id;
    const invoiceId = parseInt(req.query.invoice_id);
    
    // Check if the invoice ID is valid
    if (!invoiceId) {
        req.flash('error_msg', 'Payment verification failed: Missing invoice ID.');
        return res.redirect('/invoices');
    }

    const client = await db.connect();
    try {
        // 1. Retrieve session details from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        // --- IMPORTANT: Verify Payment Status and Intent ---
        if (session.payment_status === 'paid' && session.metadata.invoice_id == invoiceId) {
            
            await client.query('BEGIN');
            
            // Calculate actual paid amount (Stripe uses cents)
            const amountPaid = session.amount_total / 100;

            // 2. Update the Invoice in YOUR database
            const updateQuery = `
                UPDATE invoices 
                SET amount_paid = amount_paid + $1, 
                    status = (CASE WHEN total_amount <= amount_paid + $1 THEN 'Paid' ELSE 'Partial' END),
                    stripe_payment_intent_id = $2
                WHERE invoice_id = $3 AND user_id = $4
            `;
            await client.query(updateQuery, [amountPaid, session.payment_intent, invoiceId, req.session.user.id]);

            await client.query('COMMIT');
            
            req.flash('success_msg', `Payment successful! $${amountPaid.toFixed(2)} applied to Invoice #${invoiceId}.`);
            res.redirect(`/invoices/${invoiceId}`); 

        } else {
            // Handle incomplete or failed payment status
            req.flash('error_msg', 'Payment was processed by Stripe but verification failed.');
            res.redirect(`/invoices/${invoiceId}`);
        }

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Payment verification error:', error);
        req.flash('error_msg', 'Payment verification error. Please check your invoice status.');
        res.redirect(`/invoices/${invoiceId}`);
    } finally {
        if (client) client.release();
    }
});

// --- ADMIN MANAGEMENT ROUTES ---

// GET: Service Catalog (Admin View)
app.get('/services', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const services = await fetchServices();
        res.render('service_catalog', { services });
    } catch (err) {
        console.error('Error fetching services for admin:', err);
        req.flash('error_msg', 'Could not load service catalog.');
        res.redirect('/dashboard');
    }
});

// POST: Add New Service (Admin Only)
app.post('/services', isAuthenticated, isAdmin, async (req, res) => {
    const { service_name, category, cost, description } = req.body;
    try {
        const query = 'INSERT INTO services (service_name, category, cost, description) VALUES ($1, $2, $3, $4)';
        await db.query(query, [service_name, category, cost, description]);
        req.flash('success_msg', `Service "${service_name}" added successfully.`);
        res.redirect('/services');
    } catch (err) {
        console.error('Error adding service:', err);
        if (err.code === '23505') {
            req.flash('error_msg', 'Service name already exists.');
        } else {
            req.flash('error_msg', 'Error adding service.');
        }
        res.redirect('/services');
    }
});

// DELETE: Delete Service (Admin Only)
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


// GET: New Medical Record Form (Admin Only)
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

// POST: Save New Medical Record (Admin Only)
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
        req.flash('error_msg', 'Error adding record. Please try again.');
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

// POST: Generate and Save the Invoice (Admin Only)
app.post('/new-invoice', isAuthenticated, isAdmin, async (req, res) => {
    const { patient_id, record_id, due_date, service_ids, quantities } = req.body;

    if (!patient_id || !due_date || !service_ids || service_ids.length === 0) {
        req.flash('error_msg', 'Patient, Due Date, and at least one Service are required.');
        return res.redirect('/new-invoice');
    }
    
    // Use the Pool instance (db) to acquire a dedicated client for transaction
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const serviceDetailsResult = await client.query('SELECT service_id, service_name, cost FROM services WHERE service_id = ANY($1)', [service_ids]);
        const serviceDetails = serviceDetailsResult.rows;

        let totalAmount = 0;
        
        const invoiceQuery = `
            INSERT INTO invoices (user_id, record_id, due_date, total_amount) 
            VALUES ($1, $2, $3, $4) RETURNING invoice_id
        `;
        // Insert with placeholder 0.00 total for now
        const invoiceResult = await client.query(invoiceQuery, [patient_id, record_id || null, due_date, 0.00]); 
        const invoiceId = invoiceResult.rows[0].invoice_id;

        // Insert Invoice Items and calculate final total
        for (let i = 0; i < service_ids.length; i++) {
            const serviceId = parseInt(service_ids[i]);
            const quantity = parseInt(quantities[i]) || 1;
            const detail = serviceDetails.find(s => s.service_id === serviceId);

            if (detail) {
                const cost = parseFloat(detail.cost);
                const itemTotal = cost * quantity;
                totalAmount += itemTotal;

                const itemQuery = `
                    INSERT INTO invoice_items (invoice_id, service_name, cost_per_unit, quantity)
                    VALUES ($1, $2, $3, $4)
                `;
                await client.query(itemQuery, [invoiceId, detail.service_name, cost, quantity]);
            }
        }

        // Update the Invoice with the final total amount
        const updateInvoiceQuery = 'UPDATE invoices SET total_amount = $1 WHERE invoice_id = $2';
        await client.query(updateInvoiceQuery, [totalAmount.toFixed(2), invoiceId]);

        await client.query('COMMIT');

        req.flash('success_msg', `Invoice #${invoiceId} generated successfully for Patient ID ${patient_id}. Total: $${totalAmount.toFixed(2)}`);
        res.redirect('/dashboard'); 

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error generating invoice (Transaction rolled back):', err);
        req.flash('error_msg', 'Error generating invoice. Please check the services and amounts.');
        res.redirect('/new-invoice');
    } finally {
        client.release(); // Release the client back to the pool
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
        // Fetch invoice details and items, enforcing user security unless admin
        const invoice = await fetchInvoiceDetails(invoiceId, isAdminUser ? null : userId);

        if (!invoice) {
            req.flash('error_msg', 'Invoice not found or access denied.');
            return res.redirect('/invoices');
        }
        
        res.render('pay_invoice', { 
            invoice: invoice, 
            items: invoice.items 
        });

    } catch (err) {
        console.error(`Error loading invoice ${invoiceId}:`, err);
        req.flash('error_msg', 'Error loading invoice details.');
        res.redirect('/invoices');
    }
});


// POST: Process Payment Transaction
app.post('/pay-invoice', isAuthenticated, async (req, res) => {
    const { invoice_id, payment_amount, outstanding_balance } = req.body;
    const userId = req.session.user.id;
    
    const amount = parseFloat(payment_amount);
    const outstanding = parseFloat(outstanding_balance);
    const invoiceId = parseInt(invoice_id);

    if (isNaN(amount) || amount <= 0 || amount > outstanding) {
        req.flash('error_msg', 'Invalid payment amount submitted.');
        return res.redirect(`/invoices/${invoiceId}`);
    }

    // Use the Pool instance (db) to acquire a dedicated client for transaction
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Check invoice status and ownership (security check)
        const checkQuery = 'SELECT total_amount, amount_paid, user_id FROM invoices WHERE invoice_id = $1 AND user_id = $2 FOR UPDATE';
        const checkResult = await client.query(checkQuery, [invoiceId, userId]);
        const invoice = checkResult.rows[0];

        if (!invoice) {
            await client.query('ROLLBACK');
            req.flash('error_msg', 'Invoice not found or unauthorized access.');
            return res.redirect('/invoices');
        }

        const newPaidAmount = parseFloat(invoice.amount_paid) + amount;
        const newBalance = parseFloat(invoice.total_amount) - newPaidAmount;
        let newStatus = 'Partial';

        if (newBalance <= 0.005) { // Use a tiny buffer for floating point comparisons
            newStatus = 'Paid';
        }
        
        // 2. Update the Invoice record
        const updateQuery = `
            UPDATE invoices 
            SET amount_paid = $1, status = $2 
            WHERE invoice_id = $3
        `;
        await client.query(updateQuery, [newPaidAmount.toFixed(2), newStatus, invoiceId]);

        await client.query('COMMIT');

        req.flash('success_msg', `Payment of $${amount.toFixed(2)} processed successfully. Status: ${newStatus}.`);
        res.redirect(`/invoices/${invoiceId}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Payment processing error (Transaction rolled back):', err);
        req.flash('error_msg', 'Payment failed due to a server error.');
        res.redirect(`/invoices/${invoiceId}`);
    } finally {
        client.release(); // Release the client back to the pool
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