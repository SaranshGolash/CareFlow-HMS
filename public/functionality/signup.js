(
    function () {
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
        const p = pw.value || '';
        const c = cpw.value || '';
        const s = scorePassword(p);

        // strength bar
        const pct = Math.round((s / 5) * 100);
        strengthBar.style.width = pct + '%';
        if (s <= 1) strengthBar.style.background = '#dc3545';
        else if (s <= 3) strengthBar.style.background = '#f0ad4e';
        else strengthBar.style.background = '#28a745';

        if (!p && !c) {
            note.textContent = '';
            btn.disabled = true;
            return;
        }

        if (p.length < 6) {
            note.textContent = 'Password must be at least 6 characters.';
            btn.disabled = true;
            return;
        }

        if (c && p !== c) {
            note.textContent = 'Passwords do not match.';
            btn.disabled = true;
            return;
        }

        note.textContent = 'Passwords look good.';
        btn.disabled = false;
    }

    document.addEventListener('input', updateUI);

    // show / hide password toggles
    function toggle(id, btnId) {
        const input = document.getElementById(id);
        const t = document.getElementById(btnId);
        t.addEventListener('click', function () {
            const isPwd = input.type === 'password';
            input.type = isPwd ? 'text' : 'password';
            t.textContent = isPwd ? 'Hide' : 'Show';
            t.setAttribute('aria-pressed', String(!isPwd));
        });
    }
    toggle('password', 'togglePwd');
    toggle('confirmPassword', 'toggleCpwd');

    // prevent double submit and show simple spinner text
    signupForm.addEventListener('submit', function (e) {
        if (btn.disabled) {
            e.preventDefault();
            return;
        }
        btn.disabled = true;
        const text = document.getElementById('signupBtnText');
        text.textContent = 'Creating…';
    });

    // init
    updateUI();
})();