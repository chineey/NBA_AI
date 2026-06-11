import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { TrendingUp, Mail, Lock, Loader2, Sparkles } from 'lucide-react'

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setMessage(error.message); setIsError(true) }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage(error.message); setIsError(true)
      } else {
        setMessage('Check your email for a verification link!'); setIsError(false)
      }
    }
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    if (error) { setMessage(error.message); setIsError(true) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden px-4">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-orange-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-green-500 rounded-full blur-[140px] opacity-[0.05]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-xl shadow-orange-500/30 mb-4">
            <TrendingUp className="size-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <div className="flex items-center gap-1.5 mt-2 text-gray-400 text-sm">
            <Sparkles className="size-3.5 text-orange-400" />
            AI-powered NBA &amp; football predictions
          </div>
        </div>

        <div className="bg-gray-900/70 backdrop-blur-sm border border-white/[0.08] p-7 rounded-2xl shadow-2xl shadow-black/40 space-y-5">
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-orange-400 transition-colors" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] text-white text-sm border border-white/[0.08] placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 transition-all"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-orange-400 transition-colors" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] text-white text-sm border border-white/[0.08] placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/25 transition-all duration-200 hover:shadow-orange-500/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? 'Just a moment...' : isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-gray-900 px-3 text-gray-500 uppercase tracking-wider">or</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
            Continue with Google
          </button>

          {message && (
            <p className={`text-center text-sm animate-fade-in rounded-lg py-2.5 px-3 border ${
              isError
                ? 'text-red-300 bg-red-500/10 border-red-500/20'
                : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
            }`}>
              {message}
            </p>
          )}
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setIsLogin(!isLogin); setMessage('') }}
            className="text-orange-400 font-semibold hover:text-orange-300 transition-colors"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  )
}
