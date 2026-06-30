document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  let currentUser = null;
  try {
    currentUser = await window.api.getSession();
    if (!currentUser || currentUser.role !== 'admin') {
      window.location.href = 'login.html';
      return;
    }
    document.getElementById('user-display-name').textContent = currentUser.name;
  } catch (err) {
    console.error('Session validation error:', err);
    window.location.href = 'login.html';
    return;
  }

  // Logout handler
  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.api.logout();
    window.location.href = 'login.html';
  });

  // UI Toast helper
  const showToast = (message, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `notification show ${type}`;
    setTimeout(() => {
      toast.className = 'notification';
    }, 4000);
  };

  // References to elements
  const filterCust = document.getElementById('filter-cust');
  const filterFrom = document.getElementById('filter-from');
  const filterTo = document.getElementById('filter-to');
  const btnFilter = document.getElementById('btn-filter');
  const btnClearFilter = document.getElementById('btn-clear-filter');
  const tableBody = document.getElementById('receipts-table-body');
  const receiptCount = document.getElementById('receipt-count');
  const detailModal = document.getElementById('receipt-detail-modal');
  const detailBody = document.getElementById('receipt-detail-body');

  // Load receipts list
  async function loadReceipts() {
    try {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Loading receipts...</td></tr>`;

      const filters = {
        customer_name: filterCust.value.trim(),
        from_date: filterFrom.value,
        to_date: filterTo.value
      };

      const receipts = await window.api.getReceipts(filters);
      receiptCount.textContent = `Found ${receipts.length} receipt(s)`;
      renderReceipts(receipts);
    } catch (err) {
      showToast('Error loading receipts: ' + err.message, 'error');
    }
  }

  // Render receipts table
  function renderReceipts(receipts) {
    tableBody.innerHTML = '';
    if (receipts.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">No receipts found matching filters.</td></tr>`;
      return;
    }

    receipts.forEach(r => {
      const tr = document.createElement('tr');
      const date = new Date(r.receipt_date || r.created_at).toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      const hasPdf = !!r.pdf_path;
      const pdfBadge = hasPdf 
        ? `<span class="status-badge approved" style="cursor:pointer;" title="${escapeHtml(r.pdf_path)}">✔️ Ready</span>`
        : `<span class="status-badge pending">❌ Missing</span>`;

      // Format products purchased
      let productsHtml = '-';
      if (r.products_purchased) {
        const prodList = r.products_purchased.split(',').filter(x => x.trim() !== '');
        if (prodList.length > 3) {
          const shown = prodList.slice(0, 2).map(p => {
            const parts = p.split(' ×');
            if (parts.length < 2) return p;
            const name = parts[0];
            const qtyPart = parts[1] || '';
            const qtyNum = qtyPart.split(' ')[0];
            return `${escapeHtml(name)} ×${escapeHtml(qtyNum)}`;
          }).join('<br>');
          productsHtml = `${shown}<br><span style="color:var(--primary-color);font-weight:600;">+${prodList.length - 2} more...</span>`;
        } else {
          productsHtml = prodList.map(p => escapeHtml(p)).join('<br>');
        }
      }

      tr.innerHTML = `
        <td><strong class="receipt-link" style="cursor:pointer;color:var(--primary-color);" data-id="${r.id}">${escapeHtml(r.receipt_number)}</strong></td>
        <td>${date}</td>
        <td><strong>${escapeHtml(r.customer_name)}</strong></td>
        <td>${escapeHtml(r.customer_phone || '-')}</td>
        <td style="font-size:12px;max-width:240px;line-height:1.4;">${productsHtml}</td>
        <td>₹${parseFloat(r.total_amount || 0).toFixed(2)}</td>
        <td>₹${parseFloat(r.paid_amount || 0).toFixed(2)}</td>
        <td style="${parseFloat(r.balance_amount) > 0 ? 'color:var(--danger-color);font-weight:bold' : 'color:var(--success-color);'}">
          ₹${parseFloat(r.balance_amount || 0).toFixed(2)}
        </td>
        <td>${pdfBadge}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm btn-view-detail" data-id="${r.id}">👁️ View Receipt</button>
            <button class="btn btn-primary btn-sm btn-update-pay" data-id="${r.id}">💳 Update Payment</button>
            <button class="btn btn-success btn-sm btn-view-pdf" data-id="${r.id}" data-path="${escapeHtml(r.pdf_path || '')}">📄 Download PDF</button>
          </div>
        </td>
      `;

      // Event Listeners on buttons
      tr.querySelector('.receipt-link').addEventListener('click', () => openDetailModal(r.id));
      tr.querySelector('.btn-view-detail').addEventListener('click', () => handlePdfAction(r.id, r.pdf_path));
      tr.querySelector('.btn-update-pay').addEventListener('click', () => openPayUpdateModal(r.id));
      tr.querySelector('.btn-view-pdf').addEventListener('click', () => handlePdfAction(r.id, r.pdf_path));
      
      if (hasPdf) {
        tr.querySelector('.status-badge.approved').addEventListener('click', () => {
          window.api.openPath(r.pdf_path);
        });
      }

      tableBody.appendChild(tr);
    });
  }

  // Handle PDF open / generate
  async function handlePdfAction(receiptId, existingPath) {
    let shouldGenerate = !existingPath;
    if (existingPath) {
      const exists = await window.api.fileExists(existingPath);
      if (!exists) {
        shouldGenerate = true;
      }
    }

    if (shouldGenerate) {
      showToast('Generating receipt PDF, please wait...', 'pending');
      try {
        const res = await window.api.generatePDF({ receiptId });
        if (res.success) {
          showToast('PDF generated successfully!', 'success');
          loadReceipts();
          await window.api.openPath(res.filePath);
        } else {
          showToast('PDF Generation failed: ' + res.error, 'error');
        }
      } catch (err) {
        showToast('Error generating PDF: ' + err.message, 'error');
      }
    } else {
      try {
        const res = await window.api.openPath(existingPath);
        if (!res.success) {
          showToast('Could not open file: ' + res.error, 'error');
        }
      } catch (err) {
        showToast('Error opening file: ' + err.message, 'error');
      }
    }
  }

  // Handle WhatsApp action
  async function handleWhatsAppAction(receiptId) {
    try {
      const receipt = await window.api.getReceiptById(receiptId);
      if (!receipt) {
        showToast('Receipt not found.', 'error');
        return;
      }
      
      let pdfPath = receipt.pdf_path;
      let shouldGenerate = !pdfPath;
      if (pdfPath) {
        const exists = await window.api.fileExists(pdfPath);
        if (!exists) {
          shouldGenerate = true;
        }
      }

      if (shouldGenerate) {
        showToast('Generating receipt PDF first...', 'pending');
        const res = await window.api.generatePDF({ receiptId });
        if (res.success) {
          pdfPath = res.filePath;
          loadReceipts();
        } else {
          showToast('Failed to generate PDF: ' + res.error, 'error');
          return;
        }
      }

      // Open PDF automatically
      await window.api.openPath(pdfPath);

      let phone = (receipt.customer_phone || '').replace(/[\s\+\(\)\-\[\]]/g, '');
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

      const settings = await window.api.getCompanySettings();
      const companyName = settings.company_name || 'Sivakami Traders';

      let itemsStr = '';
      if (receipt.items && receipt.items.length > 0) {
        itemsStr = receipt.items.map(item => `* ${item.material_name}: ${item.quantity} ${item.unit} @ ₹${item.rate}/unit = ₹${item.total}`).join('\n');
      }

      const msg = `*${companyName}*\n*Receipt No:* ${receipt.receipt_number}\n*Customer:* ${receipt.customer_name}\n*Items:*\n${itemsStr}\n*Total:* ₹${parseFloat(receipt.total_amount).toFixed(2)}\n*Paid:* ₹${parseFloat(receipt.paid_amount).toFixed(2)}\n*Balance:* ₹${parseFloat(receipt.balance_amount).toFixed(2)}\n\nThank you for doing business with ${companyName}.\nThe receipt PDF is ready for attachment.`;

      showToast('Opening WhatsApp and preparing PDF to auto-send...', 'pending');
      await window.api.whatsappSendPDF({ phone: formattedPhone, filePath: pdfPath });
      await window.api.markWhatsappSent(receiptId);
    } catch (err) {
      showToast('Error opening WhatsApp: ' + err.message, 'error');
    }
  }

  // Open detail modal
  async function openDetailModal(id) {
    detailBody.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:30px 0;">Loading receipt details...</p>`;
    detailModal.classList.add('show');

    try {
      const receipt = await window.api.getReceiptById(id);
      if (!receipt) {
        detailBody.innerHTML = `<p style="text-align:center;color:var(--danger-color);padding:30px 0;">Receipt details not found.</p>`;
        return;
      }

      const settings = await window.api.getCompanySettings();
      const itemsHtml = (receipt.items || []).map(item => `
        <tr>
          <td>${escapeHtml(item.material_name)}</td>
          <td style="text-align:center;">${item.quantity} ${escapeHtml(item.unit)}</td>
          <td style="text-align:right;">₹${parseFloat(item.rate).toFixed(2)}</td>
          <td style="text-align:right;"><strong>₹${parseFloat(item.total).toFixed(2)}</strong></td>
        </tr>
      `).join('');

      // Build payments list
      let paymentsHtml = '';
      if (receipt.payments && receipt.payments.length > 0) {
        const rows = receipt.payments.map(p => `
          <tr>
            <td>${new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
            <td style="text-align:right;">₹${parseFloat(p.amount).toFixed(2)}</td>
            <td>${escapeHtml(p.remarks || '-')}</td>
          </tr>
        `).join('');
        
        paymentsHtml = `
          <div style="margin-bottom:16px;">
            <h4 style="font-size:11px; text-transform:uppercase; color:var(--text-muted); margin:0 0 6px 0; letter-spacing:0.5px;">Payment History</h4>
            <table class="data-table" style="font-size:12px; margin-bottom:0; border:1px solid #eee;">
              <thead>
                <tr style="background:#f1f5f9;">
                  <th>Date</th>
                  <th style="text-align:right; width:120px;">Amount</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }

      detailBody.innerHTML = `
        <div style="font-family: 'Outfit', sans-serif;">
          <!-- Receipt Header / Branding -->
          <div style="border-bottom: 2px solid var(--primary-color); padding-bottom: 12px; margin-bottom: 16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div style="display:flex; align-items:center; gap:12px;">
                <img src="../assets/logo.png" alt="ST" style="height:48px; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.1);" onerror="this.style.display='none';">
                <div>
                  <h2 style="color:var(--text-main); margin:0 0 4px 0; font-family:'Outfit'; font-size:22px;">${escapeHtml(settings.company_name || 'Sivakami Traders')}</h2>
                  <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">
                    ${settings.address ? escapeHtml(settings.address) + '<br>' : ''}
                    ${settings.phone ? 'Phone: ' + escapeHtml(settings.phone) + ' ' : ''}
                    ${settings.email ? '| Email: ' + escapeHtml(settings.email) : ''}
                    ${settings.gstin ? '<br>GSTIN: ' + escapeHtml(settings.gstin) : ''}
                  </div>
                </div>
              </div>
              <div style="text-align:right;">
                <div class="status-badge" style="background:var(--primary-color); color:#fff; font-size:11px; font-weight:600; text-transform:uppercase;">${receipt.movement_type || 'Stock Out'}</div>
                <div style="font-size:13px; font-weight:bold; color:var(--text-main); margin-top:6px;">${escapeHtml(receipt.receipt_number)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${new Date(receipt.receipt_date || receipt.created_at).toLocaleString()}</div>
              </div>
            </div>
          </div>

          <!-- Customer details -->
          <div style="margin-bottom:16px;">
            <h4 style="font-size:11px; text-transform:uppercase; color:var(--text-muted); margin:0 0 6px 0; letter-spacing:0.5px;">Customer Info</h4>
            <div style="background:#f8fafc; border-radius:6px; padding:10px 14px; font-size:13px;">
              <div style="margin-bottom:4px;"><strong>Name:</strong> ${escapeHtml(receipt.customer_name)}</div>
              ${receipt.customer_phone ? `<div style="margin-bottom:4px;"><strong>Phone:</strong> ${escapeHtml(receipt.customer_phone)}</div>` : ''}
              ${receipt.customer_address ? `<div><strong>Address:</strong> ${escapeHtml(receipt.customer_address)}</div>` : ''}
            </div>
          </div>

          <!-- Items Table -->
          <h4 style="font-size:11px; text-transform:uppercase; color:var(--text-muted); margin:0 0 6px 0; letter-spacing:0.5px;">Items</h4>
          <table class="data-table" style="margin-bottom:16px; font-size:13px;">
            <thead>
              <tr style="background:var(--bg-primary); color:#white;">
                <th>Material / Product</th>
                <th style="text-align:center; width:80px;">Qty</th>
                <th style="text-align:right; width:90px;">Rate</th>
                <th style="text-align:right; width:110px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Totals block -->
          <div style="display:grid; grid-template-columns:1fr 200px; gap:20px; align-items:start; margin-bottom:16px;">
            <div>
              ${receipt.remarks ? `
                <div style="background:#fffde7; border: 1px solid #ffe082; border-radius:4px; padding:8px 12px; font-size:12px;">
                  <strong>Remarks:</strong> ${escapeHtml(receipt.remarks)}
                </div>
              ` : ''}
            </div>
            <div style="background:#f1f5f9; border-radius:6px; padding:12px; font-size:13px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>Total:</span>
                <strong>₹${parseFloat(receipt.total_amount).toFixed(2)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:var(--success-color);">
                <span>Total Received:</span>
                <strong>₹${parseFloat(receipt.paid_amount).toFixed(2)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; border-top:1px solid #ccc; padding-top:6px; font-size:14px; ${parseFloat(receipt.balance_amount) > 0 ? 'color:var(--danger-color);font-weight:bold' : 'color:var(--success-color);'}">
                <span>Balance:</span>
                <strong>₹${parseFloat(receipt.balance_amount).toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <!-- Payment History Section -->
          ${paymentsHtml}

          <!-- Update Payment Form -->
          ${parseFloat(receipt.balance_amount) > 0 ? `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 16px; margin-bottom:16px;">
              <h4 style="font-size:12px; font-weight:bold; margin:0 0 8px 0; color:var(--text-main);">➕ Record New Payment</h4>
              <form id="add-payment-form" style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                <div style="flex:1; min-width:120px;">
                  <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Amount (Max ₹${parseFloat(receipt.balance_amount).toFixed(2)}) *</label>
                  <input type="number" id="pay-amount" class="form-control" placeholder="e.g., 500" min="0.01" max="${parseFloat(receipt.balance_amount)}" step="0.01" required style="padding:6px 10px;">
                </div>
                <div style="flex:1; min-width:120px;">
                  <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Payment Date</label>
                  <input type="date" id="pay-date" class="form-control" style="padding:6px 10px;">
                </div>
                <div style="flex:2; min-width:180px;">
                  <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Remarks</label>
                  <input type="text" id="pay-remarks" class="form-control" placeholder="Remarks (e.g. Cash, GPay)" style="padding:6px 10px;">
                </div>
                <button type="submit" class="btn btn-success" style="padding:8px 14px; height:36px;">💾 Save</button>
              </form>
              <div id="add-payment-alert" style="display:none; color:var(--danger-color); font-size:12px; margin-top:8px; font-weight:600;"></div>
            </div>
          ` : ''}

          <!-- Actions Footer -->
          <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #e2e8f0; padding-top:14px; margin-top:10px;">
            <button class="btn btn-secondary modal-detail-close-btn">Close</button>
            <button class="btn btn-primary modal-pdf-btn">
              ${receipt.pdf_path ? '📂 Open PDF' : '📄 Generate PDF'}
            </button>
            <button class="btn btn-success modal-wa-btn">💬 Send WhatsApp</button>
          </div>
        </div>
      `;

      // Set up click handlers inside modal
      detailBody.querySelector('.modal-detail-close-btn').addEventListener('click', () => {
        closeDetailModal();
      });
      detailBody.querySelector('.modal-pdf-btn').addEventListener('click', () => {
        handlePdfAction(receipt.id, receipt.pdf_path);
        closeDetailModal();
      });
      detailBody.querySelector('.modal-wa-btn').addEventListener('click', () => {
        handleWhatsAppAction(receipt.id);
        closeDetailModal();
      });

      // Handle payment form submission
      const payForm = detailBody.querySelector('#add-payment-form');
      if (payForm) {
        detailBody.querySelector('#pay-date').valueAsDate = new Date();
        payForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const alertEl = detailBody.querySelector('#add-payment-alert');
          alertEl.style.display = 'none';

          const amount = parseFloat(detailBody.querySelector('#pay-amount').value);
          const date = detailBody.querySelector('#pay-date').value;
          const remarks = detailBody.querySelector('#pay-remarks').value.trim();

          if (!amount || amount <= 0) {
            alertEl.textContent = 'Enter a valid payment amount.';
            alertEl.style.display = 'block';
            return;
          }

          const remaining = parseFloat(receipt.balance_amount);
          if (amount > remaining) {
            alertEl.textContent = `Amount cannot exceed remaining balance of ₹${remaining.toFixed(2)}.`;
            alertEl.style.display = 'block';
            return;
          }

          try {
            showToast('Recording payment...', 'pending');
            const res = await window.api.addPayment({ receipt_id: receipt.id, amount, remarks, date });
            if (res.success) {
              showToast('✅ Payment recorded successfully!');
              openDetailModal(receipt.id);
              loadReceipts();
            } else {
              alertEl.textContent = res.error || 'Failed to save payment.';
              alertEl.style.display = 'block';
              showToast('Failed to save payment.', 'error');
            }
          } catch (err) {
            alertEl.textContent = err.message;
            alertEl.style.display = 'block';
            showToast('System error occurred.', 'error');
          }
        });
      }

    } catch (err) {
      detailBody.innerHTML = `<p style="text-align:center;color:var(--danger-color);padding:30px 0;">Error loading details: ${escapeHtml(err.message)}</p>`;
    }
  }

  // Close modal helper
  function closeDetailModal() {
    detailModal.classList.remove('show');
  }

  const closeReceiptDetailBtn = document.getElementById('btn-close-receipt-detail');
  if (closeReceiptDetailBtn) closeReceiptDetailBtn.addEventListener('click', closeDetailModal);

  window.closeDetailModal = closeDetailModal;

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === detailModal) {
      closeDetailModal();
    }
  });

  // Filter Listeners
  btnFilter.addEventListener('click', loadReceipts);
  btnClearFilter.addEventListener('click', () => {
    filterCust.value = '';
    filterFrom.value = '';
    filterTo.value = '';
    loadReceipts();
  });

  // Search on enter key
  filterCust.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loadReceipts();
    }
  });

  // Escape HTML helper
  

  // Payment Update Modal Controls
  const payModal = document.getElementById('update-payment-modal');

  async function openPayUpdateModal(id) {
    document.getElementById('pay-update-alert').style.display = 'none';
    document.getElementById('pay-update-form').reset();
    payModal.style.display = 'flex';

    try {
      const receipt = await window.api.getReceiptById(id);
      if (!receipt) return;

      document.getElementById('pay-receipt-id').value = receipt.id;
      document.getElementById('pay-receipt-num').textContent = receipt.receipt_number;
      document.getElementById('pay-customer-name').textContent = receipt.customer_name;
      document.getElementById('pay-total-bill').textContent = '₹' + parseFloat(receipt.total_amount).toFixed(2);
      document.getElementById('pay-already-paid').textContent = '₹' + parseFloat(receipt.paid_amount).toFixed(2);
      document.getElementById('pay-remaining-balance').textContent = '₹' + parseFloat(receipt.balance_amount).toFixed(2);

      document.getElementById('pay-update-amount').max = receipt.balance_amount;
    } catch (err) {
      console.error(err);
    }
  }

  function closePayModal() {
    payModal.style.display = 'none';
  }

  document.getElementById('btn-close-pay-modal').addEventListener('click', closePayModal);
  document.getElementById('btn-cancel-pay-modal').addEventListener('click', closePayModal);

  document.getElementById('pay-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('pay-update-alert');
    alertEl.style.display = 'none';

    const receiptId = parseInt(document.getElementById('pay-receipt-id').value);
    const amount = parseFloat(document.getElementById('pay-update-amount').value);
    const remarks = document.getElementById('pay-update-remarks').value.trim();

    if (!amount || amount <= 0) {
      alertEl.textContent = 'Enter a valid payment amount.';
      alertEl.style.display = 'block';
      return;
    }

    try {
      showToast('Recording payment...', 'pending');
      const res = await window.api.addPayment({ receipt_id: receiptId, amount, remarks });
      if (res.success) {
        showToast('✅ Payment updated successfully!');
        closePayModal();
        loadReceipts();
      } else {
        alertEl.textContent = res.error || 'Failed to save payment.';
        alertEl.style.display = 'block';
        showToast('Failed to save payment.', 'error');
      }
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.style.display = 'block';
      showToast('System error occurred.', 'error');
    }
  });

  // Initial load
  loadReceipts();
});
