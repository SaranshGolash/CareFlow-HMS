# 🏥 CareFlow HMS (Hospital Management System)

CareFlow HMS is a comprehensive, full-stack web application designed to simulate a modern, all-in-one management solution for medical clinics and hospitals. It streamlines clinical workflows, automates administrative tasks, and empowers patients with secure access to their health information.

This project is built with **Node.js/Express**, **PostgreSQL**, and **EJS**, focusing on security, role-based access, and a clean, responsive user interface.

---

## ✨ Key Features

A brief overview of the core functionalities, categorized by user role:

### 👤 Patient Features
* **Secure Authentication:** Secure signup (with email verification) and login.
* **Patient Dashboard:** A personalized hub to view upcoming appointments, outstanding balances, wallet funds, and recent prescriptions.
* **Appointment Management:** Book new appointments, view upcoming/past schedules, and confirm attendance.
* **Medical Records:** View a complete history of all medical records and prescriptions, including doctor's notes and diagnoses.
* **Health Monitoring:** A visual dashboard (`Chart.js`) to track personal health vitals (Heart Rate, BP, Glucose, etc.).
* **Billing & Wallet:** View itemized invoices, manage a personal wallet (add/withdraw funds), and pay outstanding bills via a mock payment portal.
* **Secure Inbox:** Send and receive secure messages from the administrative staff/doctors.

### 🩺 Doctor Features
* **Doctor Dashboard:** A unique dashboard that shows *only* the doctor's scheduled appointments, grouped by "Today" and "Upcoming".
* **Patient History View:** Securely access the complete medical and vital history for any patient with whom they have an appointment.
* **E-Prescribing (Mock):** Issue new prescriptions directly from a patient's medical record.
* **Teleconsultation (Mock):** A "Start Call" button on appointments that leads to a mock video call interface.

### ⚙️ Admin Features
* **Admin Analytics:** A high-level analytics dashboard showing KPIs (Key Performance Indicators) like total revenue, outstanding balances, and patient/appointment counts.
* **Invoice & Billing Management:** Generate detailed, itemized invoices for patients using a predefined **Service Catalog**.
* **Service Catalog:** Full CRUD (Create, Read, Update, Delete) for managing clinic service prices.
* **Inventory Management:** Track clinic supplies (e.g., "Paracetamol," "Syringes"), with **Low Stock Alerts** on the dashboard.
* **User Management:** View all patients and staff, and promote users to "Admin" or "Doctor" roles.
* **Automated Reminders (Mock):** A "Process Reminders" button that simulates sending queued appointment reminder emails.
* **Audit Log:** A secure, read-only log that tracks critical actions (e.g., "USER_LOGIN," "VIEWED_RECORD," "ADMIN_WALLET_ADJUSTMENT") for compliance.

### 🤖 System-Wide Features
* **AI Chatbot:** A floating chatbot integrated with the OpenAI API to answer user queries.
* **Automated Emails:** Uses EmailJS to send a welcome email on signup and appointment reminders.
* **Dynamic UI:** Polished, responsive design with 3D background animations (`Vanta.js`) and scroll-triggered animations (AOS).

---

## 🛠️ Technology Stack

* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL
* **Frontend:** EJS (Embedded JavaScript), Bootstrap 5, Chart.js, Vanta.js
* **Core Libraries:**
    * `pg` (node-postgres) for database connection pooling.
    * `bcrypt` for secure password hashing.
    * `express-session` & `connect-flash` for user sessions and messaging.
    * `method-override` for `PUT`/`DELETE` from forms.
* **APIs & Services:**
    * **Email:** EmailJS
    * **AI:** OpenAI

---

## 🚀 Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/SaranshGolash/CareFlow-HMS.git](https://github.com/SaranshGolash/CareFlow-HMS.git)
    cd CareFlow-HMS
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up Database:**
    * Create a PostgreSQL database.
    * Run all the `CREATE TABLE` and `ALTER TABLE` SQL scripts from the project documentation to build the schema.

4.  **Configure Environment Variables:**
    * Create a `.env` file in the root directory.
    * Add all required variables (Database URL, Session Secret, EmailJS keys, OpenAI API Key).

5.  **Run the server:**
    ```bash
    npm start
    ```
    The application will be running at `http://localhost:3000`.

---

## 🔑 Demo Credentials

* **Patient:**
    * **Email:** `patient@gmail.com`
    * **Password:** `Patient@10`
* **Doctor:**
    * **Email:** `doctor@gmail.com`
    * **Password:** `Doctor@10`
* **Admin:**
    * **Email:** `admin@gmail.com`
    * **Password:** `Admin@10`