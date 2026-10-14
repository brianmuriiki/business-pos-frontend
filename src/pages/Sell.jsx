import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, money, qtyFmt } from '../api.js';
import Modal from '../components/Modal.jsx';
import Receipt from '../components/Receipt.jsx';
import { useAuth } from '../auth.jsx';

const hue = (s = '') => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function Sell() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]); // [{ product, qty }]
  const [discount, setDiscount] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [toast, setToast] = useState(null);
  const [heldSales, setHeldSales] = useState([]);
  const [cameraScanner, setCameraScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const searchRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const say = useCallback((text, kind = 'info') => {
    setToast({ text, kind });
    clearTimeout(say.t);
    say.t = setTimeout(() => setToast(null), 3000);
  }, []);

  const loadProducts = useCallback(async () => {
    const params = new URLSearchParams({ limit: '80' });
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    try {
      setProducts(await api(`/products?${params}`));
    } catch (e) {
      say(e.message, 'error');
    }
  }, [q, category, say]);

  useEffect(() => {
    const t = setTimeout(loadProducts, 180);
    return () => clearTimeout(t);
  }, [loadProducts]);

  useEffect(() => {
    api('/products/categories').then(setCategories).catch(() => {});
  }, []);

  const loadHeldSales = useCallback(async () => {
    if (user?.role !== 'cashier') return;
    try { setHeldSales(await api('/operations/held-sales')); } catch { /* register/account setup may still be in progress */ }
  }, [user?.role]);
  useEffect(() => { loadHeldSales(); }, [loadHeldSales]);

  async function suspendSale() {
    try {
      await api('/operations/held-sales', { method: 'POST', body: { items: cart.map((l) => ({ productId: l.product._id, qty: l.qty })), discount: totals.disc } });
      setCart([]); setDiscount(''); await loadHeldSales(); say('Sale suspended.');
    } catch (e) { say(e.message, 'error'); }
  }

  async function resumeSale(held) {
    try {
      const all = await api('/products?active=all&limit=500');
      const productsById = new Map(all.map((p) => [p._id, p]));
      const resumed = held.items.map((line) => ({ product: productsById.get(line.productId), qty: line.qty })).filter((line) => line.product);
      if (!resumed.length) return say('The suspended sale has no available products.', 'error');
      await api(`/operations/held-sales/${held._id}`, { method: 'DELETE' });
      setCart(resumed); setDiscount(String(held.discount || '')); await loadHeldSales();
    } catch (e) { say(e.message, 'error'); }
  }

  function add(p, by = 1) {
    if (p.stock <= 0) return say(`${p.name} is out of stock`, 'error');
    setCart((c) => {
      const i = c.findIndex((l) => l.product._id === p._id);
      if (i === -1) return [...c, { product: p, qty: Math.min(by, p.stock) }];
      const next = [...c];
      const qty = next[i].qty + by;
      if (qty > p.stock) say(`Only ${qty - by} of ${p.name} in stock`, 'error');
      next[i] = { ...next[i], qty: Math.min(qty, p.stock) };
      return next;
    });
  }

  function setQty(id, qty) {
    setCart((c) =>
      c.flatMap((l) => {
        if (l.product._id !== id) return [l];
        if (!(qty > 0)) return [];
        return [{ ...l, qty: Math.min(qty, l.product.stock) }];
      })
    );
  }

  async function addBarcode(code) {
    const barcode = String(code || '').trim();
    if (!barcode) return;
    try {
      const p = await api(`/products/barcode/${encodeURIComponent(barcode)}`);
      add(p);
      setQ('');
      setScanError('');
      searchRef.current?.focus();
    } catch (e) {
      say(e.message || 'No product with that barcode', 'error');
      setQ('');
      searchRef.current?.focus();
    }
  }

  // Most USB/Bluetooth POS scanners act as a keyboard and send Enter after the code.
  async function onSearchKey(e) {
    if (e.key !== 'Enter' || !e.currentTarget.value.trim()) return;
    const code = e.currentTarget.value.trim();
    try {
      const p = await api(`/products/barcode/${encodeURIComponent(code)}`);
      add(p);
      setQ('');
    } catch {
      say('No product with that barcode. Check the code or choose a product from the list.', 'error');
    }
  }

  useEffect(() => {
    if (!cameraScanner) return undefined;
    let cancelled = false;
    let timer;
    async function start() {
      try {
        if (!('BarcodeDetector' in window)) throw new Error('Camera scanning is not supported in this browser. Use a USB/Bluetooth scanner or type the barcode.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        cameraStreamRef.current = stream;
        const video = videoRef.current;
        if (!video || cancelled) return;
        video.srcObject = stream;
        await video.play();
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = supported.filter((format) => ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'].includes(format));
        if (!formats.length) throw new Error('This browser cannot read common product barcode formats. Use a USB/Bluetooth scanner.');
        const detector = new window.BarcodeDetector({ formats });
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const matches = await detector.detect(videoRef.current);
            if (matches.length) {
              setCameraScanner(false);
              await addBarcode(matches[0].rawValue);
              return;
            }
          } catch { /* wait for the next camera frame */ }
          timer = window.setTimeout(scan, 160);
        };
        scan();
      } catch (e) {
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        if (!cancelled) {
          setScanError(e.message || 'Could not open the camera. Check browser camera permission.');
          setCameraScanner(false);
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraScanner]);

  const totals = useMemo(() => {
    const subtotal = round2(cart.reduce((s, l) => s + l.product.price * l.qty, 0));
    const disc = Math.min(Math.max(round2(Number(discount) || 0), 0), subtotal);
    const gross = cart.reduce((s, l) => s + (l.product.price * l.qty * l.product.taxRate) / (1 + l.product.taxRate), 0);
    const tax = round2(subtotal ? gross * (1 - disc / subtotal) : 0);
    return { subtotal, disc, tax, total: round2(subtotal - disc), count: cart.reduce((s, l) => s + l.qty, 0) };
  }, [cart, discount]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') (e.preventDefault(), searchRef.current?.focus());
      if (e.key === 'F4' && cart.length && !payOpen && !receipt) (e.preventDefault(), setPayOpen(true));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart.length, payOpen, receipt]);

  function finished(sale) {
    setPayOpen(false);
    setReceipt(sale);
    setCart([]);
    setDiscount('');
    loadProducts();
  }

  function newSale() {
    setReceipt(null);
    searchRef.current?.focus();
  }

  return (
    <div className="sell">
      <section className="catalog">
        <div className="scanbar">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Scan a barcode or search by name  (F2)"
            autoFocus
            aria-label="Scan or search"
          />
          <button className="btn" type="button" onClick={() => { setScanError(''); setCameraScanner(true); }}>Use camera</button>
        </div>
        {scanError && <div className="alert scan-error" role="alert">{scanError}</div>}
        <div className="chips" role="tablist">
          <button className={`chip ${!category ? 'on' : ''}`} onClick={() => setCategory('')}>All</button>
          {categories.map((c) => (
            <button key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="grid">
          {products.map((p) => (
            <button
              key={p._id}
              className={`tile ${p.stock <= 0 ? 'out' : ''}`}
              style={{ '--cat': `hsl(${hue(p.category)} 45% 42%)` }}
              onClick={() => add(p)}
            >
              <span className="tile-image"><span aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>{p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</span>
              <span className="tile-name">{p.name}</span>
              <span className="tile-price">{money(p.price)}</span>
              <span className={`tile-stock ${p.stock <= p.reorderLevel ? 'low' : ''}`}>
                {p.stock <= 0 ? 'Out of stock' : `${qtyFmt(p.stock)} ${p.unit} left`}
              </span>
            </button>
          ))}
          {!products.length && <p className="empty">No products match. Try a different search or category.</p>}
        </div>
      </section>

      <aside className="till">
        <div className="slip">
          <div className="slip-head">
            <h2>Current sale</h2>
            {cart.length > 0 && (
              <div className="row-actions"><button className="btn ghost sm" onClick={() => setCart([])}>Clear</button>{user?.role === 'cashier' && <button className="btn sm" onClick={suspendSale}>Suspend</button>}</div>
            )}
          </div>
          {user?.role === 'cashier' && heldSales.length > 0 && <div className="held-list"><small>Suspended sales</small>{heldSales.map((held) => <button className="btn sm" key={held._id} onClick={() => resumeSale(held)}>Resume · {new Date(held.createdAt).toLocaleTimeString()}</button>)}</div>}
          <div className="slip-lines">
            {!cart.length && <p className="empty">Scan an item or tap a product to start.</p>}
            {cart.map((l) => (
              <div className="line" key={l.product._id}>
                <div className="line-main">
                  <div className="line-name">{l.product.name}</div>
                  <div className="line-sub">{money(l.product.price)} / {l.product.unit}</div>
                </div>
                <div className="stepper">
                  <button onClick={() => setQty(l.product._id, l.qty - 1)} aria-label="Decrease">−</button>
                  <input
                    value={l.qty}
                    inputMode="decimal"
                    onChange={(e) => setQty(l.product._id, Number(e.target.value))}
                    aria-label={`Quantity of ${l.product.name}`}
                  />
                  <button onClick={() => setQty(l.product._id, l.qty + 1)} aria-label="Increase">+</button>
                </div>
                <div className="line-total">{money(l.product.price * l.qty)}</div>
              </div>
            ))}
          </div>
          <div className="slip-sum">
            <div className="row"><span>Items</span><span>{qtyFmt(totals.count)}</span></div>
            <div className="row"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
            <div className="row">
              <span>Discount</span>
              <input
                className="disc"
                value={discount}
                inputMode="decimal"
                placeholder="0.00"
                onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                aria-label="Discount amount"
              />
            </div>
            <div className="row muted"><span>VAT included</span><span>{money(totals.tax)}</span></div>
            <div className="total"><span>Total</span><span>{money(totals.total)}</span></div>
          </div>
          <button className="btn pay" disabled={!cart.length} onClick={() => setPayOpen(true)}>
            Charge {money(totals.total)} <kbd>F4</kbd>
          </button>
          <div className="zigzag" />
        </div>
      </aside>

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}

      {cameraScanner && <div className="camera-scan-backdrop" role="dialog" aria-modal="true" aria-label="Scan product barcode">
        <section className="camera-scan-panel">
          <div className="page-head"><h2>Scan product barcode</h2><button className="btn" onClick={() => { setCameraScanner(false); searchRef.current?.focus(); }}>Close</button></div>
          <video ref={videoRef} muted playsInline />
          <p className="muted">Hold the barcode inside the camera view. Camera access requires HTTPS or localhost.</p>
        </section>
      </div>}

      {payOpen && (
        <PayModal
          cart={cart}
          totals={totals}
          branchId={user?.branchId}
          onClose={() => setPayOpen(false)}
          onDone={finished}
        />
      )}

      {receipt && (
        <Modal title="Sale complete" onClose={newSale}>
          <Receipt sale={receipt} />
          <div className="actions">
            <button className="btn" onClick={() => window.print()}>Print receipt</button>
            <button className="btn primary" onClick={newSale}>New sale</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PayModal({ cart, totals, branchId, onClose, onDone }) {
  const [method, setMethod] = useState('cash');
  const [methods, setMethods] = useState(['cash', 'card', 'mpesa']);
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [approvalState, setApprovalState] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaAttempt, setMpesaAttempt] = useState(null);
  const [mpesaState, setMpesaState] = useState('');
  const [mpesaStartedAt, setMpesaStartedAt] = useState(0);
  const mpesaLocked = mpesaAttempt && ['pending', 'paid'].includes(mpesaAttempt.status);
  const [cardIntent, setCardIntent] = useState(null);
  const [cardState, setCardState] = useState('');
  const cardLocked = cardIntent && ['pending', 'verified'].includes(cardIntent.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const discount = appliedCoupon?.discount ?? totals.disc;
  const total = round2(totals.subtotal - discount);
  const paid = method === 'cash' ? Number(tendered) || 0 : total;
  const change = round2(paid - total);
  const quick = [...new Set([total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000])];
  const needsRef = method !== 'cash';
  const needsDiscountApproval = !appliedCoupon && totals.disc > totals.subtotal * 0.05;
  const ok = method === 'cash' ? paid >= total : method === 'mpesa' ? mpesaAttempt?.status === 'paid' : cardIntent?.status === 'verified';

  useEffect(() => { api('/operations/payment-methods').then((list) => { if (Array.isArray(list) && list.length) { setMethods(list); if (!list.includes(method)) setMethod(list[0]); } }).catch(() => {}); }, []);

  useEffect(() => {
    if (!mpesaAttempt?.paymentId || !['pending', 'initiated'].includes(mpesaAttempt.status)) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const status = await api(`/payments/mpesa/${mpesaAttempt.paymentId}`);
        if (cancelled) return;
        setMpesaAttempt(status);
        const takingLong = mpesaStartedAt && Date.now() - mpesaStartedAt > 120000;
        setMpesaState(status.resultDescription || (status.status === 'paid' ? 'Payment confirmed by Safaricom.' : takingLong ? 'Confirmation is taking longer than usual. Keep this window open; do not retry while the result is pending.' : 'Waiting for customer PIN confirmation…'));
        if (['pending', 'initiated'].includes(status.status)) timer = setTimeout(poll, takingLong ? 5000 : 2500);
      } catch (e) {
        if (!cancelled) { setMpesaState(e.message); timer = setTimeout(poll, 5000); }
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mpesaAttempt?.paymentId, mpesaAttempt?.status, mpesaStartedAt]);

  useEffect(() => {
    if (!cardIntent?.paymentId || cardIntent.status !== 'pending') return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const status = await api(`/payments/card/intents/${cardIntent.paymentId}`);
        if (cancelled) return;
        setCardIntent(status);
        setCardState(status.resultDescription || (status.status === 'verified' ? 'Payment verified by Pesapal.' : 'Waiting for the terminal payment…'));
        if (status.status === 'pending' && new Date(status.expiresAt).getTime() > Date.now()) timer = setTimeout(poll, 2500);
        else if (status.status === 'pending') setCardState('This checkout reference has expired. Contact your supervisor before retrying.');
      } catch (e) {
        if (!cancelled) { setCardState(e.message); timer = setTimeout(poll, 5000); }
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cardIntent?.paymentId, cardIntent?.status]);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const sale = await api('/sales', {
        method: 'POST',
        body: {
          items: cart.map((l) => ({ productId: l.product._id, qty: l.qty })),
          paymentMethod: method,
          amountTendered: method === 'cash' ? paid : undefined,
          reference: needsRef ? reference.trim() : undefined,
          discount,
          couponCode: appliedCoupon?.code,
          mpesaPaymentId: method === 'mpesa' ? mpesaAttempt?.paymentId : undefined,
          cardPaymentId: method === 'card' ? cardIntent?.paymentId : undefined,
          approvalId: approvalId || undefined,
          customerId: customerId.trim() || undefined,
        },
      });
      onDone(sale);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function requestDiscountApproval() {
    try {
      const request = await api('/operations/approvals/discount', { method: 'POST', body: { amount: totals.disc, reason: 'Checkout discount', branchId } });
      setApprovalId(request._id); setApprovalState('Pending manager approval');
    } catch (e) { setError(e.message); }
  }
  async function checkDiscountApproval() {
    try {
      const request = await api(`/operations/approvals/${approvalId}`);
      setApprovalState(request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Rejected' : 'Still pending');
    } catch (e) { setError(e.message); }
  }

  async function applyCoupon() {
    if (totals.disc > 0) { setError('Clear the manual discount before applying a coupon.'); return; }
    setCouponBusy(true); setError('');
    try {
      const quote = await api('/operations/coupons/validate', { method: 'POST', body: { code: couponInput, subtotal: totals.subtotal } });
      setAppliedCoupon(quote);
    } catch (e) { setError(e.message); }
    finally { setCouponBusy(false); }
  }

  async function startMpesaPayment() {
    setBusy(true); setError(''); setMpesaState('Sending payment request…');
    try {
      const attempt = await api('/payments/mpesa/stk-push', { method: 'POST', body: {
        phoneNumber: mpesaPhone,
        items: cart.map((line) => ({ productId: line.product._id, qty: line.qty })),
        discount,
        couponCode: appliedCoupon?.code,
        approvalId: approvalId || undefined,
      } });
      setMpesaStartedAt(Date.now()); setMpesaAttempt(attempt); setMpesaState(attempt.message || 'Check the customer phone to complete payment.');
    } catch (e) { setError(e.message); setMpesaState(''); }
    finally { setBusy(false); }
  }

  async function startCardPayment() {
    setBusy(true); setError(''); setCardState('Creating Pesapal terminal reference…'); setCardIntent(null);
    try {
      const intent = await api('/payments/card/intents', { method: 'POST', body: {
        items: cart.map((line) => ({ productId: line.product._id, qty: line.qty })),
        discount: totals.disc,
        couponCode: appliedCoupon?.code,
        approvalId: approvalId || undefined,
      } });
      setCardIntent(intent);
      setCardState(intent.instructions || 'Enter the exact amount and reference on the Pesapal terminal.');
    } catch (e) { setError(e.message); setCardState(''); }
    finally { setBusy(false); }
  }

  function closePayment() {
    if (mpesaAttempt && ['pending', 'paid'].includes(mpesaAttempt.status)) {
      setError('Resolve this M-Pesa payment before leaving checkout. The request may still complete on the customer phone.');
      return;
    }
    if (cardLocked) {
      setError('Resolve this Pesapal payment before leaving checkout.');
      return;
    }
    onClose();
  }

  return (
    <Modal title="Take payment" onClose={closePayment}>
      <div className="due">
        <span>Amount due</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="methods">
        {methods.map((k) => (
          <button key={k} className={`method ${method === k ? 'on' : ''}`} disabled={mpesaLocked || cardLocked} onClick={() => setMethod(k)}>
            {({ cash: 'Cash', mpesa: 'M-Pesa', card: 'Card' })[k] || k}
          </button>
        ))}
      </div>

      <div className="panel coupon-entry">
        <strong>Coupon</strong>
        {appliedCoupon ? <div className="actions"><span>{appliedCoupon.code} · saving {money(appliedCoupon.discount)}</span><button className="btn sm" disabled={mpesaLocked || cardLocked} onClick={() => { setAppliedCoupon(null); setCouponInput(''); }}>Remove</button></div> : <div className="actions"><input aria-label="Coupon code" disabled={mpesaLocked || cardLocked} value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && applyCoupon()} placeholder="Enter coupon code" /><button className="btn" disabled={mpesaLocked || cardLocked || !couponInput.trim() || couponBusy} onClick={applyCoupon}>{couponBusy ? 'Checking…' : 'Apply'}</button></div>}
        {appliedCoupon?.description && <small>{appliedCoupon.description}</small>}
        {totals.disc > 0 && !appliedCoupon && <small>Clear the manual discount to apply a coupon.</small>}
      </div>
      {discount > 0 && <div className="checkout-discount"><span>{appliedCoupon ? `Coupon ${appliedCoupon.code}` : 'Discount'}</span><strong>−{money(discount)}</strong></div>}

      {method === 'cash' ? (
        <>
          <label className="field">
            Cash received
            <input
              className="big-input"
              value={tendered}
              inputMode="decimal"
              autoFocus
              onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && ok && !busy && confirm()}
              placeholder="0.00"
            />
          </label>
          <div className="quick">
            {quick.map((v) => (
              <button key={v} className="btn" onClick={() => setTendered(String(v))}>{v === total ? 'Exact' : v.toLocaleString()}</button>
            ))}
          </div>
          <div className={`change ${change < 0 ? 'short' : ''}`}>
            <span>{change < 0 ? 'Still owed' : 'Change to give'}</span>
            <strong>{money(Math.abs(change))}</strong>
          </div>
        </>
      ) : method === 'mpesa' ? (
        <div className="mpesa-checkout panel">
          {!mpesaAttempt || mpesaAttempt.status === 'failed' ? <>
            <label className="field">Customer M-Pesa phone number<input className="big-input" value={mpesaPhone} inputMode="tel" onChange={(e) => setMpesaPhone(e.target.value)} placeholder="0712 345 678" /></label>
            {mpesaAttempt?.status === 'failed' && <div className="alert" role="status">{mpesaAttempt.resultDescription || 'Payment failed or was cancelled. You can retry.'}</div>}
            <button className="btn primary" disabled={!mpesaPhone.trim() || busy || needsDiscountApproval} onClick={startMpesaPayment}>{busy ? 'Sending…' : 'Send M-Pesa request'}</button>
          </> : <>
            <div className={`mpesa-status ${mpesaAttempt.status}`} role="status"><strong>{mpesaAttempt.status === 'paid' ? 'Payment received' : 'Waiting for M-Pesa'}</strong><span>{mpesaState}</span>{mpesaAttempt.receiptCode && <span>Receipt: {mpesaAttempt.receiptCode}</span>}</div>
            {mpesaAttempt.status === 'paid' && <p>Confirm the payment below to record the sale and print its receipt.</p>}
            {mpesaAttempt.status === 'pending' && <small>Keep this checkout open while the customer approves the request. Do not send another request while this one is pending.</small>}
          </>}
        </div>
      ) : (
        <div className="mpesa-checkout panel">
          {!cardIntent || cardIntent.status === 'failed' ? <>
            {cardIntent?.status === 'failed' && <div className="alert" role="status">{cardState || 'Payment was not verified. You can start a new terminal payment.'}</div>}
            <p>Use the Pesapal card terminal. The cashier enters the amount and reference shown here; the system waits for Pesapal to verify the transaction.</p>
            <button className="btn primary" disabled={busy || needsDiscountApproval} onClick={startCardPayment}>{busy ? 'Preparing…' : cardIntent ? 'Retry card payment' : 'Prepare card terminal payment'}</button>
          </> : <>
            <div className={`mpesa-status ${cardIntent.status === 'verified' ? 'paid' : 'pending'}`} role="status"><strong>{cardIntent.status === 'verified' ? 'Card payment verified' : 'Waiting for card payment'}</strong><span>{cardState}</span></div>
            <div className="card-terminal-details"><div><small>Amount to enter</small><strong>{money(cardIntent.amount)}</strong></div><div><small>Currency</small><strong>{cardIntent.currency}</strong></div><div><small>Merchant reference</small><strong>{cardIntent.merchantReference}</strong></div>{cardIntent.confirmationCode && <div><small>Pesapal receipt code</small><strong>{cardIntent.confirmationCode}</strong></div>}</div>
            {cardIntent.status === 'pending' && <small>Keep checkout open. Do not retry while the terminal payment is pending.</small>}
            {cardIntent.status === 'verified' && <p>Pesapal confirmed the card transaction. Confirm below to record the sale and print its receipt.</p>}
          </>}
        </div>
      )}

      {error && <div className="alert" role="alert">{error}</div>}
      <label className="field">Loyalty customer ID (optional)<input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Leave blank for guest checkout" /></label>
      {needsDiscountApproval && <div className="panel"><strong>Manager approval required for this discount</strong>
        <div className="actions"><button className="btn" onClick={requestDiscountApproval}>Request approval</button>{approvalId && <button className="btn" onClick={checkDiscountApproval}>Check approval</button>}</div>
        {approvalId && <small>Request {approvalId}: {approvalState}</small>}
        <label>Approval request ID<input value={approvalId} onChange={(e) => setApprovalId(e.target.value)} /></label>
      </div>}
      <div className="actions">
        <button className="btn" onClick={closePayment}>Back</button>
        <button className="btn primary lg" disabled={!ok || busy} onClick={confirm}>
          {busy ? 'Saving…' : ['mpesa', 'card'].includes(method) ? 'Confirm payment and sale' : 'Complete sale'}
        </button>
      </div>
    </Modal>
  );
}
