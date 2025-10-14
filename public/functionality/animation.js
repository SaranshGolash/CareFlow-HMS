document.addEventListener('DOMContentLoaded', () => {
    
    const animateCount = (element) => {
    const targetValue = parseFloat(element.getAttribute('data-target-value'));
    const duration = 1500; // Animation duration in milliseconds
    const prefix = element.getAttribute('data-prefix') || '';
    const suffix = element.getAttribute('data-suffix') || '';
    let startTime = null;

    // Set the initial text content with the suffix
    element.textContent = prefix + '0' + suffix;

    const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percentage = Math.min(progress / duration, 1);
        
        // Calculate the current value
        const currentValue = Math.floor(percentage * targetValue);

        // Update the text content during the animation
        element.textContent = prefix + currentValue + suffix;

        if (percentage < 1) {
            window.requestAnimationFrame(step);
        } else {
            // Ensure the final, exact value is displayed upon completion
            element.textContent = prefix + targetValue + suffix;
        }
    };

    // Start the animation
    window.requestAnimationFrame(step);
};
    // ---------------------------------------------


    if ('IntersectionObserver' in window) {
        
        const observerOptions = {
            root: null, 
            rootMargin: '0px',
            threshold: 0.5 
        };

        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    
                    if (entry.target.classList.contains('animate-counter')) {
                        animateCount(entry.target);
                    }
                    
                    observer.unobserve(entry.target);
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        const animatedElements = document.querySelectorAll('.animate-on-scroll, .animate-counter');

        animatedElements.forEach(element => {
            observer.observe(element);
        });

    } else {
        document.querySelectorAll('.animate-on-scroll, .animate-counter').forEach(el => {
            el.classList.add('is-visible');
            
            // Fallback for counters: set final value immediately
            if (el.classList.contains('animate-counter')) {
                 const targetValue = el.getAttribute('data-target-value');
                 const prefix = el.getAttribute('data-prefix') || '';
                 const suffix = el.getAttribute('data-suffix') || '';
                 el.textContent = prefix + targetValue + suffix;
            }
        });
    }
});