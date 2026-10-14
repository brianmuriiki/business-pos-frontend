import { useEffect, useState } from 'react';
import { api, download, money, qtyFmt } from '../api.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/reports/summary?days=${days}`).then(setData).catch((e) => setError(e.message));
  }, [days]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  const max = Math.max(1, ...data.byDay.map((d) => d.total));
  const period = data.byDay.reduce((s, d) => s + d.total, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title"><span className="eyebrow">PERFORMANCE OVERVIEW</span><h1>Dashboard</h1><p>Track sales, stock, and team performance across your store.</p></div>
        <div className="tools"><button className="btn" onClick={() => download('/reports/export.csv', 'pos-sales.csv').catch((e) => setError(e.message))}>Export sales CSV</button><div className="seg">
          {[7, 14, 30].map((d) => (
            <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>
          ))}
        </div></div>
      </div>

      <div className="stats">
        <div className="stat stat-green"><span>Sales today</span><strong>{money(data.today.total)}</strong><small>Completed transactions</small></div>
        <div className="stat"><span>Receipts today</span><strong>{data.today.count}</strong><small>Sales completed today</small></div>
        <div className="stat"><span>Average basket</span><strong>{money(data.today.average)}</strong><small>Per receipt today</small></div>
        <div className="stat"><span>Last {days} days</span><strong>{money(period)}</strong><small>Total sales in period</small></div>
        <div className="stat"><span>Estimated gross profit</span><strong>{money(data.grossProfitEstimate)}</strong><small>Based on recorded cost</small></div>
        <div className="stat"><span>Refunds</span><strong>{money(data.refunds?.total)}</strong><small>Refund value in period</small></div>
        <div className="stat"><span>Approved expenses</span><strong>{money(data.approvedExpenses)}</strong><small>Operating expenses</small></div>
      </div>

      <div className="panel">
        <h3>Daily sales</h3>
        <div className="bars">
          {data.byDay.map((d) => (
            <div className="bar" key={d.date} title={`${d.date}: ${money(d.total)} (${d.count} sales)`}>
              <div className="bar-fill" style={{ height: `${(d.total / max) * 100}%` }} />
              <span>{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="two">
        <div className="panel">
          <h3>Cashier performance</h3>
          {!data.cashierPerformance?.length && <p className="muted">No cashier sales for this period.</p>}
          {data.cashierPerformance?.map((c) => <div className="li" key={c._id}><span>{c._id}<small> · {c.receipts} receipts</small></span><strong>{money(c.sales)}</strong></div>)}
        </div>
        <div className="panel">
          <h3>Top products</h3>
          {!data.topProducts.length && <p className="muted">No sales in this period.</p>}
          {data.topProducts.map((p) => (
            <div className="li" key={p._id}>
              <span>{p._id}<small> · {qtyFmt(p.qty)} sold</small></span>
              <strong>{money(p.revenue)}</strong>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Slow moving products</h3>
          {!data.slowProducts?.length && <p className="muted">No sales in this period.</p>}
          {data.slowProducts?.map((p) => <div className="li" key={p._id}><span>{p._id}<small> · {qtyFmt(p.qty)} sold</small></span><strong>{money(p.revenue)}</strong></div>)}
        </div>
        <div className="panel">
          <h3>Needs restocking</h3>
          {!data.lowStock.length && <p className="muted">Everything is above its reorder level.</p>}
          {data.lowStock.map((p) => (
            <div className="li" key={p._id}>
              <span>{p.name}</span>
              <span className={`pill ${p.stock <= 0 ? 'bad' : 'warn'}`}>{qtyFmt(p.stock)} {p.unit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
