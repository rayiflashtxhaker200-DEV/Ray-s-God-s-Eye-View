export function waitForSignal(promise, signal) {
  if (!signal) return promise;
  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
  } else if (signal.aborted) {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      if (signal.reason !== undefined) {
        reject(signal.reason);
      } else {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
