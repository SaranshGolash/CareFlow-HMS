document.addEventListener('DOMContentLoaded', () => {
    // --- New Function: Animate Number Counting ---
    const animateCount = (element) => {
        const targetValue = parseInt(element.getAttribute('data-target-value'));
        const duration = 1500; // 1.5 seconds
        let startValue = 0;
        let startTime = null;

        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);

            // Calculate the current value using easing (optional, but smooth)
            const currentValue = Math.floor(percentage * targetValue);

            element.textContent = currentValue + (element.getAttribute('data-suffix') || '');

            if (percentage < 1) {
                window.requestAnimationFrame(step);
            } else {
                // Ensure final value is the exact target value
                element.textContent = targetValue + (element.getAttribute('data-suffix') || '');
            }
        };

        window.requestAnimationFrame(step);
    };
    // ---------------------------------------------


    if ('IntersectionObserver' in window) {
        
        const observerOptions = {
            root: null, // relative to the viewport
            rootMargin: '0px',
            threshold: 0.5 // Trigger when 50% of the item is visible
        };

        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // 1. Apply general visibility class
                    entry.target.classList.add('is-visible');
                    
                    // 2. CHECK: If the element is a counter, run the specific count animation
                    if (entry.target.classList.contains('animate-counter')) {
                        animateCount(entry.target);
                    }
                    
                    // 3. Stop observing once visible
                    observer.unobserve(entry.target);
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // We now observe both general animated elements and our new counters
        const animatedElements = document.querySelectorAll('.animate-on-scroll, .animate-counter');

        animatedElements.forEach(element => {
            observer.observe(element);
        });

    } else {
        // Fallback for older browsers: just show the content
        document.querySelectorAll('.animate-on-scroll, .animate-counter').forEach(el => {
            el.classList.add('is-visible');
        });
    }
});