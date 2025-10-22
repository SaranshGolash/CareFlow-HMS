document.addEventListener('DOMContentLoaded', () => {
    // Check if VANTA and the WAVES effect are loaded
    if (window.VANTA && window.VANTA.WAVES) {
        // Find all elements with the 'vanta-waves-bg' class
        const vantaElements = document.querySelectorAll('.vanta-waves-bg');

        vantaElements.forEach(el => {
            VANTA.WAVES({
                el: el, // Pass the DOM element itself
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200.00,
                minWidth: 200.00,
                scale: 1.00,
                scaleMobile: 1.00,
                color: 0x0d6efd,        // Your primary blue
                backgroundColor: 0x6f42c1, // Your accent purple
                shininess: 50.00,
                waveHeight: 15.00,
                waveSpeed: 0.80,
                zoom: 0.90
            });
        });
    } else {
        console.warn("Vanta.js WAVES effect not loaded or VANTA object not found. Background animation will not run.");
        // Optional: Add a fallback CSS class if Vanta fails
        document.querySelectorAll('.vanta-waves-bg').forEach(el => {
            el.style.backgroundImage = 'linear-gradient(135deg, #0d6efd, #6f42c1)';
        });
    }
    // --- Initialize Vanta FOG for white backgrounds ---
    if (window.VANTA && window.VANTA.FOG) {
        const vantaFogElements = document.querySelectorAll('.vanta-fog-bg');
        vantaFogElements.forEach(el => {
            VANTA.FOG({
                el: el,
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200.00,
                minWidth: 200.00,
                
                // --- Subtle & Professional "Clinical Air" Colors ---
                highlightColor: 0xe7f1ff, // Your "primary-light" color
                midtoneColor: 0xb5d8ff,   // A light, airy sky blue
                lowlightColor: 0x0d6efd,    // Your primary blue
                baseColor: 0xffffff,       // White
                // ---------------------------------
                
                blurFactor: 0.60, // How much the fog blurs
                speed: 1.20,      // How fast it moves
                zoom: 0.80        // A slight zoom for depth
            });
        });
    } else {
        console.warn("Vanta.js FOG effect not loaded. White background animation will not run.");
        document.querySelectorAll('.vanta-fog-bg').forEach(el => {
            el.style.background = '#ffffff'; // Fallback
        });
    }
});