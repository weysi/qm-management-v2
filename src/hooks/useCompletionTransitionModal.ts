import { useEffect, useRef, useState } from 'react';

export function useCompletionTransitionModal(isCompleteRequired: boolean | undefined) {
  const [open, setOpen] = useState(false);
  const previousRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (typeof isCompleteRequired !== 'boolean') return;
    if (previousRef.current === false && isCompleteRequired) {
      setOpen(true);
    }
    previousRef.current = isCompleteRequired;
  }, [isCompleteRequired]);

  return {
    open,
    setOpen,
  };
}
