document.addEventListener('DOMContentLoaded', function() {
    
    // Find all password toggle buttons on the page
    const toggleButtons = document.querySelectorAll('.pw-toggle-icon');

    toggleButtons.forEach(button => {
        
        button.addEventListener('click', function() {
            // Get the 'data-target' attribute from the button
            const targetId = this.getAttribute('data-target');
            if (!targetId) return; // Skip if the attribute is missing

            // Find the password input field using the targetId
            const passwordInput = document.getElementById(targetId);
            if (!passwordInput) return; // Skip if the input field isn't found

            // Check the current type of the input
            const isPassword = passwordInput.type === 'password';

            // Switch the type
            if (isPassword) {
                passwordInput.type = 'text';
                this.classList.add('showing'); // Add 'showing' class to the button
                this.setAttribute('aria-pressed', 'true');
            } else {
                passwordInput.type = 'password';
                this.classList.remove('showing'); // Remove 'showing' class
                this.setAttribute('aria-pressed', 'false');
            }
        });
    });
});