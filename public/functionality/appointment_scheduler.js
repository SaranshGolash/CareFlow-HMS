document.addEventListener('DOMContentLoaded', () => {
    const doctorSelect = document.getElementById('doctor_id');
    const dateInput = document.getElementById('appointment_date');
    const timeInput = document.getElementById('appointment_time');

    if (!doctorSelect || !dateInput || !timeInput) return;

    let doctorSchedule = {};

    // 1. Fetch the selected doctor's schedule
    doctorSelect.addEventListener('change', async () => {
        const doctorId = doctorSelect.value;
        if (!doctorId) {
            doctorSchedule = {};
            return;
        }

        try {
            const response = await fetch(`/api/doctor-availability/${doctorId}`);
            if (!response.ok) throw new Error('Failed to fetch schedule');
            
            const schedule = await response.json();
            
            // Re-format schedule into an easy-to-use object
            doctorSchedule = schedule.reduce((acc, slot) => {
                acc[slot.day_of_week] = { start: slot.start_time, end: slot.end_time };
                return acc;
            }, {});
            
            // Re-validate the selected date, as the doctor just changed
            validateDate();

        } catch (err) {
            console.error(err);
            doctorSchedule = {};
        }
    });

    // 2. Validate the date input based on the schedule
    function validateDate() {
        if (!dateInput.value) return; // Don't validate if no date is selected
        
        const selectedDate = new Date(dateInput.value + "T00:00:00");
        const dayOfWeek = selectedDate.getDay(); // 0=Sunday, 1=Monday...

        const slot = doctorSchedule[dayOfWeek];

        if (slot) {
            // Day is valid, now set the min/max time for the time input
            timeInput.min = slot.start_time;
            timeInput.max = slot.end_time;
            timeInput.disabled = false;
            dateInput.setCustomValidity(""); // Clear any previous error
        } else {
            // Day is invalid
            timeInput.value = "";
            timeInput.disabled = true;
            dateInput.setCustomValidity("The selected doctor is not available on this day.");
            dateInput.reportValidity();
        }
    }

    dateInput.addEventListener('change', validateDate);
});