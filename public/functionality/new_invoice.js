document.addEventListener('DOMContentLoaded', function() {
    const serviceItemsContainer = document.getElementById('service-items');
    const addItemBtn = document.getElementById('add-item-btn');
    const totalDisplay = document.getElementById('estimated-total');

     // --- Template for a new row ---
    const newItemTemplate = `
    <div class="row g-3 item-row mb-3">
    <div class="col-md-6">
        <label class="form-label">Service*</label>
                        <select name="service_ids[]" class="form-select service-select form-control" required>
                            <option value="" disabled selected>Select Service</option>
                            <% services.forEach(service => { %>
                                <option value="<%= service.service_id %>" data-cost="<%= service.cost %>">
                                    <%= service.service_name %> ($<%= service.cost %>)
                                </option>
                            <% }); %>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Quantity*</label>
                        <input name="quantities[]" type="number" class="form-control quantity-input" value="1" min="1" required>
                    </div>
                    <div class="col-md-2 d-flex align-items-end">
                        <button type="button" class="btn btn-danger btn-block remove-item-btn w-100"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            // -----------------------------

            function updateEventListeners() {
                // Attach event listener for removing an item
                document.querySelectorAll('.remove-item-btn').forEach(btn => {
                    btn.onclick = function() {
                        if (serviceItemsContainer.children.length > 1) {
                            this.closest('.item-row').remove();
                            calculateTotal();
                        } else {
                            alert("You must include at least one service item.");
                        }
                    };
                });
                
                // Attach change/input listener for calculating total
                document.querySelectorAll('.service-select, .quantity-input').forEach(input => {
                    input.onchange = calculateTotal;
                    input.oninput = calculateTotal; // For live quantity updates
                });
            }

            function calculateTotal() {
                let total = 0;
                serviceItemsContainer.querySelectorAll('.item-row').forEach(row => {
                    const select = row.querySelector('.service-select');
                    const quantityInput = row.querySelector('.quantity-input');
                    
                    if (select && quantityInput) {
                        const selectedOption = select.options[select.selectedIndex];
                        const cost = parseFloat(selectedOption.getAttribute('data-cost')) || 0;
                        const quantity = parseInt(quantityInput.value) || 0;
                        
                        total += cost * quantity;
                    }
                });
                totalDisplay.textContent = `$${total.toFixed(2)}`;
            }

            // --- Initial Setup ---
            updateEventListeners();
            calculateTotal(); // Calculate initial cost
            
            // --- Add Item Button Handler ---
            addItemBtn.onclick = function() {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newItemTemplate.trim();
                serviceItemsContainer.appendChild(tempDiv.firstChild);
                updateEventListeners();
                calculateTotal();
            };
});