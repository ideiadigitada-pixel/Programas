import React, { useRef, useEffect, useCallback } from 'react';

interface HoldButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onAction: () => void;
  initialDelay?: number;
  minInterval?: number;
  children: React.ReactNode;
}

export const HoldButton: React.FC<HoldButtonProps> = ({
  onAction,
  disabled = false,
  initialDelay = 280,
  minInterval = 40,
  children,
  className = '',
  ...props
}) => {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isHoldingRef = useRef<boolean>(false);
  const hasHoldFiredRef = useRef<boolean>(false);
  const isPointerDownRef = useRef<boolean>(false);
  const isScrolledRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerTypeRef = useRef<string>('mouse');
  const currentDelayRef = useRef<number>(150);

  const stop = useCallback(() => {
    isHoldingRef.current = false;
    isPointerDownRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Interrompe imediatamente se o botão for desabilitado (ex: atingiu o limite mínimo ou máximo)
  useEffect(() => {
    if (disabled) {
      stop();
    }
  }, [disabled, stop]);

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const scheduleNextTick = useCallback(() => {
    if (!isHoldingRef.current || disabledRef.current) {
      stop();
      return;
    }

    intervalRef.current = window.setTimeout(() => {
      if (!isHoldingRef.current || disabledRef.current) {
        stop();
        return;
      }
      onActionRef.current();
      // Acelera gradualmente: reduz o intervalo em 15% a cada repetição até minInterval
      currentDelayRef.current = Math.max(minInterval, Math.round(currentDelayRef.current * 0.85));
      scheduleNextTick();
    }, currentDelayRef.current);
  }, [minInterval, stop]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;

    stop();
    isPointerDownRef.current = true;
    isScrolledRef.current = false;
    hasHoldFiredRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    pointerTypeRef.current = e.pointerType;
    currentDelayRef.current = 150;

    if (e.pointerType === 'mouse') {
      // Para mouse no desktop: feedback imediato no clique
      onActionRef.current();
      isHoldingRef.current = true;
      timerRef.current = window.setTimeout(() => {
        if (!isHoldingRef.current || disabledRef.current) return;
        onActionRef.current();
        scheduleNextTick();
      }, initialDelay);
    } else {
      // Para touch no celular: NÃO disparar na descida para não mudar valor ao rolar a tela!
      // Inicia timer para caso o usuário segure o dedo parado (long press)
      timerRef.current = window.setTimeout(() => {
        if (!isPointerDownRef.current || isScrolledRef.current || disabledRef.current) return;
        isHoldingRef.current = true;
        hasHoldFiredRef.current = true;
        onActionRef.current();
        scheduleNextTick();
      }, initialDelay);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPointerDownRef.current || isScrolledRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    // Se o dedo moveu mais de 6px, o usuário está rolando a página
    if (Math.hypot(dx, dy) > 6) {
      isScrolledRef.current = true;
      stop();
    }
  };

  const handlePointerUp = () => {
    if (isPointerDownRef.current && !isScrolledRef.current && pointerTypeRef.current !== 'mouse') {
      // Se foi um toque deliberado no touch (sem arrastar/rolar e antes de disparar o hold)
      if (!hasHoldFiredRef.current && !disabledRef.current) {
        onActionRef.current();
      }
    }
    stop();
  };

  const handlePointerLeave = () => {
    stop();
  };

  const handlePointerCancel = () => {
    // Quando o navegador intercepta para rolar a tela, emite pointercancel
    isScrolledRef.current = true;
    stop();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Se foi detectado arrasto/scroll, anula o clique
    if (isScrolledRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Garante que soltar o clique fora da janela do navegador ou do botão também interrompa o hold
  useEffect(() => {
    const handleGlobalUp = () => {
      if (isPointerDownRef.current || isHoldingRef.current) {
        stop();
      }
    };
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [stop]);

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none touch-manipulation ${className}`}
    >
      {children}
    </button>
  );
};
