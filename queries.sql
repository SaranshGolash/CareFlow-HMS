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