import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_user'));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('pos-signout', out);
    return () => window.removeEventListener('pos-signout', out);
  }, []);

  async function login(email, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(user));
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    setUser(null);
  }

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const canSell = user?.role === 'cashier' || user?.salesAccess === true;
  const canViewProducts = ['admin', 'super_admin', 'cashier', 'store_manager', 'inventory_manager', 'procurement_officer', 'stock_receiver', 'branch_supervisor', 'warehouse_manager', 'accountant', 'auditor'].includes(user?.role);
  const canViewSales = ['admin', 'super_admin', 'cashier', 'store_manager', 'branch_supervisor', 'accountant', 'auditor', 'customer_service'].includes(user?.role);
  const canViewDashboard = ['admin', 'super_admin', 'store_manager', 'branch_supervisor', 'accountant', 'auditor'].includes(user?.role);
  const canManageProducts = ['admin', 'super_admin', 'inventory_manager'].includes(user?.role);
  const canAdjustStock = ['admin', 'super_admin', 'inventory_manager', 'store_manager', 'branch_supervisor'].includes(user?.role);
  const canVoidSale = ['admin', 'super_admin', 'store_manager', 'branch_supervisor'].includes(user?.role);
  const canRequestVoid = user?.role === 'cashier';
  const canRequestRefund = ['admin', 'super_admin', 'store_manager', 'branch_supervisor', 'customer_service', 'cashier'].includes(user?.role);
  return <AuthCtx.Provider value={{ user, login, logout, isAdmin, canSell, canViewProducts, canViewSales, canViewDashboard, canManageProducts, canAdjustStock, canVoidSale, canRequestVoid, canRequestRefund }}>{children}</AuthCtx.Provider>;
}
