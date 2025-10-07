## 🏥 CareFlow HMS (Hospital Management System)
CareFlow HMS is a modern, full-stack Hospital Management System designed to streamline patient care workflows, manage appointments, and provide comprehensive health monitoring with secure, role-based access control.

This application was built using a traditional <b>HTML, CSS</b> and <b>EJS</b> <b>Node.js/Express</b> for backend and <b>PostgreSQL</b> for persistence, making it robust, scalable, and production-ready.

## ✨ Key Features
<b><i>Secure Authentication</i></b>: User registration and login using bcrypt for password hashing and secure session management.

<b><i>Role-Based Access Control</i> (RBAC)</b>: Users are classified as user (Patient) or admin (Staff/Doctor), restricting access to sensitive functions.

<b><i>Appointments Management</i></b>: Users can view their scheduled appointments, and staff can manage the overall schedule.

<b><i>Patient Records</i></b>: Secure access for patients to view their medical history and diagnoses.

<b><i>Health Monitoring</i></b>: Dashboard displaying latest vital signs (HR, BP, Glucose, SpO2) and historical trend data.

<b><i>Admin Data Entry</i></b>: Staff can access dedicated interfaces to manually add new Medical Records and Health Vitals for patients.

<b><i>User Settings</i></b>: Logged-in users can update their username/email and securely change their password.

## ⚙️ Tech Stack
<strong><strong>Backend & Database</strong></strong>:

<b><i>Node.js / Express</i></b>: Core server framework.

<b><i>PostgreSQL</i></b>: Primary database for persistence.

<b><i>bcrypt</i></b>: Secure password hashing.

<b><i>express-session / connect-flash</i></b>: Session management and messaging.

## Frontend:

<b><i>EJS (Embedded JavaScript Templating)</i></b>: Dynamic HTML rendering.

<b><i>Bootstrap 5</i></b>: Fully responsive styling and UI components.

<b><i>Custom CSS</i></b>: Maintaining a clean, blue/purple gradient color palette across the application.

## 🚀 Setup and Installation (Local Development)
Follow these steps to get CareFlow HMS running on your local machine.

Prerequisites
Node.js (v18+)

PostgreSQL installed and running locally.

1. <b>Clone the Repository & Install Dependencies</b>
git clone <repository_url> careflow-hms
cd careflow-hms
npm install

2. <b>Configure Environment Variables</b>
Create a file named .env in the root directory and fill it with your local PostgreSQL credentials:

# Server Configuration
PORT=3000
SESSION_SECRET="your-long-secret-key-for-sessions"

# Local PostgreSQL Credentials (MUST MATCH your local setup)
DB_USER=postgres
DB_HOST=localhost
DB_NAME=careflow_db
DB_PASSWORD=your_local_password
DB_PORT=5432

3. <b>Initialize Database Schema</b>
Access your local PostgreSQL client (pgAdmin, DBeaver, or psql) and run the following schema creation scripts to build all necessary tables:

-- 1. <b><i>Create the USERS table</i></b>
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. <b><i>Create the APPOINTMENTS table></i></b>
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    patient_name VARCHAR(255) NOT NULL,
    gender VARCHAR(10),
    phone VARCHAR(20),
    doctor_name VARCHAR(255),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- 3. <b><i>Create the MEDICAL_RECORDS table</i></b>
CREATE TABLE medical_records (
    record_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    record_date DATE DEFAULT CURRENT_DATE,
    diagnosis TEXT NOT NULL,
    treatment_plan TEXT,
    doctor_notes TEXT,
    blood_pressure VARCHAR(20),
    allergies TEXT
);

-- 4. <b><i>Create the HEALTH_VITALS table</i></b>
CREATE TABLE health_vitals (
    vital_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    reading_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    heart_rate INTEGER,
    temperature DECIMAL(4, 2),
    spo2 DECIMAL(4, 1),
    glucose_level DECIMAL(5, 2),
    systolic_bp INTEGER,
    diastolic_bp INTEGER
);

4. <b>Run the Application</b>
npm start

The application will be accessible at http://localhost:3000.

## 🔒 Admin Access
To test the full system functionality:

Sign Up a new user on the /signup page (e.g., email: admin@careflow.com).

Use your SQL client (pgAdmin) to manually update that user's role:

UPDATE users SET role = 'admin' WHERE email = 'admin@careflow.com';

Log in as this user to access admin-only forms.