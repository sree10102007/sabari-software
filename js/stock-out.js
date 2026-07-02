document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('out-date').valueAsDate = new Date();

  

  const showToast = (msg, type = 'success') => {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = `notification show ${type}`;
    setTimeout(() => { t.className = 'notification'; }, 4000);
  };

  

  let materials = [];
  let currentReceiptId = null;
  let currentReceiptNumber = '';
  let currentPhone = '';
  let currentReceiptData = null;
  let currentPdfPath = '';

  async function loadMaterials() {
    materials = await window.api.getMaterials();
    const sel = document.getElementById('out-material');
    sel.innerHTML = '<option value="">-- Select Material --</option>';
    materials.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.unit}) — Stock: ${m.current_stock}`;
      opt.dataset.stock = m.current_stock;
      opt.dataset.unit = m.unit;
      opt.dataset.rate = m.rate || 0;
      sel.appendChild(opt);
    });
  }

  async function loadCustomers() {
    try {
      const customers = await window.api.getCustomers();
      const dl = document.getElementById('existing-customers');
      dl.innerHTML = '';
      customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.dataset.phone = c.phone;
        opt.dataset.address = c.address;
        opt.dataset.customerType = c.customer_type || '';
        dl.appendChild(opt);
      });
    } catch {}
  }

  // Auto-fill customer details
  document.getElementById('out-cust-name').addEventListener('change', (e) => {
    const dl = document.getElementById('existing-customers');
    const match = Array.from(dl.options).find(o => o.value === e.target.value);
    if (match) {
      document.getElementById('out-cust-phone').value = match.dataset.phone || '';
      document.getElementById('out-cust-address').value = match.dataset.address || '';
      // Auto-fill customer type if available
      if (match.dataset.customerType) {
        const typeSelect = document.getElementById('out-customer-type');
        const existing = Array.from(typeSelect.options).find(o => o.value === match.dataset.customerType);
        if (existing) typeSelect.value = match.dataset.customerType;
      }
    }
  });

  // Material select → show available stock + auto-fill rate
  document.getElementById('out-material').addEventListener('change', (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    if (opt.value) {
      const stock = parseFloat(opt.dataset.stock);
      const unit = opt.dataset.unit;
      const stockBox = document.getElementById('avail-stock-box');
      stockBox.textContent = `${stock} ${unit}`;
      stockBox.style.color = stock <= 0 ? 'var(--danger-color)' : 'var(--success-color)';
      // Auto-fill rate from material
      const rate = parseFloat(opt.dataset.rate) || 0;
      if (rate > 0) {
        document.getElementById('out-rate').value = rate.toFixed(2);
        calculateAmounts();
      }
    } else {
      document.getElementById('avail-stock-box').textContent = '—';
      document.getElementById('avail-stock-box').style.color = 'var(--text-muted)';
    }
  });

  // Auto-calculate amounts
  function calculateAmounts() {
    const qty = parseFloat(document.getElementById('out-qty').value) || 0;
    const rate = parseFloat(document.getElementById('out-rate').value) || 0;
    const total = qty * rate;
    document.getElementById('out-total').value = total.toFixed(2);
    validateAndCalculateBalance();
  }

  // Validate paid amount and calculate balance
  function validateAndCalculateBalance() {
    const total = parseFloat(document.getElementById('out-total').value) || 0;
    const paid = parseFloat(document.getElementById('out-paid').value) || 0;
    const paidInput = document.getElementById('out-paid');
    const paidErrorEl = document.getElementById('paid-amount-error');
    const submitBtn = document.getElementById('btn-submit-stock-out');

    if (paid > total && total > 0) {
      // Show error
      paidInput.classList.add('field-error');
      if (paidErrorEl) { paidErrorEl.classList.add('show'); }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }
      document.getElementById('out-balance').value = '';
      document.getElementById('out-balance').style.color = 'var(--text-muted)';
    } else {
      // Clear error
      paidInput.classList.remove('field-error');
      if (paidErrorEl) { paidErrorEl.classList.remove('show'); }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
      const balance = total - paid;
      document.getElementById('out-balance').value = balance.toFixed(2);
      document.getElementById('out-balance').style.color = balance > 0 ? 'var(--danger-color)' : 'var(--success-color)';
    }
  }

  document.getElementById('out-qty').addEventListener('input', calculateAmounts);
  document.getElementById('out-rate').addEventListener('input', calculateAmounts);
  document.getElementById('out-paid').addEventListener('input', validateAndCalculateBalance);

  async function loadRecentStockOut() {
    try {
      const movements = await window.api.getStockMovements();
      const outMovements = movements.filter(m =>
        ['Customer Sale','Direct Sale','Stock Out','Site Usage','Damaged Stock','Adjustment','Retailer','Engineer'].includes(m.movement_type)
        || (m.stock_direction === 'OUT')
      );
      const tbody = document.getElementById('recent-stock-out-body');
      tbody.innerHTML = '';
      if (!outMovements.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No sales recorded yet.</td></tr>';
        return;
      }
      outMovements.slice(0, 15).forEach(m => {
        tbody.innerHTML += `
        <tr>
        <td style="font-size:12px;">${new Date(m.created_at).toLocaleDateString('en-IN')}</td>
        <td><strong>${escapeHtml(m.material_name)}</strong></td>
        <td style="color:var(--danger-color);font-weight:600;">-${m.quantity} ${escapeHtml(m.material_unit)}</td>
        <td style="font-size:12px;">${escapeHtml(m.customer_name || '-')}</td>
        <td style="font-size:12px;">₹${parseFloat(m.total_amount || 0).toFixed(2)}</td>
        </tr>`;
      });
    } catch (err) { console.error(err); }
  }

  // Helper: show form alert
  function showAlert(msg) {
    const alertEl = document.getElementById('out-alert');
    alertEl.textContent = msg;
    alertEl.style.display = 'block';
    alertEl.style.background = 'var(--danger-bg)';
    alertEl.style.color = 'var(--danger-color)';
    alertEl.style.border = '1px solid rgba(198,40,40,0.3)';
  }

  // Form submit
  document.getElementById('stock-out-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('out-alert').style.display = 'none';

    const material_id = parseInt(document.getElementById('out-material').value);
    const quantity = parseFloat(document.getElementById('out-qty').value);
    const customer_name = document.getElementById('out-cust-name').value.trim();
    const customer_phone = document.getElementById('out-cust-phone').value.trim();
    const customer_address = document.getElementById('out-cust-address').value.trim();
    const customer_type = document.getElementById('out-customer-type').value;
    const rate = parseFloat(document.getElementById('out-rate').value) || 0;
    const total_amount = parseFloat(document.getElementById('out-total').value) || 0;
    const paid_amount = parseFloat(document.getElementById('out-paid').value) || 0;
    const balance_amount = parseFloat(document.getElementById('out-balance').value) || 0;
    const date = document.getElementById('out-date').value;
    const remarks = document.getElementById('out-remarks').value.trim();

    if (!material_id) return showAlert('Please select a material.');
    if (!quantity || quantity <= 0) return showAlert('Please enter a valid quantity.');
    if (!customer_name) return showAlert('Customer name is required.');
    if (!customer_type) return showAlert('Please select a customer type (Retailer or Engineer).');

    // Strict paid amount validation
    if (paid_amount < 0) return showAlert('Paid amount cannot be negative.');
    if (total_amount > 0 && paid_amount > total_amount) {
      return showAlert('Paid amount cannot exceed total amount.');
    }
    if (balance_amount < 0) return showAlert('Balance amount cannot be negative. Please check paid amount.');

    // Validate phone if provided
    if (customer_phone && !/^[+\d\s\-()]{7,15}$/.test(customer_phone)) {
      return showAlert('Please enter a valid phone number.');
    }

    const result = await window.api.stockOut({
      material_id, quantity, customer_name, customer_phone, customer_address,
      customer_type, rate, total_amount, paid_amount, balance_amount, remarks, date
    });

    if (result.success) {
      currentReceiptId = result.receiptId;
      currentReceiptNumber = result.receiptNumber;
      currentPhone = customer_phone;
      currentReceiptData = { material_id, quantity, customer_name, customer_phone, total_amount, paid_amount, balance_amount };
      currentPdfPath = '';

      document.getElementById('receipt-num-display').textContent = `Receipt: ${currentReceiptNumber}`;
      document.getElementById('pdf-path-display').style.display = 'none';
      document.getElementById('receipt-modal').style.display = 'flex';

      // Do NOT auto-download PDF. PDF is generated only when user clicks View/Download buttons.
      showToast('Sale completed successfully. Receipt generated.', 'success');

      e.target.reset();
      document.getElementById('out-date').valueAsDate = new Date();
      document.getElementById('avail-stock-box').textContent = '—';
      document.getElementById('avail-stock-box').style.color = 'var(--text-muted)';
      // Reset error states
      document.getElementById('out-paid').classList.remove('field-error');
      const paidErrorEl = document.getElementById('paid-amount-error');
      if (paidErrorEl) paidErrorEl.classList.remove('show');
      const submitBtn = document.getElementById('btn-submit-stock-out');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }

      loadMaterials();
      loadRecentStockOut();
    } else {
      showAlert(result.error || 'Failed to process stock out.');
    }
  });

  // Helper: ensure PDF exists (generate if needed), return path or null
  async function ensurePdf() {
    if (currentPdfPath) {
      // check if file still exists
      const exists = await window.api.fileExists(currentPdfPath).catch(() => false);
      if (exists) return currentPdfPath;
    }
    showToast('Generating PDF receipt...', 'pending');
    const pdfRes = await window.api.generatePDF({ receiptId: currentReceiptId });
    if (pdfRes.success) {
      currentPdfPath = pdfRes.filePath;
      return currentPdfPath;
    } else {
      showToast('Failed to generate PDF: ' + pdfRes.error, 'error');
      return null;
    }
  }

  // View Receipt PDF
  document.getElementById('btn-view-receipt').addEventListener('click', async () => {
    if (!currentReceiptId) return;
    const pdfPath = await ensurePdf();
    if (!pdfPath) return;
    const openRes = await window.api.openPath(pdfPath);
    if (!openRes.success) {
      showToast('Could not open PDF: ' + openRes.error, 'error');
    }
  });

  // Download PDF — manual trigger only
  const downloadBtn = document.getElementById('btn-download-receipt-pdf');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (!currentReceiptId) return;
      const pdfPath = await ensurePdf();
      if (!pdfPath) return;
      // Show path info
      const pathDisplay = document.getElementById('pdf-path-display');
      pathDisplay.style.display = 'block';
      pathDisplay.innerHTML = `
      <strong>PDF Saved:</strong><br>
      <span style="word-break:break-all;">${pdfPath}</span><br>
      <button id="btn-open-pdf-directly" style="margin-top:8px;padding:4px 10px;background:var(--primary-color);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Open PDF</button>
      `;
      document.getElementById('btn-open-pdf-directly').addEventListener('click', () => {
        window.api.openPath(pdfPath);
      });
      showToast('PDF ready! Click "Open PDF" to view.', 'success');
    });
  }

  // WhatsApp
  document.getElementById('btn-whatsapp').addEventListener('click', async () => {
    if (!currentReceiptId) return;

    const pdfPath = await ensurePdf();
    if (!pdfPath) return;

    // Open PDF automatically so user can attach it
    await window.api.openPath(pdfPath);

    const { material_id, quantity, customer_name, customer_phone, total_amount, paid_amount, balance_amount } = currentReceiptData;
    const mat = materials.find(m => m.id === material_id);
    const materialName = mat ? mat.name : 'Material';
    const unit = mat ? mat.unit : '';
    const settings = await window.api.getCompanySettings();
    const companyName = (settings && settings.company_name) ? settings.company_name : 'Sivakami Traders';

    const msg = `*${companyName}*\n*Receipt No:* ${currentReceiptNumber}\n*Customer:* ${customer_name}\n*Item:* ${materialName}\n*Quantity:* ${quantity} ${unit}\n*Total:* ₹${parseFloat(total_amount).toFixed(2)}\n*Paid:* ₹${parseFloat(paid_amount).toFixed(2)}\n*Balance:* ₹${parseFloat(balance_amount).toFixed(2)}\n\nThank you for doing business with ${companyName}.\nThe receipt PDF is ready for attachment.`;

    let phone = (customer_phone || '').replace(/[\s\+\(\)\-\[\]]/g, '');
    let formattedPhone = '';
    if (phone.length === 10 && /^\d+$/.test(phone)) {
      formattedPhone = '91' + phone;
    } else if (phone.length === 12 && phone.startsWith('91') && /^\d+$/.test(phone)) {
      formattedPhone = phone;
    }

    if (!formattedPhone) {
      showToast('Customer phone number is required to send WhatsApp message.', 'error');
      return;
    }

    showToast('Opening WhatsApp and preparing PDF to auto-send...', 'pending');
    await window.api.whatsappSendPDF({ phone: formattedPhone, filePath: pdfPath });
    await window.api.markWhatsappSent(currentReceiptId);
  });

  function closeReceiptModal() {
    document.getElementById('receipt-modal').style.display = 'none';
    currentReceiptId = null;
    currentReceiptNumber = '';
    currentPhone = '';
    currentReceiptData = null;
    currentPdfPath = '';
  }

  const closeReceiptBtnTop = document.getElementById('btn-close-receipt-modal');
  if (closeReceiptBtnTop) closeReceiptBtnTop.addEventListener('click', closeReceiptModal);

  const closeReceiptBtnBottom = document.getElementById('btn-close-receipt-modal-bottom');
  if (closeReceiptBtnBottom) closeReceiptBtnBottom.addEventListener('click', closeReceiptModal);

  const viewAllReceiptsBtn = document.getElementById('btn-view-all-receipts');
  if (viewAllReceiptsBtn) {
    viewAllReceiptsBtn.addEventListener('click', () => {
      window.location.href = 'receipts.html';
    });
  }

  loadMaterials();
  loadCustomers();
  loadRecentStockOut();
});
