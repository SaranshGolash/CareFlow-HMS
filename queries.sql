-- Here are all table creation and update queries for the database schema that have been used in the project --

-- 1. Create the USERS table (Essential for login, includes role column)

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    -- Role column added for Admin/User distinction
    role VARCHAR(10) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create the APPOINTMENTS table (Linked to users via user_id)

CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    patient_name VARCHAR(255) NOT NULL,
    gender VARCHAR(10),
    phone VARCHAR(20),
    doctor_name VARCHAR(255),
    -- Foreign Key: Links appointment to the logged-in user (patient)
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Create the MEDICAL_RECORDS table (Linked to users via user_id)

CREATE TABLE medical_records (
    record_id SERIAL PRIMARY KEY,
    -- Foreign Key: Ensures the record belongs to an existing user/patient
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    record_date DATE DEFAULT CURRENT_DATE,
    diagnosis TEXT NOT NULL,
    treatment_plan TEXT,
    doctor_notes TEXT,
    blood_pressure VARCHAR(20),
    allergies TEXT
);

-- 4. Create the HEALTH_VITALS table (For monitoring, linked to users via user_id)

CREATE TABLE health_vitals (
    vital_id SERIAL PRIMARY KEY,
    -- Foreign Key: Links vital signs to the patient
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    reading_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    heart_rate INTEGER,
    temperature DECIMAL(4, 2),
    spo2 DECIMAL(4, 1),
    glucose_level DECIMAL(5, 2),
    systolic_bp INTEGER,
    diastolic_bp INTEGER
);

-- 5. Create the SERVICES table (For various medical services offered)

CREATE TABLE services (
    service_id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL, -- e.g., Consultation, Lab Test, Procedure
    cost NUMERIC(8, 2) NOT NULL, -- Currency cost with 2 decimal places
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- 6. Create the INVOICES table
CREATE TABLE invoices (
    invoice_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT NOT NULL, -- The patient being billed
    record_id INTEGER REFERENCES medical_records(record_id) ON DELETE SET NULL, -- Link to the consultation/record
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' -- Pending, Paid, Partial, Canceled
);

-- 7. Create the INVOICE_ITEMS table (for itemized details)
CREATE TABLE invoice_items (
    item_id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(invoice_id) ON DELETE CASCADE NOT NULL,
    service_name VARCHAR(100) NOT NULL, -- Store name for historical lookup
    cost_per_unit NUMERIC(8, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1
);

-- 8. Update the MEDICAL_RECORDS table to link back to the invoice (Optional link, but useful)
ALTER TABLE medical_records
ADD COLUMN invoice_id INTEGER REFERENCES invoices(invoice_id) ON DELETE SET NULL;

ALTER TABLE invoices
ADD COLUMN stripe_payment_intent_id VARCHAR(100);

-- Create a table for secure messages/support tickets
CREATE TABLE secure_messages (
    message_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL, -- The patient who sent the message
    sender_role VARCHAR(10) NOT NULL, -- 'user' or 'admin' (for replies)
    subject VARCHAR(255) NOT NULL,
    message_body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE
);

-- Create a table for storing patient feedback after a consultation
CREATE TABLE consultation_feedback (
    feedback_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    effectiveness_rating VARCHAR(10) NOT NULL, -- 'yes' or 'no'
    star_rating INTEGER DEFAULT 4,             -- Mocked star rating (e.g., 1 to 5)
    comments TEXT
);

-- Add the sender_username column to the secure_messages table
ALTER TABLE secure_messages
ADD COLUMN sender_username VARCHAR(50);

-- Run this if you want to backfill existing messages (assuming user IDs are correct)
UPDATE secure_messages sm
SET sender_username = u.username
FROM users u
WHERE sm.user_id = u.id AND sm.sender_username IS NULL;

-- Add a foreign key column to link a medical record back to the specific appointment
ALTER TABLE medical_records
ADD COLUMN appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL;

UPDATE medical_records mr
SET appointment_id = sub.latest_appointment_id
FROM (
    -- Find the latest appointment ID for each user
    SELECT DISTINCT ON (a.user_id) 
           a.id AS latest_appointment_id, 
           a.user_id
    FROM appointments a
    ORDER BY a.user_id, a.id DESC -- Assuming higher 'id' means newer appointment
) sub
WHERE mr.user_id = sub.user_id
  AND mr.appointment_id IS NULL; -- Only update rows that are currently NULL

-- Create the INVENTORY table to track stock
CREATE TABLE inventory (
    item_id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) UNIQUE NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(20),                   -- e.g., 'units', 'boxes', 'ml'
    low_stock_threshold INTEGER NOT NULL DEFAULT 10,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ALTER SEQUENCE WHEN PROJECT IS READY FOR DEPLOYMENT
ALTER SEQUENCE services_service_id_seq RESTART WITH 1;

ALTER TABLE appointments
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Pending';

ALTER TABLE users
ADD COLUMN wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE wallet_transactions (
    transaction_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'Deposit', 'Payment', 'Adjustment'
    reference_id VARCHAR(100),              -- Links to invoice_id, admin action, etc.
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE appointments
ADD COLUMN appointment_date DATE,
ADD COLUMN appointment_time TIME;

-- 2. Update an existing user to have the 'doctor' role for testing.
--    Replace 'doctor@email.com' with the email of a user you want to be a doctor.
UPDATE users
SET role = 'doctor'
WHERE email = 'doctor@email.com';

ALTER TABLE users
ADD COLUMN phone VARCHAR(20);