document.addEventListener('DOMContentLoaded', () => {
    const doctorSelect = document.getElementById('doctor_id');
    const dateInput = document.getElementById('appointment_date');
    const timeSelect = document.getElementById('appointment_time');

    if (!doctorSelect || !dateInput || !timeSelect) {
        console.error("Scheduler script: Missing form elements.");
        return;
    }

    // --- This function is called when either the doctor or date changes ---
    async function fetchAvailableSlots() {
        const doctorId = doctorSelect.value;
        const selectedDate = dateInput.value;

        // Reset the time select and disable it
        timeSelect.innerHTML = '<option value="" selected>Select a time</option>';
        timeSelect.disabled = true;

        // Stop if we don't have both values
        if (!doctorId || !selectedDate) {
            if (doctorId && !selectedDate) {
                timeSelect.options[0].textContent = 'Please select a date';
            } else if (!doctorId && selectedDate) {
                timeSelect.options[0].textContent = 'Please select a doctor';
            } else {
                 timeSelect.options[0].textContent = 'Select doctor & date';
            }
            return;
        }
        
        // Show a loading state
        timeSelect.options[0].textContent = 'Loading slots...';

        try {
            // 1. Call the new API route
            const response = await fetch(`/api/doctor-slots/${doctorId}/${selectedDate}`);
            
            if (!response.ok) {
                throw new Error('Network error while fetching slots.');
            }

            const availableSlots = await response.json(); // e.g., ["09:00:00", "09:30:00"]
            
            // 2. Clear the loading message
            timeSelect.innerHTML = ''; 

            // 3. Populate the dropdown with available slots
            if (availableSlots.length > 0) {
                timeSelect.disabled = false;
                timeSelect.innerHTML = '<option value="" disabled selected>Select an available time</option>'; // Add default first
                
                availableSlots.forEach(slot => {
                    // Format the time (e.g., 09:00:00) into a user-friendly format (e.g., 9:00 AM)
                    const displayTime = new Date(`1970-01-01T${slot}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const option = document.createElement('option');
                    option.value = slot; // The value sent to the backend is the raw '09:00:00'
                    option.textContent = displayTime; // The text the user sees is '9:00 AM'
                    timeSelect.appendChild(option);
                });
            } else {
                // No slots are available
                timeSelect.disabled = true;
                timeSelect.innerHTML = '<option value="" disabled selected>No available slots on this day</option>';
            }

        } catch (err) {
            console.error(err);
            timeSelect.disabled = true;
            timeSelect.innerHTML = '<option value="" disabled selected>Error loading slots</option>';
        }
    }

    // --- Add the event listeners ---
    doctorSelect.addEventListener('change', fetchAvailableSlots);
    dateInput.addEventListener('change', fetchAvailableSlots);
});