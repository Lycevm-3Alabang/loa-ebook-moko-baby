import { NextRequest, NextResponse } from "next/server"

// EC-API-001 D-1 — same-origin BFF passthrough (EC-CUTOVER-001 CON-8,
// EC-D2). The browser only ever addresses this app; the Consult API host is
// server-only. No transform, no validation, no auth injection (EC-D2): a
// wrong payload is a Consult API defect, filed there, never patched here.
//
// Single upstream: `api-endpoints.md` v2.1 defines the Consult surface as the
// domain endpoints plus the SSO trio, and §2.2 assigns user/group writes to
// the Auth Platform, so nothing in browser traffic needs a second host. See
// EC-API-001 DEC-2a for the open question of whether an Auth target is needed.

const CONSULT_API_URL =
  process.env.CONSULT_API_URL ?? "https://aces-api.lyceumalabang.edu.ph";

// Refresh and logout are the only calls that carry the httpOnly refresh
// cookie onward (`auth-integration.md` v1.6 §3). Ordinary domain calls and the
// callback must not receive it.
const COOKIE_FORWARD_PATHS = new Set(["refresh", "logout"]);

function shouldForwardCookies(path: string[]): boolean {
  return path.length >= 2 && path[0] === "auth" && COOKIE_FORWARD_PATHS.has(path[1]);
}

function buildTargetUrl(path: string[], searchParams: URLSearchParams): string {
  const base = `${CONSULT_API_URL}/api/v1/${path.join("/")}`;
  const qs = searchParams.toString();
  return qs ? `${base}?${qs}` : base;
}

function forwardHeaders(request: NextRequest, includeCookies: boolean): Headers {
  const headers = new Headers();

  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const requestedWith = request.headers.get("x-requested-with");
  if (requestedWith) headers.set("x-requested-with", requestedWith);

  if (includeCookies) {
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("user-agent", userAgent);

  return headers;
}

// Statuses that must not carry a body. The Consult logout returns 204, and
// NextResponse rejects a non-null body on these.
function isBodylessStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

async function proxyRequest(request: NextRequest, path: string[]): Promise<NextResponse> {
  if (path.length === 0) {
    return NextResponse.json({ message: "Missing API path" }, { status: 400 });
  }

  const targetUrl = buildTargetUrl(path, request.nextUrl.searchParams);
  const headers = forwardHeaders(request, shouldForwardCookies(path));

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const arrayBuffer = await request.arrayBuffer();
      if (arrayBuffer.byteLength > 0) body = arrayBuffer;
    } catch {
      // GET/HEAD already excluded; a body is optional
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Backend unreachable",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();

  if (isBodylessStatus(upstream.status)) {
    // Still pass set-cookie: logout clears the refresh cookie with 204.
    const cleared = upstream.headers.getSetCookie?.() ?? [];
    for (const cookie of cleared) responseHeaders.append("set-cookie", cookie);
    return new NextResponse(null, { status: upstream.status, headers: responseHeaders });
  }

  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) responseHeaders.set("content-disposition", contentDisposition);

  // content-length is deliberately NOT forwarded. fetch decompresses the
  // upstream body, so the upstream length describes bytes the client never
  // receives; let the runtime frame the response instead.
  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) responseHeaders.append("set-cookie", cookie);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}

export async function OPTIONS(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await params).path);
}
