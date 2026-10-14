import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

const roleNames = {
  super_admin: 'Super Admin', store_manager: 'Store Manager', cashier: 'Cashier', inventory_manager: 'Inventory Manager',
  accountant: 'Accountant', procurement_officer: 'Procurement Officer', auditor: 'Auditor', customer_service: 'Customer Service Officer',
  stock_receiver: 'Stock Receiver', branch_supervisor: 'Branch Supervisor', hr_manager: 'HR Manager', warehouse_manager: 'Warehouse Manager',
  loyalty_manager: 'Loyalty Program Manager', support_technician: 'System Support Technician', admin: 'Administrator',
};

function DataPanel({ title, rows, onAction }) {
  return <section className="panel">
    <h3>{title}</h3>
    {!rows?.length && <p className="muted">No records yet.</p>}
    {rows?.map((row) => <div className="li ops-row" key={row._id || row.id || JSON.stringify(row)}>
      <span><strong>{row.name || row.code || row.receiptNo || row.description || row.type || row.status || row.key || row._id}</strong><small>{row.email || row.role || row.status || row.reason || row.action || row.createdAt || ''}</small></span>
      {onAction?.(row)}
    </div>)}
  </section>;
}

function CreateStaffForm({ branches, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const roles = ['store_manager', 'cashier', 'inventory_manager', 'accountant', 'procurement_officer', 'auditor', 'customer_service', 'stock_receiver', 'branch_supervisor', 'hr_manager', 'warehouse_manager', 'loyalty_manager', 'support_technician'];

  async function createAccount(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(''); setCreated(null);
    try {
      const account = await api('/auth/users', { method: 'POST', body: {
        name: values.get('name'), email: values.get('email'), password: values.get('password'),
        role: values.get('role'), branchId: values.get('branchId') || null,
      } });
      setCreated(account);
      form.reset();
      await onCreated(account);
    } catch (e) {
      setError(e.message || 'Could not create the account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel staff-create-panel">
    <div className="staff-create-heading"><div><h3>Create staff account</h3><p className="muted">Add a team member and assign their role and store branch.</p></div><span className="staff-create-badge">STAFF ACCESS</span></div>
    <form className="staff-create-form" onSubmit={createAccount} onChange={() => { setError(''); setCreated(null); }}>
      <label>Full name<input name="name" placeholder="e.g. Amina Hassan" autoComplete="name" required /></label>
      <label>Work email<input name="email" type="email" placeholder="name@store.com" autoComplete="email" required /></label>
      <label>Temporary password<input name="password" type="password" minLength="6" autoComplete="new-password" placeholder="At least 6 characters" required /></label>
      <label>Role<select name="role" defaultValue="cashier" required>{roles.map((role) => <option key={role} value={role}>{roleNames[role]}</option>)}</select></label>
      <label>Branch<select name="branchId" defaultValue="" required disabled={!branches.length}><option value="">{branches.length ? 'Select a branch…' : 'Create a branch first'}</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select><small>{branches.length ? 'Assign a home branch for store access.' : 'Create a branch in the panel above before adding staff.'}</small></label>
      {error && <div className="alert staff-form-feedback" role="alert">{error}</div>}
      {created && <div className="staff-success" role="status"><strong>Account created</strong><span>{created.name} · {created.email}</span><small>Share the temporary password with the employee so they can sign in.</small></div>}
      <div className="staff-create-actions"><button className="btn primary" disabled={busy || !branches.length}>{busy ? <><span className="button-spinner" />Creating account…</> : <>Create account <span aria-hidden="true">→</span></>}</button><small>Staff can sign in as soon as the account is created.</small></div>
    </form>
  </section>;
}

function ReceiveOrder({ order, onClose, onSaved }) {
  const [catalog, setCatalog] = useState({});
  const [selectedProduct, setSelectedProduct] = useState('');
  const [accepted, setAccepted] = useState(() => Object.fromEntries(order.items.map((item) => [String(item.productId), 0])));
  const [rejected, setRejected] = useState(() => Object.fromEntries(order.items.map((item) => [String(item.productId), 0])));
  const [notes, setNotes] = useState({});
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Scan a product barcode to count it toward this delivery.');
  const [busy, setBusy] = useState(false);
  const barcodeRef = useRef(null);

  useEffect(() => {
    api('/products?active=all&limit=500').then((products) => setCatalog(Object.fromEntries(products.map((product) => [product._id, product])))).catch((e) => setError(e.message));
    barcodeRef.current?.focus();
  }, []);

  async function scan(code = barcode) {
    const value = String(code || '').trim();
    if (!value || busy) return;
    setBarcode(''); setError(''); setNotice('Checking barcode…'); setBusy(true);
    try {
      let product;
      try {
        product = await api(`/products/barcode/${encodeURIComponent(value)}`);
      } catch (e) {
        if (!e.message?.includes('No product with that barcode')) throw e;
      }

      let productId;
      if (product) {
        productId = String(product._id);
        const line = order.items.find((item) => String(item.productId) === productId);
        if (!line) throw new Error(`${product.name} is not on this purchase order.`);
      } else {
        if (!selectedProduct) throw new Error('Select the matching purchase order product before assigning a new barcode.');
        await api(`/operations/purchase-orders/${order._id}/register-barcode`, { method: 'POST', body: { barcode: value, productId: selectedProduct } });
        productId = selectedProduct;
        setCatalog((current) => ({ ...current, [productId]: { ...current[productId], barcode: value } }));
      }

      const line = order.items.find((item) => String(item.productId) === productId);
      const productName = catalog[productId]?.name || product?.name || 'Product';
      const remaining = Number(line.orderedQty) - Number(line.acceptedQty || 0) - Number(line.rejectedQty || 0);
      if ((Number(accepted[productId]) || 0) >= remaining) throw new Error(`The ordered quantity for ${productName} has already been scanned.`);
      setAccepted((current) => ({ ...current, [productId]: (Number(current[productId]) || 0) + 1 }));
      setNotice(`${productName} scanned${product ? '' : ' and barcode saved'}.`);
      setSelectedProduct(productId);
    } catch (e) {
      setError(e.message);
      setNotice('Scan another item or correct the product selection.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => barcodeRef.current?.focus());
    }
  }

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const items = order.items.map((line) => {
      const productId = String(line.productId);
      return { productId, acceptedQty: Number(accepted[productId]) || 0, rejectedQty: Number(rejected[productId]) || 0, discrepancyNote: notes[productId] || undefined };
    });
    if (!items.some((item) => item.acceptedQty > 0 || item.rejectedQty > 0)) {
      setBusy(false); setError('Scan or enter at least one accepted or rejected unit.'); return;
    }
    try {
      const result = await api(`/operations/purchase-orders/${order._id}/receive`, { method: 'POST', body: { items } });
      await onSaved(result);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return <Modal title="Scan and receive delivery" onClose={onClose} extraWide>
    <form className="receive-form" onSubmit={submit}>
      <div className="receive-order-summary"><span><small>PURCHASE ORDER</small><strong>{String(order._id).slice(-8).toUpperCase()}</strong></span><span><small>STATUS</small><strong>{order.status.replaceAll('_', ' ')}</strong></span><span><small>ITEMS</small><strong>{order.items.length}</strong></span></div>
      <div className="receive-scan-box">
        <label htmlFor="receive-barcode">Scan barcode</label>
        <div className="receive-scan-row"><input id="receive-barcode" ref={barcodeRef} value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scan(e.currentTarget.value); } }} placeholder="Scan barcode, then press Enter" autoComplete="off" /><button type="button" className="btn primary" disabled={busy || !barcode.trim()} onClick={() => scan()}>Add scan</button></div>
        <p className={error ? 'receive-feedback error' : 'receive-feedback'} role={error ? 'alert' : 'status'}>{error || notice}</p>
        <label className="receive-assign">If barcode is new, assign it to <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}><option value="">Choose a purchase order product…</option>{order.items.map((line) => { const id = String(line.productId); const product = catalog[id]; return <option key={id} value={id}>{product?.name || line.description || `Product ${id.slice(-6)}`} {product?.barcode ? `· ${product.barcode}` : '· no barcode saved'}</option>; })}</select></label>
      </div>
      <div className="receive-lines">
        <div className="receive-line-head"><span>Product</span><span>Ordered</span><span>Already received</span><span>Accepted now</span><span>Rejected</span></div>
        {order.items.map((line) => {
          const id = String(line.productId); const product = catalog[id]; const remaining = Number(line.orderedQty) - Number(line.acceptedQty || 0) - Number(line.rejectedQty || 0);
          return <div className="receive-line" key={id}>
            <div className="receive-product"><strong>{product?.name || line.description || `Product ${id.slice(-6)}`}</strong><small>{product?.barcode ? `Barcode ${product.barcode}` : 'Barcode not registered'}</small></div>
            <span>{line.orderedQty}</span><span>{Number(line.acceptedQty || 0) + Number(line.rejectedQty || 0)}</span>
            <input aria-label={`Accepted quantity for ${product?.name || id}`} type="number" min="0" max={remaining} step="any" value={accepted[id] ?? 0} onChange={(e) => setAccepted((current) => ({ ...current, [id]: e.target.value }))} />
            <input aria-label={`Rejected quantity for ${product?.name || id}`} type="number" min="0" max={remaining} step="any" value={rejected[id] ?? 0} onChange={(e) => setRejected((current) => ({ ...current, [id]: e.target.value }))} />
            {Number(rejected[id]) > 0 && <input className="receive-note" aria-label={`Discrepancy note for ${product?.name || id}`} value={notes[id] || ''} onChange={(e) => setNotes((current) => ({ ...current, [id]: e.target.value }))} placeholder="Explain damage or shortage" />}
          </div>;
        })}
      </div>
      <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Confirm received stock'}</button></div>
    </form>
  </Modal>;
}

export default function Operations() {
  const { user } = useAuth();
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const role = user?.role;
  const load = useCallback(async () => {
    const endpoints = {
      super_admin: ['branches', 'settings', 'registers', 'approvals', 'purchase-orders', 'expenses', 'refunds', 'stock-movements', 'audit-logs', 'staff', 'invoices', 'transfers'], admin: ['branches'], store_manager: ['registers', 'approvals', 'purchase-orders', 'expenses', 'refunds', 'stock-movements'],
      branch_supervisor: ['registers', 'approvals', 'purchase-orders', 'expenses', 'refunds', 'stock-movements', 'schedules'],
      cashier: ['registers', 'held-sales', 'attendance/mine'], inventory_manager: ['purchase-orders', 'stock-movements'], stock_receiver: ['purchase-orders'],
      warehouse_manager: ['purchase-orders', 'stock-movements', 'branches', 'transfers'], procurement_officer: ['suppliers', 'purchase-orders', 'invoices', 'supplier-quotes'],
      accountant: ['registers', 'expenses', 'refunds', 'invoices', 'reconciliations'], auditor: ['audit-logs', 'refunds', 'stock-movements', 'purchase-orders', 'invoices', 'reconciliations'],
      customer_service: ['complaints', 'customers'], loyalty_manager: ['customers', 'promotions'], hr_manager: ['staff', 'schedules', 'attendance'],
      support_technician: ['terminals'],
    }[role] || [];
    const results = await Promise.all(endpoints.map(async (key) => {
      try { return [key, await api(`/operations/${key}`)]; } catch (e) { return [key, { error: e.message }]; }
    }));
    setData(Object.fromEntries(results));
    if (['super_admin', 'admin'].includes(role)) {
      try { setUsers(await api('/auth/users')); } catch { setUsers([]); }
    }
  }, [role]);
  useEffect(() => { load(); }, [load]);

  async function submit(path, body, method = 'POST') {
    setError(''); setMessage('');
    try { await api(`/operations/${path}`, { method, body }); setMessage('Saved.'); await load(); }
    catch (e) { setError(e.message); }
  }
  async function decide(id, decision) { await submit(`approvals/${id}/decision`, { decision }); }
  async function openRegister(e) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    await submit('registers/open', { name: f.get('name'), openingFloat: Number(f.get('openingFloat')) }); form.reset();
  }
  async function closeRegister(row) {
    const count = window.prompt('Enter the cash counted in the register:');
    if (count !== null) await submit(`registers/${row._id}/close`, { closingCount: Number(count) });
  }

  const rows = (key) => Array.isArray(data[key]) ? data[key] : [];
  const canOperateTill = role === 'cashier' || (user?.salesAccess && ['store_manager', 'branch_supervisor'].includes(role));
  return <div className="page">
    <div className="page-head"><div className="page-title"><span className="eyebrow">STORE MANAGEMENT</span><h1>Operations</h1><p>{roleNames[role] || role} workspace · manage your daily operations.</p></div><button className="btn" onClick={load}>↻ &nbsp;Refresh</button></div>
    {error && <div className="alert">{error}</div>}{message && <div className="notice">{message}</div>}

    {canOperateTill && <>
      <section className="panel"><h3>Register session</h3><form className="inline-form" onSubmit={openRegister}>
        <label>Register name<input name="name" defaultValue="Till 1" required /></label><label>Opening float<input name="openingFloat" type="number" min="0" step="0.01" defaultValue="0" /></label><button className="btn primary">Open register</button>
      </form></section>
      <DataPanel title="Register sessions" rows={rows('registers')} onAction={(r) => r.status === 'open' && String(r.openedBy?.id) === String(user.id) ? <button className="btn sm" onClick={() => closeRegister(r)}>Close and reconcile</button> : null} />
    </>}
    {role === 'cashier' && <>
      <DataPanel title="Suspended sales" rows={rows('held-sales')} />
      <section className="panel"><h3>Attendance</h3>{!rows('attendance/mine').some((r) => !r.clockOut) ? <button className="btn primary" onClick={() => submit('attendance/clock-in', {})}>Clock in</button> : <button className="btn" onClick={() => submit(`attendance/${rows('attendance/mine').find((r) => !r.clockOut)._id}/clock-out`, {})}>Clock out</button>}<small>{rows('attendance/mine').length} recent shifts</small></section>
    </>}

    {['inventory_manager', 'store_manager', 'branch_supervisor'].includes(role) && <section className="panel"><h3>Stock adjustment request</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('stock/adjustments', { productId: f.get('productId'), quantity: Number(f.get('quantity')), reason: f.get('reason') }); e.currentTarget.reset(); }}>
      <label>Product ID<input name="productId" required /></label><label>Quantity change<input name="quantity" type="number" step="any" required /></label><label>Reason<input name="reason" required /></label><button className="btn primary">Submit adjustment</button>
    </form><small>Large adjustments are queued for approval.</small></section>}

    {['inventory_manager', 'store_manager', 'branch_supervisor', 'warehouse_manager'].includes(role) && <section className="panel"><h3>Stocktake</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('stocktakes', { counts: [{ productId: f.get('productId'), physicalQty: Number(f.get('physicalQty')) }] }); e.currentTarget.reset(); }}>
      <label>Product ID<input name="productId" required /></label><label>Physical quantity counted<input name="physicalQty" type="number" min="0" step="any" required /></label><button className="btn">Submit count for reconciliation</button>
    </form></section>}

    {role === 'super_admin' && <section className="panel"><h3>Add branch</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('branches', { name: f.get('name'), code: f.get('code'), address: f.get('address') }); e.currentTarget.reset(); }}>
      <label>Branch name<input name="name" required /></label><label>Branch code<input name="code" required /></label><label>Address<input name="address" /></label><button className="btn primary">Create branch</button>
    </form></section>}

    {role === 'super_admin' && <section className="panel"><h3>System configuration</h3><form className="inline-form" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); try { const value = JSON.parse(f.get('value')); await submit(`settings/${encodeURIComponent(f.get('key'))}`, { value }, 'PUT'); e.currentTarget.reset(); } catch (x) { setError(x instanceof SyntaxError ? 'Setting value must be valid JSON.' : x.message); } }}>
      <label>Setting key<input name="key" placeholder="paymentMethods, taxRates, backupSchedule" required /></label><label>Value (JSON)<input name="value" placeholder='["cash","card","mpesa"]' required /></label><button className="btn primary">Save setting</button>
    </form><small>Settings are recorded for configuration; external payment and backup services still need integration.</small></section>}

    {role === 'super_admin' && <><CreateStaffForm branches={rows('branches')} onCreated={load} /><section className="panel staff-access-note"><h3>Sales permissions</h3><p>Cashiers can sell automatically. Store managers and branch supervisors need explicit <strong>Sell access</strong>. Other staff roles cannot create sales.</p></section><DataPanel title="Staff accounts" rows={users} onAction={(u) => <div className="row-actions"><select aria-label={`Role for ${u.name}`} value={u.role === 'admin' ? 'super_admin' : u.role} onChange={async (e) => { try { await api(`/auth/users/${u._id}`, { method: 'PATCH', body: { role: e.target.value } }); await load(); } catch (x) { setError(x.message); } }}>{['super_admin','store_manager','cashier','inventory_manager','accountant','procurement_officer','auditor','customer_service','stock_receiver','branch_supervisor','hr_manager','warehouse_manager','loyalty_manager','support_technician'].map((r) => <option key={r} value={r}>{roleNames[r]}</option>)}</select><select aria-label={`Branch for ${u.name}`} value={u.branchId || ''} onChange={async (e) => { try { await api(`/auth/users/${u._id}`, { method: 'PATCH', body: { branchId: e.target.value || null } }); await load(); } catch (x) { setError(x.message); } }}><option value="">No branch</option>{rows('branches').map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select>{['cashier', 'store_manager', 'branch_supervisor'].includes(u.role) && <label className="sales-access-toggle"><input type="checkbox" checked={u.role === 'cashier' || u.salesAccess === true} disabled={u.role === 'cashier'} aria-label={`Sell access for ${u.name}`} onChange={async (e) => { try { await api(`/auth/users/${u._id}`, { method: 'PATCH', body: { salesAccess: e.target.checked } }); await load(); } catch (x) { setError(x.message); } }} /><span>{u.role === 'cashier' ? 'Cashier' : 'Sell access'}</span></label>}<button className="btn sm" onClick={async () => { try { await api(`/auth/users/${u._id}`, { method: 'PATCH', body: { active: !u.active } }); await load(); } catch (x) { setError(x.message); } }}>{u.active ? 'Deactivate' : 'Activate'}</button></div>} /></>}

    {role === 'procurement_officer' && <section className="panel"><h3>Register supplier</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('suppliers', { name: f.get('name'), email: f.get('email'), phone: f.get('phone'), address: f.get('address') }); e.currentTarget.reset(); }}>
      <label>Name<input name="name" required /></label><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" /></label><label>Address<input name="address" /></label><button className="btn primary">Save supplier</button>
    </form><h3>Create purchase order</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('purchase-orders', { supplierId: f.get('supplierId'), items: [{ productId: f.get('productId'), orderedQty: Number(f.get('orderedQty')), unitCost: Number(f.get('unitCost')) }], notes: f.get('notes') }); e.currentTarget.reset(); }}>
      <label>Supplier ID<input name="supplierId" required /></label><label>Product ID<input name="productId" required /></label><label>Quantity<input name="orderedQty" type="number" min="1" required /></label><label>Unit cost<input name="unitCost" type="number" min="0" step="0.01" required /></label><label>Notes<input name="notes" /></label><button className="btn primary">Request approval</button>
    </form><h3>Record supplier quote</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('supplier-quotes', { supplierId: f.get('supplierId'), reference: f.get('reference'), validUntil: f.get('validUntil') || undefined, items: [{ productId: f.get('productId'), quantity: Number(f.get('quantity')), unitCost: Number(f.get('unitCost')) }], notes: f.get('notes') }); e.currentTarget.reset(); }}>
      <label>Supplier ID<input name="supplierId" required /></label><label>Quote reference<input name="reference" /></label><label>Valid until<input name="validUntil" type="date" /></label><label>Product ID<input name="productId" required /></label><label>Quantity<input name="quantity" type="number" min="1" required /></label><label>Unit price<input name="unitCost" type="number" min="0" step="0.01" required /></label><button className="btn">Save quote</button>
    </form></section>}

    {['procurement_officer', 'accountant'].includes(role) && <DataPanel title="Supplier invoices" rows={rows('invoices')} onAction={(o) => role === 'procurement_officer' && !o.invoiceNumber ? <button className="btn sm" onClick={() => { const number = window.prompt('Supplier invoice number'); const amount = Number(window.prompt('Invoice total')); if (number && amount > 0) submit(`purchase-orders/${o._id}/invoice`, { invoiceNumber: number, invoiceAmount: amount }); }}>Record invoice</button> : role === 'accountant' && o.invoiceAmount > o.paidAmount ? <button className="btn sm" onClick={() => { const amount = Number(window.prompt(`Outstanding balance: ${o.invoiceAmount - o.paidAmount}`)); if (amount > 0) submit(`invoices/${o._id}/payment`, { amount }); }}>Record payment</button> : null} />}

    {role === 'stock_receiver' && <DataPanel title="Approved deliveries" rows={rows('purchase-orders').filter((x) => ['approved', 'partially_received'].includes(x.status))} onAction={(o) => <button className="btn sm primary" onClick={() => setReceiveOrder(o)}>Scan & receive</button>} />}

    {role === 'warehouse_manager' && <section className="panel"><h3>Request branch transfer</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('transfers', { fromBranchId: user.branchId, toBranchId: f.get('toBranchId'), items: [{ productId: f.get('productId'), quantity: Number(f.get('quantity')) }] }); e.currentTarget.reset(); }}>
      <label>Destination branch<select name="toBranchId" required>{rows('branches').filter((b) => b._id !== user.branchId).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label><label>Product ID<input name="productId" required /></label><label>Quantity<input name="quantity" type="number" min="1" required /></label><button className="btn primary">Request transfer</button>
    </form></section>}

    {['store_manager', 'branch_supervisor', 'super_admin'].includes(role) && <DataPanel title="Awaiting approval" rows={rows('approvals')} onAction={(a) => <div className="row-actions"><button className="btn sm primary" onClick={() => decide(a._id, 'approved')}>Approve</button><button className="btn sm danger" onClick={() => decide(a._id, 'rejected')}>Reject</button></div>} />}
    {['store_manager', 'branch_supervisor', 'super_admin'].includes(role) && <DataPanel title="Expense approvals" rows={rows('expenses').filter((x) => x.status === 'pending')} onAction={(x) => <div className="row-actions"><button className="btn sm primary" onClick={() => submit(`expenses/${x._id}/approve`, { decision: 'approved' })}>Approve</button><button className="btn sm danger" onClick={() => submit(`expenses/${x._id}/approve`, { decision: 'rejected' })}>Reject</button></div>} />}

    {['accountant', 'store_manager'].includes(role) && <section className="panel"><h3>Record expense</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('expenses', { description: f.get('description'), category: f.get('category'), amount: Number(f.get('amount')) }); e.currentTarget.reset(); }}>
      <label>Description<input name="description" required /></label><label>Category<input name="category" /></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><button className="btn primary">Submit expense</button>
    </form></section>}

    {role === 'accountant' && <section className="panel"><h3>Reconcile payment provider or register</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('reconciliations', { paymentMethod: f.get('paymentMethod'), periodStart: f.get('periodStart'), periodEnd: f.get('periodEnd'), actualAmount: Number(f.get('actualAmount')), notes: f.get('notes') }); e.currentTarget.reset(); }}>
      <label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option></select></label><label>Period start<input name="periodStart" type="datetime-local" required /></label><label>Period end<input name="periodEnd" type="datetime-local" required /></label><label>Actual amount counted/settled<input name="actualAmount" type="number" min="0" step="0.01" required /></label><label>Notes<input name="notes" /></label><button className="btn primary">Reconcile</button>
    </form></section>}

    {role === 'customer_service' && <section className="panel"><h3>Register customer</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('customers', { name: f.get('name'), email: f.get('email'), phone: f.get('phone') }); e.currentTarget.reset(); }}>
      <label>Name<input name="name" required /></label><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" /></label><button className="btn primary">Create customer</button>
    </form><h3>Log customer complaint</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('complaints', { message: f.get('message'), customerId: f.get('customerId') || undefined }); e.currentTarget.reset(); }}>
      <label>Customer ID (optional)<input name="customerId" /></label><label>Complaint<input name="message" required /></label><button className="btn primary">Save complaint</button>
    </form></section>}

    {role === 'loyalty_manager' && <section className="panel"><h3>Create promotion or coupon</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('promotions', { name: f.get('name'), description: f.get('description'), startsAt: f.get('startsAt') || undefined, endsAt: f.get('endsAt') || undefined, pointsMultiplier: Number(f.get('pointsMultiplier')) || 1, couponCode: f.get('couponCode') || undefined, discountType: f.get('discountType'), discountValue: Number(f.get('discountValue')) || 0, minSubtotal: Number(f.get('minSubtotal')) || 0, maxDiscount: f.get('maxDiscount') || undefined, usageLimit: f.get('usageLimit') || undefined }); e.currentTarget.reset(); }}>
      <label>Name<input name="name" required /></label><label>Description<input name="description" /></label><label>Starts at (optional)<input name="startsAt" type="datetime-local" /></label><label>Ends at (optional)<input name="endsAt" type="datetime-local" /></label><label>Points multiplier<input name="pointsMultiplier" type="number" min="1" defaultValue="1" /></label><label>Coupon code (optional)<input name="couponCode" placeholder="SAVE10" /></label><label>Discount type<select name="discountType"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label>Discount value<input name="discountValue" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Minimum spend<input name="minSubtotal" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Maximum saving (optional)<input name="maxDiscount" type="number" min="0" step="0.01" /></label><label>Total uses (optional)<input name="usageLimit" type="number" min="1" step="1" /></label><button className="btn primary">Create promotion</button>
    </form><h3>Adjust customer points</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit(`customers/${f.get('customerId')}/points`, { points: Number(f.get('points')) }); e.currentTarget.reset(); }}>
      <label>Customer ID<input name="customerId" required /></label><label>Points (+ earn / − redeem)<input name="points" type="number" step="1" required /></label><button className="btn primary">Update points</button>
    </form></section>}

    {role === 'support_technician' && <section className="panel"><h3>Register terminal</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('terminals', { name: f.get('name'), status: f.get('status'), notes: f.get('notes') }); e.currentTarget.reset(); }}>
      <label>Terminal name<input name="name" required /></label><label>Status<select name="status"><option>online</option><option>offline</option><option>maintenance</option></select></label><label>Notes<input name="notes" /></label><button className="btn primary">Save terminal</button>
    </form></section>}

    {role === 'hr_manager' && <><DataPanel title="Employee directory" rows={rows('staff')} /><section className="panel"><h3>Create staff schedule</h3><form className="inline-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); submit('schedules', { userId: f.get('userId'), start: f.get('start'), end: f.get('end'), notes: f.get('notes') }); e.currentTarget.reset(); }}>
      <label>Employee ID<input name="userId" required /></label><label>Start<input name="start" type="datetime-local" required /></label><label>End<input name="end" type="datetime-local" required /></label><label>Notes<input name="notes" /></label><button className="btn primary">Save schedule</button>
    </form></section></>}
    {data.registers && <DataPanel title="Register sessions and close reports" rows={rows('registers')} />}
    {data['purchase-orders'] && role !== 'stock_receiver' && <DataPanel title="Purchase orders" rows={rows('purchase-orders')} />}
    {data.transfers && <DataPanel title="Branch stock transfers" rows={rows('transfers')} onAction={(t) => t.status === 'pending_approval' && <button className="btn sm" onClick={() => submit(`transfers/${t._id}/approve`, {})}>Approve</button> || t.status === 'approved' && <button className="btn sm" onClick={() => submit(`transfers/${t._id}/dispatch`, {})}>Dispatch</button> || t.status === 'shipped' && <button className="btn sm" onClick={() => submit(`transfers/${t._id}/receive`, {})}>Confirm receipt</button>} />}
    {data.suppliers && <DataPanel title="Suppliers" rows={rows('suppliers')} />}
    {data['supplier-quotes'] && <DataPanel title="Supplier quotations" rows={rows('supplier-quotes')} />}
    {data.expenses && <DataPanel title="Expenses" rows={rows('expenses')} />}
    {data.refunds && <DataPanel title="Refund records" rows={rows('refunds')} />}
    {data.reconciliations && <DataPanel title="Payment reconciliation records" rows={rows('reconciliations')} />}
    {data['stock-movements'] && <DataPanel title="Stock movement history" rows={rows('stock-movements')} />}
    {data['audit-logs'] && <DataPanel title="Read-only audit log" rows={rows('audit-logs')} />}
    {data.complaints && <DataPanel title="Customer complaints" rows={rows('complaints')} onAction={(c) => c.status !== 'resolved' && <button className="btn sm" onClick={() => submit(`complaints/${c._id}`, { status: 'resolved' }, 'PATCH')}>Resolve</button>} />}
    {data.customers && <DataPanel title="Loyalty customers" rows={rows('customers')} />}
    {data.promotions && <DataPanel title="Promotions" rows={rows('promotions')} />}
    {data.staff && role !== 'hr_manager' && <DataPanel title="Employee directory" rows={rows('staff')} />}
    {data.schedules && <DataPanel title="Staff schedules" rows={rows('schedules')} />}
    {data.attendance && <DataPanel title="Attendance" rows={rows('attendance')} />}
    {data.terminals && <DataPanel title="Terminal status" rows={rows('terminals')} onAction={(t) => <select value={t.status} onChange={(e) => submit(`terminals/${t._id}`, { status: e.target.value, notes: t.notes }, 'PATCH')}><option>online</option><option>offline</option><option>maintenance</option></select>} />}
    {data.branches && <DataPanel title="Branches" rows={rows('branches')} onAction={(b) => role === 'super_admin' && <button className="btn sm" onClick={() => submit(`branches/${b._id}`, { active: !b.active }, 'PATCH')}>{b.active ? 'Deactivate' : 'Activate'}</button>} />}
    {data.settings && <DataPanel title="System settings" rows={rows('settings')} />}
    {receiveOrder && <ReceiveOrder order={receiveOrder} onClose={() => setReceiveOrder(null)} onSaved={async (result) => { setReceiveOrder(null); setMessage(result.approvalRequired ? 'Receipt discrepancy sent for manager approval.' : 'Stock received and recorded.'); await load(); }} />}
  </div>;
}
