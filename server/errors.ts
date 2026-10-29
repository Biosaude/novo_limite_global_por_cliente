export class ServerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 503,
  ) {
    super(message);
    this.name = "ServerError";
  }
}
export const accessDenied = () =>
  new ServerError("ACCESS_DENIED", "Acesso remoto não autorizado.", 403);
