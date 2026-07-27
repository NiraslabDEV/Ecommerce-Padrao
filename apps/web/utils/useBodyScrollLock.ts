'use client';

import { useEffect } from 'react';

/**
 * Trava o scroll do <body> enquanto `active` for true.
 * `position: fixed` sozinho não impede o scroll da página por baixo de um
 * overlay em touch — sem isto, o gesto de arrastar no modal "vaza" e rola
 * a página de fundo em vez do conteúdo do modal.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [active]);
}
