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
        const pw = document.getElementById('password');
        const strengthBar = document.getElementById('pwStrength');

        function scorePassword(s) {
            let score = 0;
            if (!s) return score;
            if (s.length >= 6) score += 1;
            if (s.length >= 10) score += 1;
            if (/[A-Z]/.test(s)) score += 1;
            if (/[0-9]/.test(s)) score += 1;
            if (/[^A-Za-z0-9]/.test(s)) score += 1;
            return score; // 0-5
        }

        function updateUI() {
            const p = pw ? pw.value : '';
            const s = scorePassword(p);

            if (strengthBar) {
                // Calculate percentage width
                const pct = Math.round((s / 5) * 100);
                strengthBar.style.width = pct + '%'; // Update width

                // Update background color based on score
                if (s <= 1) {
                    strengthBar.style.background = '#dc3545'; // Bootstrap Danger (Red)
                } else if (s <= 3) {
                    strengthBar.style.background = '#ffc107'; // Bootstrap Warning (Yellow)
                } else {
                    strengthBar.style.background = '#198754'; // Bootstrap Success (Green)
                }
            }
        }

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

        function initToggleButtons() {
            const toggles = document.querySelectorAll('.pw-toggle-icon');
            toggles.forEach(t => {
                const targetId = t.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (!input) return;

                t.addEventListener('click', function (e) {
                    e.preventDefault();
                    const isHidden = input.type === 'password';
                    input.type = isHidden ? 'text' : 'password';
                    t.classList.toggle('showing', isHidden);
                    t.setAttribute('aria-pressed', String(isHidden));
                });
            });
        }
        initToggleButtons();

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
        pw.addEventListener('input', updateUI);

        // Initial call to set the state when the page loads
        updateUI();
    });