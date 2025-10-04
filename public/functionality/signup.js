(function () {
    console.log('signup.js loaded');

    const pw = document.getElementById('password');
    const cpw = document.getElementById('confirmPassword');
    const note = document.getElementById('pwNote');
    const btn = document.getElementById('signupBtn');
    const signupForm = document.getElementById('signupForm');
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
        const c = cpw ? cpw.value : '';
        const s = scorePassword(p);

        if (strengthBar) {
            const pct = Math.round((s / 5) * 100);
            strengthBar.style.width = pct + '%';
            if (s <= 1) strengthBar.style.background = '#dc3545';
            else if (s <= 3) strengthBar.style.background = '#f0ad4e';
            else strengthBar.style.background = '#28a745';
        }

        if (!p && !c) {
            if (note) note.textContent = '';
            if (btn) btn.disabled = true;
            return;
        }

        if (p.length < 6) {
            if (note) note.textContent = 'Password must be at least 6 characters.';
            if (btn) btn.disabled = true;
            return;
        }

        if (c && p !== c) {
            if (note) note.textContent = 'Passwords do not match.';
            if (btn) btn.disabled = true;
            return;
        }

        if (note) note.textContent = 'Passwords look good.';
        if (btn) btn.disabled = false;
    }

    document.addEventListener('input', updateUI);

    // toggle eye icon inside input
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

    // prevent double submit and show simple spinner text
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

    // init
    updateUI();
})();