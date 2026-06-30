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
    const paid = parseFloat(document.getElementById('out-paid').value) || 0;
    const balance = total - paid;
    document.getElementById('out-balance').value = balance.toFixed(2);
    document.getElementById('out-balance').style.color = balance > 0 ? 'var(--danger-color)' : 'var(--success-color)';
  }

  document.getElementById('out-qty').addEventListener('input', calculateAmounts);
  document.getElementById('out-rate').addEventListener('input', calculateAmounts);
  document.getElementById('out-paid').addEventListener('input', () => {
    const total = parseFloat(document.getElementById('out-total').value) || 0;
    const paid = parseFloat(document.getElementById('out-paid').value) || 0;
    const balance = total - paid;
    document.getElementById('out-balance').value = balance.toFixed(2);
    document.getElementById('out-balance').style.color = balance > 0 ? 'var(--danger-color)' : 'var(--success-color)';
  });

  async function loadRecentStockOut() {
    try {
      const movements = await window.api.getStockMovements();
      const outMovements = movements.filter(m =>
        ['Customer Sale','Direct Sale','Stock Out','Site Usage','Damaged Stock','Adjustment'].includes(m.movement_type)
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

  // Form submit
  document.getElementById('stock-out-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('out-alert').style.display = 'none';

    const material_id = parseInt(document.getElementById('out-material').value);
    const quantity = parseFloat(document.getElementById('out-qty').value);
    const customer_name = document.getElementById('out-cust-name').value.trim();
    const customer_phone = document.getElementById('out-cust-phone').value.trim();
    const customer_address = document.getElementById('out-cust-address').value.trim();
    const sale_type = document.getElementById('out-sale-type').value;
    const rate = parseFloat(document.getElementById('out-rate').value) || 0;
    const total_amount = parseFloat(document.getElementById('out-total').value) || 0;
    const paid_amount = parseFloat(document.getElementById('out-paid').value) || 0;
    const balance_amount = parseFloat(document.getElementById('out-balance').value) || 0;
    const date = document.getElementById('out-date').value;
    const remarks = document.getElementById('out-remarks').value.trim();

    if (!material_id) return showAlert('Please select a material.');
    if (!quantity || quantity <= 0) return showAlert('Please enter a valid quantity.');
    if (!customer_name) return showAlert('Customer name is required.');

    // Validate phone if provided
    if (customer_phone && !/^[+\d\s\-()]{7,15}$/.test(customer_phone)) {
      return showAlert('Please enter a valid phone number.');
    }

    const result = await window.api.stockOut({
      material_id, quantity, customer_name, customer_phone, customer_address,
      sale_type, rate, total_amount, paid_amount, balance_amount, remarks, date
    });

    if (result.success) {
      currentReceiptId = result.receiptId;
      currentReceiptNumber = result.receiptNumber;
      currentPhone = customer_phone;
      currentReceiptData = { material_id, quantity, customer_name, customer_phone, total_amount, paid_amount, balance_amount };

      document.getElementById('receipt-num-display').textContent = `Receipt: ${currentReceiptNumber}`;
      document.getElementById('pdf-path-display').style.display = 'none';
      document.getElementById('receipt-modal').style.display = 'flex';

      // Auto-generate PDF receipt immediately
      showToast('Generating PDF receipt automatically...', 'pending');
      const pdfRes = await window.api.generatePDF({ receiptId: currentReceiptId });
      if (pdfRes.success) {
        currentPdfPath = pdfRes.filePath;
        showToast('✅ PDF receipt generated automatically!', 'success');
        const pathDisplay = document.getElementById('pdf-path-display');
        pathDisplay.style.display = 'block';
        pathDisplay.innerHTML = `
          <strong>📁 PDF Saved:</strong><br>
          <span style="word-break:break-all;">${pdfRes.filePath}</span><br>
          <button id="btn-open-pdf-directly" style="margin-top:8px;padding:4px 10px;background:var(--primary-color);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">👁️ Open PDF</button>
        `;
        document.getElementById('btn-open-pdf-directly').addEventListener('click', () => {
          window.api.openPath(currentPdfPath);
        });
      } else {
        showToast('⚠️ PDF auto-generation failed: ' + pdfRes.error, 'error');
      }

      e.target.reset();
      document.getElementById('out-date').valueAsDate = new Date();
      document.getElementById('avail-stock-box').textContent = '—';
      document.getElementById('avail-stock-box').style.color = 'var(--text-muted)';
      loadMaterials();
      loadRecentStockOut();
    } else {
      showAlert(result.error || 'Failed to process stock out.');
    }
  });

  // View Receipt PDF
  document.getElementById('btn-view-receipt').addEventListener('click', async () => {
    if (!currentReceiptId) return;
    if (!currentPdfPath) {
      showToast('Generating PDF receipt...', 'pending');
      const pdfRes = await window.api.generatePDF({ receiptId: currentReceiptId });
      if (pdfRes.success) {
        currentPdfPath = pdfRes.filePath;
      } else {
        showToast('Failed to generate PDF: ' + pdfRes.error, 'error');
        return;
      }
    }
    const openRes = await window.api.openPath(currentPdfPath);
    if (!openRes.success) {
      showToast('Could not open PDF: ' + openRes.error, 'error');
    }
  });

  // WhatsApp
  document.getElementById('btn-whatsapp').addEventListener('click', async () => {
    if (!currentReceiptId) return;

    if (!currentPdfPath) {
      showToast('Generating PDF receipt...', 'pending');
      const pdfRes = await window.api.generatePDF({ receiptId: currentReceiptId });
      if (pdfRes.success) {
        currentPdfPath = pdfRes.filePath;
      } else {
        showToast('Failed to generate PDF: ' + pdfRes.error, 'error');
        return;
      }
    }

    // Open PDF automatically
    await window.api.openPath(currentPdfPath);

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
    await window.api.whatsappSendPDF({ phone: formattedPhone, filePath: currentPdfPath });
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
