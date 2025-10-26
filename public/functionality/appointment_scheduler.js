document.addEventListener('DOMContentLoaded', () => {
    const doctorSelect = document.getElementById('doctor_id');
    const dateInput = document.getElementById('appointment_date');
    const timeInput = document.getElementById('appointment_time');

    if (!doctorSelect || !dateInput || !timeInput) {
        console.error("Scheduler script: Missing one or more form elements (doctor, date, or time).");
        return;
    }

    let doctorSchedule = {}; // Stores the fetched schedule

    // --- Resets and validates the time input ---
    function validateDateTime() {
        timeInput.value = ""; // Clear any previous time
        
        // 1. Get selected day
        if (!dateInput.value || !doctorSelect.value) {
            timeInput.disabled = true; 
            return;
        }
        
        const selectedDate = new Date(dateInput.value + "T00:00:00");
        const dayOfWeek = selectedDate.getDay(); // 0=Sunday, 1=Monday...

        // 2. Find the schedule slot for that day
        const slot = doctorSchedule[dayOfWeek];

        if (slot) {
            // 3. Enable time input and set min/max
            timeInput.disabled = false;
            timeInput.min = slot.start_time;
            timeInput.max = slot.end_time;
            
            // Clear previous errors
            dateInput.setCustomValidity("");
            timeInput.setCustomValidity("");
            console.log(`Schedule for ${dayOfWeek}: Available ${slot.start_time} to ${slot.end_time}`);

        } else {
            // 4. Disable time input and set date error
            timeInput.disabled = true;
            dateInput.setCustomValidity("The selected doctor is not available on this day. Please pick another day.");
            dateInput.reportValidity(); // Show the error on the date field
        }
    }

    // --- Fetches schedule when doctor changes ---
    doctorSelect.addEventListener('change', async () => {
        const doctorId = doctorSelect.value;
        if (!doctorId) {
            doctorSchedule = {};
            validateDateTime(); // Re-run validation (will disable time)
            return;
        }

        try {
            const response = await fetch(`/api/doctor-availability/${doctorId}`);
            if (!response.ok) throw new Error('Failed to fetch schedule');
            
            const schedule = await response.json();
            
            // Re-format schedule into an easy-to-use object {1: {start, end}, 2: {start, end}}
            doctorSchedule = schedule.reduce((acc, slot) => {
                acc[slot.day_of_week] = { start: slot.start_time, end: slot.end_time };
                return acc;
            }, {});
            
            // Re-validate the date, which will in turn validate the time
            validateDateTime();

        } catch (err) {
            console.error(err);
            doctorSchedule = {};
            validateDateTime();
        }
    });

    // --- Validate time when date changes ---
    dateInput.addEventListener('change', validateDateTime);
    
    // --- Final check on the time input itself for a clearer message ---
    timeInput.addEventListener('input', () => {
        if (!timeInput.value) return;

        if (timeInput.validity.rangeUnderflow) {
            timeInput.setCustomValidity(`The earliest available time on this day is ${new Date('1970-01-01T' + timeInput.min).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
        } else if (timeInput.validity.rangeOverflow) {
            timeInput.setCustomValidity(`The latest available time on this day is ${new Date('1970-01-01T' + timeInput.max).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
        } else {
            timeInput.setCustomValidity("");
        }
        timeInput.reportValidity();
    });
});