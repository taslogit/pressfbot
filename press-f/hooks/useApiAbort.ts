import { useEffect, useRef } from 'react';

/**
 * Hook that provides an AbortController signal for API requests.
 * Automatically aborts all pending requests when the component unmounts.
 * 
 * Usage:
 *   const getSignal = useApiAbort();
 * 
 *   useEffect(() => {
 *     const signal = getSignal();
 *     lettersAPI.getAll({ signal }).then(res => { ... });
 *   }, []);
 */
export function useApiAbort() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      // Abort all pending requests on unmount
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  const getSignal = (): AbortSignal => {
    // Create a new controller if the previous one was aborted
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController();
    }
    return controllerRef.current.signal;
  };

  return getSignal;
}
