/* Compatibility entry point for the PDF.js module worker on older iPhone Safari. */
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise(function (ok, no) {
      resolve = ok;
      reject = no;
    });
    return { promise, resolve, reject };
  };
}

const workerModule = await import('./pdf.worker.min.js');
const WorkerMessageHandler = workerModule.WorkerMessageHandler;

export { WorkerMessageHandler };
