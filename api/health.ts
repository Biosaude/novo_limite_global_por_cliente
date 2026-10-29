interface Request {
  method?: string;
}
interface Response {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}
/** Saúde técnica pública: sem configuração, dados financeiros, identidade ou acesso ao banco. */
export default function health(request: Request, response: Response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!["GET", "HEAD"].includes(request.method ?? "")) {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    return response.end(JSON.stringify({ code: "METHOD_NOT_ALLOWED" }));
  }
  response.statusCode = 200;
  return response.end(
    request.method === "HEAD"
      ? undefined
      : JSON.stringify({
          status: "ok",
          persistence: "local",
          financialApi: "disabled",
        }),
  );
}
