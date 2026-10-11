/** Thrown when the server rejects the guest access key (HTTP 401). */
export class AccessDeniedError extends Error {
  constructor(message = 'access_denied') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}
