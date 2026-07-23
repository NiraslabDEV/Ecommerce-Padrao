'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StorefrontPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/menu');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--st-primary)' }}></div>
        <p style={{ color: 'var(--st-muted)' }}>A carregar...</p>
      </div>
    </div>
  );
}
