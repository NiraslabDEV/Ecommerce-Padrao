'use client';

import { useEffect } from 'react';

/**
 * Trava o scroll do <body> enquanto `active` for true.
 *
 * `overflow: hidden` sozinho NÃO chega no Safari iOS — é uma limitação
 * conhecida do browser: mesmo com overflow hidden, um gesto de arrastar
 * ainda "vaza" e rola/faz bounce na página por baixo do modal. A técnica
 * robusta (usada por libs como body-scroll-lock/react-remove-scroll) é
 * fixar o body na posição atual (`position: fixed` + `top` negativo) e
 * restaurar o scroll exato ao fechar.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const original = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = original.position;
      body.style.top = original.top;
      body.style.left = original.left;
      body.style.right = original.right;
      body.style.width = original.width;
      body.style.overflow = original.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
