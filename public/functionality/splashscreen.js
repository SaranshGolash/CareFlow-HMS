document.addEventListener('DOMContentLoaded', function() {
    // This code will only run AFTER the page has fully loaded

    const splashModalEl = document.getElementById('demoSplashModal');

    // Add a check to ensure the modal element exists on the page
    if (splashModalEl) {
        
        // Check if the splash screen has already been shown in this browser session
        if (!sessionStorage.getItem('splashShown')) {
            const splashModal = new bootstrap.Modal(splashModalEl);
            
            // Show the modal after a short delay
            setTimeout(() => {
                splashModal.show();
            }, 1000); // 1-second delay

            // Set a flag so it doesn't show again on refresh
            sessionStorage.setItem('splashShown', 'true');
        }

        // Accessibility fix: move focus back to the body when the modal is hidden
        splashModalEl.addEventListener('hidden.bs.modal', function () {
            document.body.focus();
        });
    }
});