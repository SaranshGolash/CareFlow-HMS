document.addEventListener('DOMContentLoaded', () => {
    // --- New Function: Animate Number Counting ---
    const animateCount = (element) => {
    // Read the integer part for counting, but store the final float value
    const fullTargetValue = parseFloat(element.getAttribute('data-target-value'));
    const targetValue = Math.floor(fullTargetValue); // Use integer part for rapid counting
    const duration = 1500;
    let startValue = 0;
    let startTime = null;
    const prefix = element.getAttribute('data-prefix') || '';
    const suffix = element.getAttribute('data-suffix') || '';

    const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percentage = Math.min(progress / duration, 1);

        // Calculate the current *integer* value
        const currentValue = Math.floor(percentage * targetValue);

        // Display the current integer value + prefix/suffix during animation
        element.textContent = prefix + currentValue + suffix;

        if (percentage < 1) {
            window.requestAnimationFrame(step);
        } else {
            // CRITICAL: Display the full, precise final value
            element.textContent = prefix + fullTargetValue.toFixed(2);
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