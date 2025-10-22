document.addEventListener('DOMContentLoaded', () => {
    // --- Animate Number Counting Function (Keep this if you use counters) ---
    const animateCount = (element) => {
        const fullTargetValue = parseFloat(element.getAttribute('data-target-value'));
        const targetValue = Math.floor(fullTargetValue);
        const duration = 1500;
        let startTime = null;
        const prefix = element.getAttribute('data-prefix') || '';
        const suffix = element.getAttribute('data-suffix') || '';
        const isDecimal = element.classList.contains('currency-counter');
        const finalTargetValue = isDecimal ? targetValue : Math.floor(targetValue); // Use floor for non-decimal

        element.textContent = prefix + '0' + suffix; // Set initial text

        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);
            let currentValue = isDecimal ? (percentage * finalTargetValue) : Math.floor(percentage * finalTargetValue);

            element.textContent = prefix + (isDecimal ? currentValue.toFixed(2) : currentValue) + suffix;

            if (percentage < 1) {
                window.requestAnimationFrame(step);
            } else {
                element.textContent = prefix + (isDecimal ? fullTargetValue.toFixed(2) : Math.floor(fullTargetValue)) + suffix; // Use full value at the end
            }
        };
        window.requestAnimationFrame(step);
    };
    // --------------------------------------------------------------------


    // --- Intersection Observer Logic (This handles AOS) ---
    if ('IntersectionObserver' in window) {
        
        const observerOptions = {
            root: null, // relative to the viewport
            rootMargin: '0px',
            threshold: 0.15 // trigger when 15% of the item is visible
        };

        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // 1. Add 'is-visible' for general AOS animations
                    entry.target.classList.add('is-visible');
                    
                    // 2. If it's a counter, trigger the counting animation
                    if (entry.target.classList.contains('animate-counter')) {
                        animateCount(entry.target);
                    }
                    
                    // 3. Stop observing once animated
                    observer.unobserve(entry.target);
                }
            });
        };

        // Initialize the observer
        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Find all elements that need scroll animation (general AOS or counters)
        const elementsToAnimate = document.querySelectorAll('.animate-on-scroll, .animate-counter');

        // Start observing each element
        elementsToAnimate.forEach(element => {
            observer.observe(element);
        });

    } else {
        // Fallback for older browsers (just show everything immediately)
        document.querySelectorAll('.animate-on-scroll, .animate-counter').forEach(el => {
            el.classList.add('is-visible');
            // Also set final counter value in fallback
            if (el.classList.contains('animate-counter')) {
                 const targetValue = el.getAttribute('data-target-value');
                 const prefix = el.getAttribute('data-prefix') || '';
                 const suffix = el.getAttribute('data-suffix') || '';
                 el.textContent = prefix + targetValue + suffix;
            }
        });
    }
});