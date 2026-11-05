/* Table definitions for each back-office module */
(function () {
  const E = window.Emphile;
  const { db, esc, money, fdate, todayISO } = E;

  const SERVICES = ['Electrical Inspection (EICR)', 'Design', 'Build', 'New Installation', 'Commissioning', 'Industrial Services', 'Energy Efficiency', 'Maintenance & Repair', 'Emergency Call-out', 'Lighting', 'Other'];
  const PROPS = ['Residential', 'Commercial', 'Industrial'];
  const clientLookup = { table: 'clients', label: 'name' };
  const staffLookup = { table: 'staff', label: 'full_name' };
  const jobLookup = { table: 'jobs', label: r => [r.ref, r.title].filter(Boolean).join(' · ') };
  const invoiceLookup = { table: 'invoices', label: r => r.number || '(no number)' };
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  const R = {};

  R.leads = {
    table: 'leads', title: 'Leads', single: 'Lead', filter: { key: 'status', label: 'stages', options: ['New', 'Contacted', 'Quoted', 'Won', 'Lost'] },
    columns: [
      { key: 'created_at', label: 'Received', render: r => esc(fdate(r.created_at)) },
      { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'service', label: 'Service' },
      { key: 'status', label: 'Stage', pill: { New: 'y', Won: 'g', Lost: 'r' } },
      { key: 'source', label: 'Source' },
    ],
    fields: [
      { key: 'name', label: 'Name', required: true }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'service', label: 'Service', type: 'select', options: SERVICES }, { key: 'property_type', label: 'Property type', type: 'select', options: PROPS },
      { key: 'status', label: 'Stage', type: 'select', options: ['New', 'Contacted', 'Quoted', 'Won', 'Lost'], default: 'New' },
      { key: 'source', label: 'Source', type: 'select', options: ['Website', 'Phone', 'Email', 'Referral', 'Other'], default: 'Phone' },
      { key: 'client_id', label: 'Linked client', lookup: clientLookup },
      { key: 'message', label: 'Enquiry', type: 'textarea' }, { key: 'notes', label: 'Internal notes', type: 'textarea' },
    ],
    actions: [{
      label: 'To client', run: async (r, api) => {
        if (r.client_id) { alert('Already linked to a client.'); return; }
        const client = await db.add('clients', { name: r.name, type: r.property_type || null, email: r.email || null, phone: r.phone || null, notes: r.message || null });
        await db.update('leads', r.id, { client_id: client.id, status: r.status === 'Lost' ? r.status : 'Won' });
        api.reload();
      },
    }],
  };

  R.clients = {
    table: 'clients', title: 'Clients', single: 'Client', order: 'name', asc: true,
    columns: [{ key: 'name', label: 'Client' }, { key: 'type', label: 'Type' }, { key: 'contact_name', label: 'Contact' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }],
    fields: [
      { key: 'name', label: 'Client / company name', required: true }, { key: 'type', label: 'Type', type: 'select', options: PROPS },
      { key: 'contact_name', label: 'Contact person' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Address', type: 'textarea' }, { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  };

  const JOB_STATUS = ['Enquiry', 'Quoted', 'Scheduled', 'In progress', 'Complete', 'Invoiced'];
  R.jobs = {
    table: 'jobs', title: 'Jobs', single: 'Job', autoNumber: { key: 'ref', prefix: 'JOB-' },
    filter: { key: 'status', label: 'statuses', options: JOB_STATUS },
    columns: [
      { key: 'ref', label: 'Ref' }, { key: 'title', label: 'Job' }, { key: 'client_id', label: 'Client' }, { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status', pill: { Complete: 'g', 'In progress': 'y' } }, { key: 'scheduled_date', label: 'Scheduled' }, { key: 'engineer_id', label: 'Engineer' },
    ],
    fields: [
      { key: 'ref', label: 'Job ref' }, { key: 'title', label: 'Title', required: true },
      { key: 'client_id', label: 'Client', lookup: clientLookup }, { key: 'type', label: 'Type', type: 'select', options: SERVICES },
      { key: 'status', label: 'Status', type: 'select', options: JOB_STATUS, default: 'Enquiry' },
      { key: 'scheduled_date', label: 'Scheduled date', type: 'date' }, { key: 'engineer_id', label: 'Engineer', lookup: { ...staffLookup, where: r => r.active } },
      { key: 'site_address', label: 'Site address', type: 'textarea' }, { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  };

  const docColumns = [
    { key: 'number', label: 'No.' }, { key: 'client_id', label: 'Client' }, { key: 'issue_date', label: 'Issued' },
    { key: 'total', label: 'Total', render: r => money(E.docTotals(r).total) },
  ];
  const docFields = (extraDate, statuses) => [
    { key: 'number', label: 'Number' }, { key: 'client_id', label: 'Client', lookup: clientLookup, required: true },
    { key: 'job_id', label: 'Job', lookup: jobLookup }, { key: 'issue_date', label: 'Issue date', type: 'date', default: todayISO },
    extraDate, { key: 'status', label: 'Status', type: 'select', options: statuses, default: 'Draft' },
    { key: 'vat_rate', label: 'VAT rate %', type: 'number', default: 0 },
    { key: 'items', label: 'Line items', type: 'lines' }, { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const Q_STATUS = ['Draft', 'Sent', 'Accepted', 'Declined'];
  R.quotes = {
    table: 'quotes', title: 'Quotes', single: 'Quote', autoNumber: { key: 'number', prefix: 'QT-' }, filter: { key: 'status', label: 'statuses', options: Q_STATUS },
    columns: [...docColumns, { key: 'status', label: 'Status', pill: { Accepted: 'g', Declined: 'r', Sent: 'y' } }],
    fields: docFields({ key: 'valid_until', label: 'Valid until', type: 'date' }, Q_STATUS),
    actions: [
      { label: 'Print', run: (r, api) => E.printDoc('Quote', r, api.lookups) },
      {
        label: '→ Invoice', run: async (r) => {
          if (!confirm('Create an invoice from this quote?')) return;
          const number = await E.nextNumber('invoices', 'number', 'INV-');
          await db.add('invoices', { number, client_id: r.client_id || null, job_id: r.job_id || null, issue_date: todayISO(), due_date: null, items: r.items || [], vat_rate: r.vat_rate || 0, notes: r.notes || null, status: 'Draft' });
          alert('Invoice ' + number + ' created (see the Invoices tab).');
        },
      },
    ],
  };

  const I_STATUS = ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Void'];
  R.invoices = {
    table: 'invoices', title: 'Invoices', single: 'Invoice', autoNumber: { key: 'number', prefix: 'INV-' }, filter: { key: 'status', label: 'statuses', options: I_STATUS },
    preload: async () => ({ payments: await db.list('payments') }),
    onDelete: async r => { for (const p of await db.list('payments')) if (p.invoice_id === r.id) await db.remove('payments', p.id); },
    columns: [
      ...docColumns, { key: 'due_date', label: 'Due' },
      { key: 'balance', label: 'Balance', render: (r, c) => { const paid = (c.payments || []).filter(p => p.invoice_id === r.id).reduce((s, p) => s + +p.amount, 0); const b = E.docTotals(r).total - paid; return b > 0.004 ? money(b) : '<span class="pill g">Settled</span>'; } },
      { key: 'status', label: 'Status', pill: { Paid: 'g', Overdue: 'r', 'Part paid': 'y' } },
    ],
    fields: docFields({ key: 'due_date', label: 'Due date', type: 'date' }, I_STATUS),
    actions: [{ label: 'Print', run: (r, api) => E.printDoc('Invoice', r, api.lookups) }],
  };

  R.payments = {
    table: 'payments', title: 'Payments', single: 'Payment', order: 'paid_on',
    columns: [{ key: 'paid_on', label: 'Date' }, { key: 'invoice_id', label: 'Invoice' }, { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }],
    fields: [
      { key: 'invoice_id', label: 'Invoice', lookup: invoiceLookup, required: true }, { key: 'paid_on', label: 'Date paid', type: 'date', default: todayISO },
      { key: 'amount', label: 'Amount (£)', type: 'money', required: true }, { key: 'method', label: 'Method', type: 'select', options: ['Bank transfer', 'Card', 'Cash', 'Cheque', 'Other'] },
      { key: 'reference', label: 'Reference' },
    ],
  };

  R.inspections = {
    table: 'inspections', title: 'Inspections', single: 'Inspection', order: 'inspection_date',
    filter: { key: 'result', label: 'results', options: ['Satisfactory', 'Unsatisfactory', 'Further investigation'] },
    columns: [
      { key: 'inspection_date', label: 'Date' }, { key: 'client_id', label: 'Client' }, { key: 'property_address', label: 'Property' }, { key: 'type', label: 'Type' },
      { key: 'certificate_no', label: 'Certificate' }, { key: 'result', label: 'Result', pill: { Satisfactory: 'g', Unsatisfactory: 'r', 'Further investigation': 'y' } },
      {
        key: 'next_due', label: 'Next due', render: r => {
          if (!r.next_due) return '';
          const cls = r.next_due < todayISO() ? 'r' : r.next_due <= addDays(60) ? 'y' : '';
          return `<span class="pill ${cls}">${esc(fdate(r.next_due))}</span>`;
        },
      },
    ],
    fields: [
      { key: 'client_id', label: 'Client', lookup: clientLookup }, { key: 'job_id', label: 'Job', lookup: jobLookup },
      { key: 'property_address', label: 'Property address', full: true },
      { key: 'type', label: 'Type', type: 'select', options: ['EICR', 'Minor works certificate', 'Electrical installation certificate', 'PAT testing', 'Emergency lighting test', 'Other'] },
      { key: 'result', label: 'Result', type: 'select', options: ['Satisfactory', 'Unsatisfactory', 'Further investigation'] },
      { key: 'inspection_date', label: 'Inspection date', type: 'date' }, { key: 'next_due', label: 'Next inspection due', type: 'date' },
      { key: 'certificate_no', label: 'Certificate number' }, { key: 'engineer_id', label: 'Engineer', lookup: staffLookup },
      { key: 'notes', label: 'Observations / notes', type: 'textarea' },
    ],
  };

  R.staff = {
    table: 'staff', title: 'Staff', single: 'Staff member', order: 'full_name', asc: true,
    columns: [{ key: 'full_name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'pay_type', label: 'Pay basis' }, { key: 'active', label: 'Active' }],
    fields: [
      { key: 'full_name', label: 'Full name', required: true }, { key: 'role', label: 'Role' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'email', label: 'Email', type: 'email' },
      { key: 'pay_type', label: 'Pay basis', type: 'select', options: ['Hourly', 'Weekly', 'Monthly', 'Day rate', 'Subcontractor'] }, { key: 'pay_rate', label: 'Pay rate (£)', type: 'money' },
      { key: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  };

  R.rota = {
    table: 'rota', title: 'Rota', single: 'Shift', order: 'shift_date',
    columns: [{ key: 'shift_date', label: 'Date' }, { key: 'staff_id', label: 'Engineer' }, { key: 'start_time', label: 'Start', render: r => esc((r.start_time || '').slice(0, 5)) }, { key: 'end_time', label: 'End', render: r => esc((r.end_time || '').slice(0, 5)) }, { key: 'job_id', label: 'Job' }, { key: 'notes', label: 'Notes' }],
    fields: [
      { key: 'staff_id', label: 'Engineer', lookup: { ...staffLookup, where: r => r.active }, required: true }, { key: 'shift_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'start_time', label: 'Start', type: 'time' }, { key: 'end_time', label: 'End', type: 'time' },
      { key: 'job_id', label: 'Job', lookup: jobLookup }, { key: 'notes', label: 'Notes' },
    ],
  };

  R.expenses = {
    table: 'expenses', title: 'Expenses', single: 'Expense', order: 'expense_date',
    columns: [{ key: 'expense_date', label: 'Date' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' }, { key: 'supplier', label: 'Supplier' }, { key: 'job_id', label: 'Job' }, { key: 'amount', label: 'Amount' }],
    fields: [
      { key: 'expense_date', label: 'Date', type: 'date', required: true, default: todayISO },
      { key: 'category', label: 'Category', type: 'select', options: ['Materials', 'Tools & equipment', 'Vehicle & fuel', 'Subcontractors', 'Insurance', 'Software', 'Training & certification', 'Office', 'Other'] },
      { key: 'description', label: 'Description' }, { key: 'supplier', label: 'Supplier' },
      { key: 'amount', label: 'Amount (£)', type: 'money', required: true }, { key: 'job_id', label: 'Job', lookup: jobLookup },
    ],
  };

  // Format plain date and money cells that have no explicit field type
  Object.values(R).forEach(cfg => cfg.fields.forEach(f => {
    if (/(_date|paid_on|next_due)$/.test(f.key) && !f.type) f.type = 'date';
  }));
  Object.values(R).forEach(cfg => cfg.columns.forEach(c => {
    const f = cfg.fields.find(x => x.key === c.key);
    if (f && !f.lookup && !c.render && !c.pill && (f.type === 'date' || f.type === 'money' || f.type === 'checkbox')) return;
    if (c.key === 'amount' && !c.render) c.render = r => money(r.amount);
  }));

  E.R = R;
  E.boot = async function (active, title, keys) {
    const session = await E.guard(); if (!session) return;
    const content = E.shell(active, title, session);
    if (keys.length === 1) E.mountResource(content, R[keys[0]]);
    else E.tabs(content, keys.map(k => R[k]));
  };
})();
