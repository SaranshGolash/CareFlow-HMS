document.addEventListener('DOMContentLoaded', function() {
        // Check if the splash screen has been shown during this session
        if (!sessionStorage.getItem('splashShown')) {
            const splashModal = new bootstrap.Modal(document.getElementById('demoSplashModal'));
            
            // Show the modal after a short delay
            setTimeout(() => {
                splashModal.show();
            }, 1000); // 1-second delay

            // Set a flag in sessionStorage so it doesn't show again
            sessionStorage.setItem('splashShown', 'true');
        }
    });