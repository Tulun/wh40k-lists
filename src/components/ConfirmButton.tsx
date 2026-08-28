import { useEffect, useRef, useState } from "react";

/**
 * Two-tap destructive button: the first tap arms it (label swaps to
 * `confirmLabel`, auto-disarms after a moment), the second tap fires.
 * Replaces window.confirm, which iOS standalone/PWA browsers silently
 * suppress — returning false and making the action look broken.
 */
export default function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className,
  armedClassName,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
  armedClassName: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      onClick={() => {
        clearTimeout(timer.current);
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 2500);
        }
      }}
      className={armed ? armedClassName : className}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
