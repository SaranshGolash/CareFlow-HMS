document.addEventListener('DOMContentLoaded', () => {
    const doctorSelect = document.getElementById('doctor_id');
    const dateInput = document.getElementById('appointment_date');
    const timeSelect = document.getElementById('appointment_time');

    if (!doctorSelect || !dateInput || !timeSelect) {
        console.error("Scheduler script: Missing form elements.");
        return;
    }

    async function updateAvailableSlots() {
        const doctorId = doctorSelect.value;
        const selectedDate = dateInput.value;

        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="" selected>Loading...</option>';

        if (!doctorId || !selectedDate) {
            if (!doctorId) timeSelect.options[0].textContent = 'Select a doctor';
            else timeSelect.options[0].textContent = 'Select a date';
            return;
        }
        
        console.log(`Fetching slots for Doctor ID: ${doctorId} on Date: ${selectedDate}`);

        try {
            const response = await fetch(`/api/doctor-slots/${doctorId}/${selectedDate}`);
            
            if (!response.ok) {
                // This is what's happening now: response.ok is false due to 500 error
                throw new Error('Network error while fetching slots.');
            }

            const availableSlots = await response.json();
            
            timeSelect.innerHTML = ''; // Clear loading message

            if (availableSlots.length > 0) {
                timeSelect.disabled = false;
                timeSelect.innerHTML = '<option value="" disabled selected>Select an available time</option>';
                
                availableSlots.forEach(slot => {
                    const displayTime = new Date(`1970-01-01T${slot}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const option = document.createElement('option');
                    option.value = slot;
                    option.textContent = displayTime;
                    timeSelect.appendChild(option);
                });
            } else {
                timeSelect.disabled = true;
                timeSelect.innerHTML = '<option value="" disabled selected>No available slots on this day</option>';
            }

        } catch (err) {
            console.error(err);
            timeSelect.disabled = true;
            timeSelect.innerHTML = '<option value="" disabled selected>Error loading slots</option>';
        }
    }

    doctorSelect.addEventListener('change', updateAvailableSlots);
    dateInput.addEventListener('change', updateAvailableSlots);
});