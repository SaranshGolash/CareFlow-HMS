-- Here are all table creation queries for the database schema that have been used in the project --

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