    document.addEventListener('DOMContentLoaded', function() {
        console.log("Inline script on signup.ejs is running.");

        // --- Initialize EmailJS ---
        try {
            emailjs.init({
                publicKey: "yCJKnmiujlOeKNAtD", // <-- IMPORTANT: REPLACE THIS
            });
            console.log("EmailJS Initialized.");
        } catch(e) {
            console.error("Failed to initialize EmailJS:", e);
        }
        // ------------------------

        const signupForm = document.getElementById('signupForm');
        const signupBtn = document.getElementById('signupBtn');
        const signupUsername = document.getElementById('signupUsername');
        const signupEmail = document.getElementById('signupEmail');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const pwNote = document.getElementById('pwNote');
        
        if (!signupForm || !passwordInput || !confirmPasswordInput || !signupBtn) {
            console.error("One or more critical form elements are missing!");
            return;
        }

        // --- Validation Logic ---
        function updateValidation() {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (password.length > 0 && password.length < 6) {
                pwNote.textContent = 'Password must be at least 6 characters.';
                signupBtn.disabled = true;
            } else if (confirmPassword.length > 0 && password !== confirmPassword) {
                pwNote.textContent = 'Passwords do not match.';
                signupBtn.disabled = true;
            } else if (password.length >= 6 && password === confirmPassword) {
                pwNote.textContent = 'Passwords match.';
                signupBtn.disabled = false;
            } else {
                pwNote.textContent = '';
                signupBtn.disabled = true;
            }
        }

        passwordInput.addEventListener('input', updateValidation);
        confirmPasswordInput.addEventListener('input', updateValidation);

        // --- Email Sending Logic ---
        function sendWelcomeEmail() {
            const serviceID = 'service_p617k5f';   // <-- IMPORTANT: REPLACE THIS
            const templateID = 'template_fr6wcec'; // <-- IMPORTANT: REPLACE THIS

            const templateParams = {
                username: signupUsername.value,
                email: signupEmail.value,
            };

            // Check if emailjs object exists before sending
            if (typeof emailjs !== 'undefined') {
                emailjs.send(serviceID, templateID, templateParams)
                    .then(function(response) {
                       console.log('EmailJS SUCCESS!', response.status, response.text);
                    }, function(error) {
                       console.error('EmailJS FAILED...', error);
                    });
            } else {
                console.error("EmailJS library is not loaded. Cannot send email.");
            }
        }

        // --- Form Submission Handler ---
        signupForm.addEventListener('submit', function (e) {
            if (signupBtn.disabled) {
                e.preventDefault();
                return;
            }
            sendWelcomeEmail();
            signupBtn.disabled = true;
            document.getElementById('signupBtnText').textContent = 'Creating…';
        });

        updateValidation(); // Initial check
    });