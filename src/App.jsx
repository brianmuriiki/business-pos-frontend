import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Sell from './pages/Sell.jsx';
import Products from './pages/Products.jsx';
import Sales from './pages/Sales.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Operations from './pages/Operations.jsx';
import { STORE_NAME } from './api.js';

function NavIcon({ name }) {
  const paths = {
    sell: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M7 9h10M7 13h3m3 0h4m-10 4h10" /></>,
    products: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 13l9 5 9-5M12 13v8" /></>,
    sales: <><path d="M4 19V5m0 14h17" /><path d="m7 15 4-4 3 2 6-7" /><path d="M16 6h4v4" /></>,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    operations: <><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3" /><path d="M2 14h4m4-6h4m4 8h4" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Shell({ children }) {
  const { user, logout, canSell, canViewProducts, canViewSales, canViewDashboard } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">T</span><span className="brand-copy"><strong>Till</strong><small>RETAIL POS</small></span></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav">
          {canSell && <NavLink to="/" end><NavIcon name="sell" />Sell</NavLink>}
          {canViewProducts && <NavLink to="/products"><NavIcon name="products" />Products</NavLink>}
          {canViewSales && <NavLink to="/sales"><NavIcon name="sales" />Sales</NavLink>}
          {canViewDashboard && <NavLink to="/dashboard"><NavIcon name="dashboard" />Dashboard</NavLink>}
          <NavLink to="/operations"><NavIcon name="operations" />Operations</NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="user-card"><span className="user-avatar">{user.name?.slice(0, 1)?.toUpperCase()}</span><span className="user-copy"><strong>{user.name}</strong><small>{String(user.role || '').replaceAll('_', ' ')}</small></span></div>
          <button className="signout" onClick={logout}><span>↪</span> Sign out</button>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar"><div><span className="topbar-kicker">STORE WORKSPACE</span><strong>{STORE_NAME}</strong></div><div className="topbar-right"><span className="session-indicator"><i /> Staff session</span><span className="topbar-date">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div></header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const { user, canSell, canViewProducts, canViewSales, canViewDashboard } = useAuth();
  if (!user) return <Login />;
  const fallback = canViewDashboard ? '/dashboard' : canViewProducts ? '/products' : '/operations';
  return (
    <Shell>
      <Routes>
        <Route path="/" element={canSell ? <Sell /> : <Navigate to={fallback} replace />} />
        <Route path="/products" element={canViewProducts ? <Products /> : <Navigate to={fallback} replace />} />
        <Route path="/sales" element={canViewSales ? <Sales /> : <Navigate to={fallback} replace />} />
        <Route path="/dashboard" element={canViewDashboard ? <Dashboard /> : <Navigate to={fallback} replace />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="*" element={<Navigate to={canSell ? '/' : fallback} replace />} />
      </Routes>
    </Shell>
  );
}
