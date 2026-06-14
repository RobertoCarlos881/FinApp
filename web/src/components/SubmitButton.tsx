"use client";

import { useFormStatus } from "react-dom";

// Botón de envío que se deshabilita mientras la acción está en curso, para
// evitar dobles envíos (ej. crear la cuenta dos veces).
export default function SubmitButton({
  children,
  className,
  pendingText = "Procesando…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
