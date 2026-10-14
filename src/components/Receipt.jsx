import { money, qtyFmt, STORE_ADDRESS, STORE_NAME, STORE_PHONE, STORE_TAX_ID } from '../api.js';

const PAY = { cash: 'Cash', card: 'Card', mpesa: 'M-Pesa' };

export default function Receipt({ sale }) {
  const itemCount = sale.items.reduce((count, item) => count + Number(item.qty || 0), 0);
  const date = new Date(sale.createdAt);
  return (
    <div className="paper print-area">
      <div className="paper-head">
        <span className="paper-brand-mark" aria-hidden="true">{STORE_NAME.slice(0, 1).toUpperCase()}</span>
        <strong>{STORE_NAME}</strong>
        <div className="paper-tagline">YOUR EVERYDAY SHOPPING, MADE EASY</div>
        {STORE_ADDRESS && <div>{STORE_ADDRESS}</div>}
        {STORE_PHONE && <div>Tel: {STORE_PHONE}</div>}
        {STORE_TAX_ID && <div>Tax ID: {STORE_TAX_ID}</div>}
        <div className="paper-document-title">SALES RECEIPT</div>
        <div className="paper-receipt-number">{sale.receiptNo}</div>
        <div>{date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
        <div>Served by {sale.cashier?.name || 'Store team'}</div>
        {sale.status !== 'completed' && <div className="stamp">{String(sale.status).replaceAll('_', ' ').toUpperCase()}</div>}
      </div>
      <div className="paper-section-label"><span>ITEM</span><span>AMOUNT</span></div>
      <div className="paper-lines">
        {sale.items.map((l, i) => (
          <div key={i} className="pl">
            <div className="pl-name">{l.name}</div>
            <div className="pl-total">{money(l.lineTotal)}</div>
            <div className="pl-sub">{qtyFmt(l.qty)} × {money(l.price)}{l.sku ? ` · SKU ${l.sku}` : ''}</div>
          </div>
        ))}
      </div>
      <div className="paper-sum">
        <div><span>Items</span><span>{qtyFmt(itemCount)}</span></div>
        <div><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div><span>{sale.couponCode ? `Coupon ${sale.couponCode}` : 'Discount'}</span><span>−{money(sale.discount)}</span></div>}
        <div><span>VAT included</span><span>{money(sale.tax)}</span></div>
        <div className="grand"><span>Total</span><span>{money(sale.total)}</span></div>
        <div><span>Payment method</span><span>{PAY[sale.paymentMethod] || sale.paymentMethod || '—'}</span></div>
        {sale.paymentMethod === 'cash' && <div><span>Cash received</span><span>{money(sale.amountTendered)}</span></div>}
        {sale.paymentMethod !== 'cash' && <div><span>Amount paid</span><span>{money(sale.amountTendered ?? sale.total)}</span></div>}
        {sale.change > 0 && <div><span>Change</span><span>{money(sale.change)}</span></div>}
        {sale.reference && <div className="paper-reference"><span>{sale.paymentMethod === 'mpesa' ? 'M-Pesa receipt code' : sale.paymentMethod === 'card' ? 'Pesapal receipt code' : 'Payment reference'}</span><span>{sale.reference}</span></div>}
      </div>
      <div className="paper-foot">
        <strong>Thank you for shopping with us</strong>
        <span>Please keep this receipt for questions about your purchase.</span>
        <span className="paper-receipt-number">{sale.receiptNo}</span>
        <span>We look forward to seeing you again.</span>
      </div>
    </div>
  );
}
