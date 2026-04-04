import React, { FormEvent, useState } from 'react';

type LoginPanelProps = {
  loading: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
};

export default function LoginPanel({ loading, error, onSubmit }: LoginPanelProps) {
  // Login form state.
  const [email, setEmail] = useState('admin@example.local');
  const [password, setPassword] = useState('AdminPass123!');
  // Submit login request.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(email.trim(), password);
  }

  return (
    <section className="panel login-panel">
      <div className="panel-heading">
        <p className="eyebrow">Authentication</p>
        <h2>Enter the workspace</h2>
        <p className="panel-copy">
          Sign in with the seeded admin account or any user provisioned through the backend.
        </p>
      </div>

      <form className="stack-form" onSubmit={handleSubmit}>
        <label>
          <span>Email</span>
          <input
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.local"
            required
            type="email"
          />
        </label>

        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="AdminPass123!"
            required
            type="password"
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}