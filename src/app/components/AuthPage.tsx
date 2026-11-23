import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Logo } from './DesignPrimitives';

export function AuthPage() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        setIsError(true);
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        setIsError(true);
      } else {
        setMessage('Check your email for a verification link!');
        setIsError(false);
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(error.message);
      setIsError(true);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r p-12 lg:flex">
        <Logo />
        <div>
          <h1 className="text-5xl font-bold leading-tight">
            Numbers that
            <br />
            <span className="text-shine">call the game.</span>
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            Player props, match predictions and live league data for NBA and football.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="panel p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Sports</div>
            <div className="num mt-1 text-2xl font-semibold">NBA &amp; Football</div>
          </div>
          <div className="panel p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Engine</div>
            <div className="num mt-1 text-2xl font-semibold text-primary">AI + Stats</div>
          </div>
        </div>
      </div>

      <div className="grid place-items-center p-6">
        <form
          key={mode}
          onSubmit={handleEmailAuth}
          className="panel rise w-full max-w-sm space-y-4 p-8"
        >
          <div className="lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-bold">{mode === 'in' ? 'Welcome back' : 'Create account'}</h2>

          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />

          <button
            type="submit"
            disabled={loading}
            className="glow flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? 'Just a moment...' : mode === 'in' ? 'Sign in' : 'Sign up'}
          </button>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border bg-secondary py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/80"
          >
            <img src="https://www.google.com/favicon.ico" className="size-4" alt="" />
            Continue with Google
          </button>

          {message && (
            <div
              className={`rounded-lg border px-3 py-2 text-center text-xs ${
                isError
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-success/40 bg-success/10 text-success'
              }`}
            >
              {message}
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'in' ? 'No account?' : 'Have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'in' ? 'up' : 'in');
                setMessage('');
              }}
              className="text-primary hover:underline"
            >
              {mode === 'in' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
