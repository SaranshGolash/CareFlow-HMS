document.addEventListener('DOMContentLoaded', () => {
    // Check if the Intersection Observer is supported
    if ('IntersectionObserver' in window) {
        
        // Configuration for the observer
        const observerOptions = {
            root: null, // relative to the viewport
            rootMargin: '0px',
            threshold: 0.15 // trigger when 15% of the item is visible
        };

        // Callback function executed when elements enter or exit the viewport
        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Element is now visible, apply the animation trigger class
                    entry.target.classList.add('is-visible');
                    // Stop observing once visible to save performance
                    observer.unobserve(entry.target);
                }
            });
        };

        // Initialize the Intersection Observer
        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Find all elements marked for animation
        const animatedElements = document.querySelectorAll('.animate-on-scroll');

        // Start observing each element
        animatedElements.forEach(element => {
            observer.observe(element);
        });

    } else {
        // Fallback for older browsers: just show the content immediately
        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            el.classList.add('is-visible');
        });
    }
});