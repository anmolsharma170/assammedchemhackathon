'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Redirect based on role
      if (data.user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/seller');
      }
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="bg-glow-right"></div>
      <div className="glass-panel login-card">
        <div className="login-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <div className="logo-icon">🧪</div>
          </div>
          <h1>AasaMedChem</h1>
          <p className="login-subtitle">Inventory & Quotation Workspace</p>
        </div>

        {error && (
          <div className="alert-toast alert-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="form-control"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-control"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="credentials-tips">
          <p style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#ffffff' }}>Demo Accounts:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>
              <span className="role-pill admin" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginRight: '0.5rem' }}>Admin</span>
              <span>User: <code>admin</code> / Pass: <code>adminpassword</code></span>
            </div>
            <div>
              <span className="role-pill seller" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginRight: '0.5rem' }}>Seller</span>
              <span>User: <code>seller</code> / Pass: <code>sellerpassword</code></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
