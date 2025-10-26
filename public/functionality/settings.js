// File: public/js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // Find the password form on the page
    const passwordForm = document.querySelector('form[action="/settings/password"]');

    // CRITICAL FIX: Only run the code if the password form exists on this page
    if (passwordForm) {
        
        passwordForm.addEventListener('submit', function(e) {
            const newPass = document.getElementById('new_password').value;
            const confirmPass = document.getElementById('confirm_new_password').value;

            // Check if a new password was entered and if it doesn't match the confirmation
            if (newPass && newPass !== confirmPass) {
                e.preventDefault(); // Stop the form from submitting
                alert('Error: New Password and Confirm New Password fields do not match.');
            }
        });
    }
});