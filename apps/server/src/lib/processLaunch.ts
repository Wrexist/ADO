/** Only synchronous preflight code that has not attempted OS process creation
 * may throw this. Ordinary adapter exceptions say nothing about process state. */
export class ProcessNotStartedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProcessNotStartedError';
  }
}
