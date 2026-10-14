import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';
import Receipt from '../components/Receipt.jsx';

const PAY = { cash: 'Cash', card: 'Card', mpesa: 'M-Pesa' };

export default function Sales() {
  const { canVoidSale, canRequestVoid, canRequestRefund } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api('/sales?limit=100'));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function voidSale(s) {
    if (!window.confirm(`Void ${s.receiptNo}? Items go back into stock.`)) return;
    try {
      const updated = await api(`/sales/${s._id}/void`, { method: 'POST' });
      setOpen(updated);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function requestVoid(s) {
    const reason = window.prompt('Why should this sale be voided?');
    if (!reason) return;
    try { await api(`/sales/${s._id}/void`, { method: 'POST', body: { reason } }); setError('Void request sent for manager approval.'); load(); }
    catch (e) { setError(e.message); }
  }

  async function requestRefund(s) {
    const line = s.items?.[0];
    if (!line) return;
    const qty = Number(window.prompt(`Quantity to refund for ${line.name} (max ${line.qty}):`, '1'));
    if (!(qty > 0)) return;
    const reason = window.prompt('Reason for the refund:');
    if (!reason) return;
    try {
      const approval = await api(`/sales/${s._id}/refunds`, { method: 'POST', body: { items: [{ productId: line.product, quantity: qty }], reason } });
      setError(`Refund request ${approval._id} sent for manager approval.`);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="page">
      <div className="page-head"><div className="page-title"><span className="eyebrow">TRANSACTION HISTORY</span><h1>Sales</h1><p>Review receipts, payment details, and transaction status.</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Receipt</th><th>Time</th><th>Cashier</th><th>Payment</th><th className="num">Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s._id} className="click" onClick={() => setOpen(s)}>
                <td>{s.receiptNo}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td>{s.cashier?.name}</td>
                <td>{PAY[s.paymentMethod] || s.paymentMethod}</td>
                <td className="num">{money(s.total)}</td>
                <td><span className={`pill ${s.status === 'voided' ? 'bad' : ''}`}>{s.status}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="empty">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title="Receipt" onClose={() => setOpen(null)}>
          <Receipt sale={open} />
          <div className="actions">
            {canVoidSale && open.status === 'completed' && (
              <button className="btn danger" onClick={() => voidSale(open)}>Void sale</button>
            )}
            {canRequestVoid && open.status === 'completed' && <button className="btn danger" onClick={() => requestVoid(open)}>Request void</button>}
            {canRequestRefund && !['voided', 'refunded'].includes(open.status) && <button className="btn" onClick={() => requestRefund(open)}>Request refund</button>}
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
