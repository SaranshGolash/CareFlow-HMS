// File: public/js/gsap-init.js

document.addEventListener('DOMContentLoaded', () => {

    // 1. Register the ScrollTrigger plugin with GSAP
    gsap.registerPlugin(ScrollTrigger);

    // 2. Set the initial background color (matches your CSS)
    gsap.set('body', { backgroundColor: '#f8f9fa' }); 

    // 3. Find all sections on the page. We will animate based on them.
    const sections = document.querySelectorAll('section');

    // Define the colors for your sections
    // You can customize these!
    const sectionColors = [
        "#f8f9fa", // Light Grey (for Hero/Features)
        "#e7f1ff", // Your Primary-Light Blue (for Services Promo)
        "#ffffff", // White (for Stats)
        "#f8f9fa"  // Back to Light Grey (for CTA)
    ];

    // 4. Create the animation for each section
    sections.forEach((section, index) => {
        // Get the color for this section, or the last color if we run out
        const color = sectionColors[index] || sectionColors[sectionColors.length - 1];

        gsap.to('body', {
            backgroundColor: color,
            scrollTrigger: {
                trigger: section,
                start: 'top 25%',   // When the top of the section is 25% from the top of the viewport
                end: 'bottom 25%', // When the bottom of the section is 25% from the top
                scrub: 1, // Smoothly scrubs the animation (1 second lag)
                
                // This ensures the animation plays and reverses as you scroll up and down
                toggleActions: 'play reverse play reverse'
            }
        });
    });

});