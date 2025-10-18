document.addEventListener('DOMContentLoaded', function() {
    const processBtn = document.getElementById('processRemindersBtn');
    const btnText = document.getElementById('reminderBtnText');
    const statusText = document.getElementById('reminderStatus');

    if (!processBtn) return;

    processBtn.addEventListener('click', async () => {
        // 1. Disable button and show loading state
        processBtn.disabled = true;
        btnText.textContent = 'Processing...';
        statusText.textContent = 'Fetching reminders...';

        try {
            // 2. Fetch the list of due reminders from our new API route
            const response = await fetch('/api/get-due-reminders');
            const reminders = await response.json();

            if (reminders.length === 0) {
                statusText.textContent = 'No reminders to send.';
                btnText.textContent = 'Send Email Reminders';
                processBtn.disabled = false;
                alert('No pending reminders were due to be sent.');
                return;
            }

            statusText.textContent = `Found ${reminders.length} reminder(s). Sending emails...`;

            // 3. Loop through reminders and send emails using EmailJS
            const emailPromises = reminders.map(reminder => {
                const serviceID = 'YOUR_EMAILJS_SERVICE_ID'; // Replace
                const templateID = 'YOUR_REMINDER_TEMPLATE_ID'; // Replace

                // Format date and time for the email
                const formattedDate = reminder.appointment_date ? new Date(reminder.appointment_date).toLocaleDateString() : 'N/A';
                const formattedTime = reminder.appointment_time ? new Date('1970-01-01T' + reminder.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';

                // Pass the new appointment details to the template
                const templateParams = {
                    username: reminder.username,
                    email: reminder.email,
                    appointment_date: formattedDate,
                    appointment_time: formattedTime,
                    doctor_name: reminder.doctor_name || 'Your Doctor' // Provide a fallback
                };

                return emailjs.send(serviceID, templateID, templateParams)
                    .then(res => {
                        console.log(`Email sent for notification ID ${reminder.notification_id}`, res);
                        return reminder.notification_id; // Return the ID on success
                    })
                    .catch(err => {
                        console.error(`Failed to send for notification ID ${reminder.notification_id}`, err);
                        return null; // Return null on failure
                    });
            });
            
            // 4. Wait for all emails to be sent
            const results = await Promise.all(emailPromises);
            const sentIds = results.filter(id => id !== null); // Filter out failed sends

            statusText.textContent = `${sentIds.length} of ${reminders.length} emails sent. Updating status...`;

            // 5. If any emails were sent, update their status in the database
            if (sentIds.length > 0) {
                await fetch('/api/update-reminder-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sentIds: sentIds }),
                });
            }

            // 6. Reset UI and show final message
            btnText.textContent = 'Send Email Reminders';
            processBtn.disabled = false;
            statusText.textContent = 'Process complete.';
            alert(`${sentIds.length} email reminder(s) have been successfully processed.`);
            window.location.reload(); // Reload to update dashboard stats

        } catch (error) {
            console.error('An error occurred during the reminder process:', error);
            statusText.textContent = 'An error occurred.';
            btnText.textContent = 'Send Email Reminders';
            processBtn.disabled = false;
            alert('An error occurred. Please check the console.');
        }
    });
});