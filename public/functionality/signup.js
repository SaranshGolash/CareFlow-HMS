// This file should be placed in public/js/signup.js
(function () {
    // Wait for the DOM to be fully loaded before running script
    document.addEventListener('DOMContentLoaded', function() {
        console.log('signup.js loaded and DOM ready');

        const pw = document.getElementById('password');
        const cpw = document.getElementById('confirmPassword');
        const note = document.getElementById('pwNote');
        const btn = document.getElementById('signupBtn');
        const signupForm = document.getElementById('signupForm');
        const strengthBar = document.getElementById('pwStrength');

        if (!pw || !cpw || !btn) {
            console.error('Signup form elements not found!');
            return;
        }

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
            const p = pw.value;
            const c = cpw.value;
            const s = scorePassword(p);

            if (strengthBar) {
                const pct = Math.round((s / 5) * 100);
                strengthBar.style.width = pct + '%';
                if (s <= 1) strengthBar.style.background = '#dc3545';
                else if (s <= 3) strengthBar.style.background = '#ffc107'; // Changed to Bootstrap warning color
                else strengthBar.style.background = '#198754'; // Changed to Bootstrap success color
            }
            
            let noteText = '';
            let btnDisabled = true;

            if (p.length > 0 && p.length < 6) {
                noteText = 'Password must be at least 6 characters.';
            } else if (c.length > 0 && p !== c) {
                noteText = 'Passwords do not match.';
            } else if (p.length >= 6 && c.length > 0 && p === c) {
                noteText = 'Passwords match and look good.';
                btnDisabled = false;
            } else {
                noteText = '';
            }

            if (note) note.textContent = noteText;
            if (btn) btn.disabled = btnDisabled;
        }
        
        // FIX: More efficient event listeners
        [pw, cpw].forEach(el => el.addEventListener('input', updateUI));

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

        if (signupForm && btn) {
            signupForm.addEventListener('submit', function (e) {
                if (btn.disabled) {
                    e.preventDefault();
                    return;
                }
                btn.disabled = true;
                const text = document.getElementById('signupBtnText');
                if (text) text.textContent = 'Creating…';
            });
        }
        
        updateUI(); // Initial check
    });
})();