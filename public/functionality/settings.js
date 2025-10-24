document.addEventListener('DOMContentLoaded', () => {
            const passwordForm = document.querySelector('form[action="/settings/password"]');
            passwordForm.addEventListener('submit', function(e) {
                const newPass = document.getElementById('new_password').value;
                const confirmPass = document.getElementById('confirm_new_password').value;

                if (newPass && newPass !== confirmPass) {
                    e.preventDefault();
                    alert('Error: New Password and Confirm New Password fields do not match.');
                }
            });
});