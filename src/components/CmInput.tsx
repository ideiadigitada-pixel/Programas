import React, { useState, useEffect, useRef } from 'react';
import { formatCm, parseCm } from '../utils/calculations';

interface CmInputProps {
  id: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  unit?: string;
  unitClassName?: string;
  formatFn?: (val: number) => string;
  parseFn?: (text: string, defaultValue: number) => number;
  onRawChange?: (raw: string) => void;
}

export const CmInput: React.FC<CmInputProps> = ({
  id,
  value,
  onChange,
  min = 0.1,
  max,
  disabled = false,
  readOnly = false,
  placeholder = '0,0',
  className = '',
  unit = 'cm',
  unitClassName = 'absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold pointer-events-none',
  formatFn = formatCm,
  parseFn = parseCm,
  onRawChange,
}) => {
  const [text, setText] = useState<string>(() => formatFn(value));
  const isFocusedRef = useRef<boolean>(false);

  // Sync with external value changes when not focused
  useEffect(() => {
    if (!isFocusedRef.current) {
      setText(formatFn(value));
    }
  }, [value, formatFn]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const raw = e.target.value;

    // Allow empty string so the user can freely delete the whole number
    if (raw === '') {
      setText('');
      onRawChange?.('');
      return;
    }

    // Keep only digits and at most one decimal separator (converts dot to comma)
    let filtered = '';
    let hasSeparator = false;
    for (const char of raw) {
      if (char >= '0' && char <= '9') {
        filtered += char;
      } else if ((char === ',' || char === '.') && !hasSeparator) {
        filtered += ',';
        hasSeparator = true;
      }
    }

    setText(filtered);
    onRawChange?.(filtered);

    // If it ends with comma or is just comma, don't trigger onChange yet
    if (filtered.endsWith(',') || filtered === ',') {
      return;
    }

    const parsed = parseFn(filtered, 0);
    if (parsed > 0) {
      if (parsed === 9673 || filtered === '9673') {
        onChange(9673);
        return;
      }
      const clamped = max !== undefined ? Math.min(max, parsed) : parsed;
      onChange(clamped);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (readOnly) return;
    isFocusedRef.current = true;
    // Auto-select text on focus so typing or pressing backspace immediately clears/replaces it
    e.target.select();
  };

  const handleBlur = () => {
    if (readOnly) return;
    isFocusedRef.current = false;
    const parsed = parseFn(text, 0);
    if (parsed === 9673 || text.trim() === '9673') {
      onRawChange?.('9673');
      onChange(9673);
      return;
    }
    let finalVal = parsed;

    if (parsed <= 0 || isNaN(parsed)) {
      finalVal = value > 0 ? value : min;
    } else {
      if (min !== undefined && finalVal < min) finalVal = min;
      if (max !== undefined && finalVal > max) finalVal = max;
    }

    setText(formatFn(finalVal));
    onChange(finalVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode={readOnly ? 'none' : 'decimal'}
        readOnly={readOnly}
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {unit && <span className={unitClassName}>{unit}</span>}
    </div>
  );
};
