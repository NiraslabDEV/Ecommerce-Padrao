'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('Email ou palavra-passe incorretos.');
      setLoading(false);
      return;
    }

    router.push('/pedidos');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0807] to-[#110d0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#110d0a] border border-[#1a1614] rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-[#e5a93c] mb-1">Painel Interno</h1>
          <p className="text-sm text-[#a8a29e] mb-6">Entra com a tua conta de staff.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-[#a8a29e] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#0a0807] border border-[#1a1614] rounded-lg px-4 py-3 text-white placeholder-[#6b6660] focus:outline-none focus:border-[#e5a93c]"
                placeholder="dono@restaurante.com"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a8a29e] mb-2">Palavra-passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#0a0807] border border-[#1a1614] rounded-lg px-4 py-3 text-white placeholder-[#6b6660] focus:outline-none focus:border-[#e5a93c]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#e5a93c] hover:bg-[#d4a035] disabled:bg-gray-600 text-[#0a0807] font-bold py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
