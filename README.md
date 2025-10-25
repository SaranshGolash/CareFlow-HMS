## 🏥 CareFlow HMS (Hospital Management System)
CareFlow HMS is a comprehensive, full-stack web application designed to simulate a modern, all-in-one management solution for medical clinics and hospitals. It streamlines clinical workflows, automates administrative tasks, and empowers patients with secure access to their health information.

This project is built with Node.js/Express, PostgreSQL, and EJS, focusing on security, role-based access, and a clean, responsive user interface.

## ✨ Key Features
A brief overview of the core functionalities, categorized by user role:

## 👤 Patient Features
<b>Secure Authentication</b>: Secure signup (with email verification) and login.

<b>Patient Dashboard</b>: A personalized hub to view upcoming appointments, outstanding balances, wallet funds, and recent prescriptions.

<b>Appointment Management</b>: Book new appointments, view upcoming/past schedules, and confirm attendance.

<b>Medical Records</b>: View a complete history of all medical records and prescriptions, including doctor's notes and diagnoses.

<b>Health Monitoring</b>: A visual dashboard (Chart.js) to track personal health vitals (Heart Rate, BP, Glucose, etc.).

<b>Billing & Wallet</b>: View itemized invoices, manage a personal wallet (add/withdraw funds), and pay outstanding bills via a mock payment portal.

<b>Secure Inbox</b>: Send and receive secure messages from the administrative staff/doctors.

## 🩺 Doctor Features
<b>Doctor Dashboard</b>: A unique dashboard that shows only the doctor's scheduled appointments, grouped by "Today" and "Upcoming".

<b>Patient History View</b>: Securely access the complete medical and vital history for any patient with whom they have an appointment.

<b>E-Prescribing (Mock)</b>: Issue new prescriptions directly from a patient's medical record.

<b>Teleconsultation (Mock)</b>: A "Start Call" button on appointments that leads to a mock video call interface.

## ⚙️ Admin Features
<b>Admin Analytics</b>: A high-level analytics dashboard showing KPIs (Key Performance Indicators) like total revenue, outstanding balances, and patient/appointment counts.

<b>Invoice & Billing Management</b>: Generate detailed, itemized invoices for patients using a predefined Service Catalog.

<b>Service Catalog</b>: Full CRUD (Create, Read, Update, Delete) for managing clinic service prices.

<b>Inventory Management</b>: Track clinic supplies (e.g., "Paracetamol," "Syringes"), with Low Stock Alerts on the dashboard.

<b>User Management</b>: View all patients and staff, and promote users to "Admin" or "Doctor" roles.

<b>Automated Reminders (Mock)</b>: A "Process Reminders" button that simulates sending queued appointment reminder emails.

<b>Audit Log</b>: A secure, read-only log that tracks critical actions (e.g., "USER_LOGIN," "VIEWED_RECORD," "ADMIN_WALLET_ADJUSTMENT") for compliance.

## 🤖 System-Wide Features
<b>AI Chatbot</b>: A floating chatbot integrated with the Gemini/OpenAI API to answer user queries.

<b>Automated Emails</b>: Uses EmailJS (or Nodemailer) to send a welcome email on signup and appointment reminders.

<b>Dynamic UI</b>: Polished, responsive design with 3D background animations (Vanta.js) and scroll-triggered animations (AOS).

## 🛠️ Technology Stack
<b>Backend</b>: Node.js, Express.js

<b>Database</b>: PostgreSQL

<b>Frontend</b>: EJS (Embedded JavaScript), Bootstrap 5, Chart.js, Vanta.js

<b>Core Libraries</b>:

pg (node-postgres) for database connection pooling.

bcrypt for secure password hashing.

express-session & connect-flash for user sessions and messaging.

method-override for PUT/DELETE from forms.

<b>APIs & Services</b>:

<b>Email</b>: EmailJS

<b>AI</b>: OpenAI

## 🚀 Setup & Installation
<b>Clone the repository</b>:

Bash

git clone https://github.com/SaranshGolash/CareFlow-HMS.git
cd CareFlow-HMS
Install dependencies:

Bash

npm install
Set up Database:

Create a PostgreSQL database.

Run all the CREATE TABLE and ALTER TABLE SQL scripts from the project documentation to build the schema.

Configure Environment Variables:

Create a .env file in the root directory.

Add all required variables (Database URL, Session Secret, EmailJS keys, Gemini/OpenAI API Key).

Run the server:

Bash

npm start
The application will be running at http://localhost:3000.

## 🔑 Demo Credentials
<b>Patient</b>:

Email: patient@gmail.com

Password: Patient@10

<b>Doctor</b>:

Email: doctor@gmail.com

Password: Doctor@10

<b>Admin</b>:

Email: admin@gmail.com

Password: Admin@10