const actorIds = new WeakMap<Request, string>();
const generatedRequestIds = new WeakMap<Request, string>();
const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestId(request: Request) {
  const inbound = request.headers.get("x-request-id");
  if (inbound && validRequestId.test(inbound)) return inbound;
  const existing = generatedRequestIds.get(request);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  generatedRequestIds.set(request, generated);
  return generated;
}

export function setRequestActor(request: Request, actorId: string) {
  actorIds.set(request, actorId);
}

export function requestActor(request: Request) {
  return actorIds.get(request);
}

type ApiErrorLogContext = {
  code: string;
  request: Request;
  status: number;
};

export function writeApiErrorLog({ code, request, status }: ApiErrorLogContext) {
  const level = status >= 500 ? "error" : status === 403 || status === 429 ? "warn" : "info";
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    requestId: requestId(request),
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    code,
    ...(requestActor(request) ? { actorId: requestActor(request) } : {}),
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
