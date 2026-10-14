import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { STORE_NAME } from '../api.js';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-showcase">
        <div className="login-brand"><span className="brand-mark">T</span><strong>Till</strong></div>
        <div className="showcase-copy"><span className="eyebrow light">SMARTER STORE OPERATIONS</span><h1>Your store,<br />in good hands.</h1><p>A clear view of every sale, every shelf, and every shift. Welcome to {STORE_NAME}.</p></div>
        <div className="showcase-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="receipt-art"><span /><span /><span /><b /></div><div className="art-spark">✳</div></div>
        <div className="showcase-foot"><span>RETAIL MANAGEMENT</span><span>SECURE STAFF ACCESS</span></div>
      </section>
      <section className="login-main">
        <form className="login-card" onSubmit={submit}>
          <div className="login-form-brand"><span className="brand-mark">T</span><span><strong>Till</strong><small>{STORE_NAME}</small></span></div>
          <span className="eyebrow">STAFF PORTAL</span>
          <div><h2>Welcome back</h2><p className="muted">Sign in to continue to your workspace.</p></div>
          <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" placeholder="you@store.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password" required /></label>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : <>Sign in <span aria-hidden="true">→</span></>}</button>
          <small className="login-note"><span>▣</span> Your account is protected with secure access.</small>
        </form>
      </section>
    </div>
  );
}
