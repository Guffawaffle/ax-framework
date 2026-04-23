export class AxError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "AxError";
    this.exitCode = exitCode;
  }
}
