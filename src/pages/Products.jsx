import { useCallback, useEffect, useRef, useState } from 'react';
import { api, money, qtyFmt } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

const blank = {
  name: '', barcode: '', sku: '', imageUrl: '', category: 'General', unit: 'pc',
  price: '', cost: '', taxRate: '0', stock: '0', reorderLevel: '10',
};

export default function Products() {
  const { isAdmin, canManageProducts, canAdjustStock } = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [edit, setEdit] = useState(null); // product or blank
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: '300' });
    if (q) p.set('q', q);
    if (low) p.set('lowStock', '1');
    try {
      setRows(await api(`/products?${p}`));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [q, low]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function adjust(p) {
    const v = window.prompt(`Change stock for ${p.name}.\nEnter +20 to add or -5 to remove:`);
    if (v === null || v === '') return;
    try {
      const reason = window.prompt('Reason for this stock adjustment:');
      if (!reason) return;
      const result = await api(`/products/${p._id}/stock`, { method: 'POST', body: { delta: Number(v), reason } });
      if (result.approvalRequired) setError(`Adjustment request ${result.approval._id} is waiting for manager approval.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(p) {
    if (!window.confirm(`Remove ${p.name} from the till? Past receipts are kept.`)) return;
    try {
      await api(`/products/${p._id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title"><span className="eyebrow">CATALOG & INVENTORY</span><h1>Products</h1><p>Manage product details, pricing, and stock availability.</p></div>
        <div className="tools">
          <input className="search" placeholder="Search name, SKU or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only
          </label>
          {canManageProducts && <button className="btn primary" onClick={() => setEdit({ ...blank })}>Add product</button>}
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Barcode</th><th>Category</th>
              <th className="num">Price</th><th className="num">Stock</th>
              {(canManageProducts || canAdjustStock) && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p._id}>
                <td><div className="product-name-cell"><ProductThumb product={p} /><span>{p.name}</span></div></td>
                <td className="muted">{p.barcode || '—'}</td>
                <td>{p.category}</td>
                <td className="num">{money(p.price)}</td>
                <td className="num">
                  <span className={`pill ${p.stock <= 0 ? 'bad' : p.stock <= p.reorderLevel ? 'warn' : ''}`}>
                    {qtyFmt(p.stock)} {p.unit}
                  </span>
                </td>
                {(canManageProducts || canAdjustStock) && (
                  <td className="row-actions">
                    {canAdjustStock && <button className="btn sm" onClick={() => adjust(p)}>Adjust stock</button>}
                    {canManageProducts && <button className="btn sm" onClick={() => setEdit({ ...p, taxRate: String(p.taxRate) })}>Edit</button>}
                    {isAdmin && <button className="btn sm danger" onClick={() => remove(p)}>Remove</button>}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="empty">No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {edit && <ProductForm initial={edit} isAdmin={isAdmin} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function ProductForm({ initial, isAdmin, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const barcodeRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api('/operations/branches').then(setBranches).catch(() => {}); }, []);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    let timer;
    async function startCamera() {
      try {
        if (!('BarcodeDetector' in window)) throw new Error('Camera barcode scanning is not supported in this browser. Use a USB scanner or enter the barcode manually.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video || cancelled) return;
        video.srcObject = stream;
        await video.play();
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = supported.filter((format) => ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'].includes(format));
        if (!formats.length) throw new Error('This camera cannot read common product barcodes. Use a USB scanner or enter the barcode manually.');
        const detector = new window.BarcodeDetector({ formats });
        const detect = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length) {
              setF((current) => ({ ...current, barcode: codes[0].rawValue }));
              setCameraOpen(false);
              setCameraError('Barcode scanned. Save the product to keep it.');
              requestAnimationFrame(() => barcodeRef.current?.focus());
              return;
            }
          } catch { /* wait for another camera frame */ }
          timer = window.setTimeout(detect, 160);
        };
        detect();
      } catch (e) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (!cancelled) { setCameraError(e.message || 'Could not open the camera. Check browser camera permission.'); setCameraOpen(false); }
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f };
      delete body._id; delete body.__v; delete body.createdAt; delete body.updatedAt; delete body.active;
      if (f._id) delete body.stock;
      if (!isAdmin) {
        if (f._id) delete body.price;
        delete body.cost; delete body.taxRate; delete body.stock; delete body.branchId;
      }
      if (f._id) await api(`/products/${f._id}`, { method: 'PUT', body });
      else await api('/products', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={f._id ? 'Edit product' : 'Add product'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <label className="span2">Name<input value={f.name} onChange={set('name')} required autoFocus /></label>
        <label className="span2">Product image URL<input type="url" value={f.imageUrl || ''} onChange={set('imageUrl')} placeholder="https://example.com/product.jpg" /></label>
        <label className="barcode-field">Barcode <span className="field-hint">Scan or enter manually</span><div className="barcode-entry"><input ref={barcodeRef} value={f.barcode || ''} onChange={(e) => { set('barcode')(e); setCameraError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="Scan or type barcode" autoComplete="off" /><button type="button" className="btn" onClick={() => { setCameraError(''); setCameraOpen(true); }}>Scan barcode</button></div><small>USB scanners work here too; press Save product after scanning.</small>{cameraError && <small className="barcode-feedback" role="status">{cameraError}</small>}</label>
        <label>SKU<input value={f.sku || ''} onChange={set('sku')} /></label>
        <label>Category<input value={f.category} onChange={set('category')} /></label>
        <label>Unit (pc, kg, L)<input value={f.unit} onChange={set('unit')} /></label>
        {isAdmin && branches.length > 0 && <label>Branch stock location<select value={f.branchId || ''} onChange={set('branchId')}><option value="">Shared catalog (no opening stock)</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label>}
        {(isAdmin || !f._id) && <label>Selling price (VAT included)<input type="number" step="0.01" min="0" value={f.price} onChange={set('price')} required />{!isAdmin && <small>Set the initial price here. Only an admin can change it after the product is created.</small>}</label>}
        {isAdmin && <label>Cost price<input type="number" step="0.01" min="0" value={f.cost} onChange={set('cost')} /></label>}
        {isAdmin && <label>
          VAT rate
          <select value={f.taxRate} onChange={set('taxRate')}>
            <option value="0">0% (exempt / zero-rated)</option>
            <option value="0.16">16% (standard)</option>
            <option value="0.08">8%</option>
          </select>
        </label>}
        {isAdmin && !f._id && <label>Opening stock<input type="number" step="any" min="0" value={f.stock} onChange={set('stock')} /><small>Later changes must use stock adjustment or receiving.</small></label>}
        <label>Reorder level<input type="number" step="any" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></label>
        {error && <div className="alert span2">{error}</div>}
        <div className="actions span2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>
      {cameraOpen && <div className="camera-scan-backdrop product-camera" role="dialog" aria-modal="true" aria-label="Scan product barcode"><section className="camera-scan-panel"><div className="page-head"><h2>Scan product barcode</h2><button type="button" className="btn" onClick={() => setCameraOpen(false)}>Close</button></div><video ref={videoRef} muted playsInline /><p className="muted">Hold the barcode inside the camera view. Allow camera access if prompted.</p></section></div>}
    </Modal>
  );
}

function ProductThumb({ product }) {
  return <span className="product-thumb">{product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}<span aria-hidden="true">{product.name?.slice(0, 1)?.toUpperCase() || '?'}</span></span>;
}
