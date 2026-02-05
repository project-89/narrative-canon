import { NextRequest, NextResponse } from "next/server";

// Backend API URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3088";

/**
 * API proxy route that forwards all requests to the NarrativeGit backend.
 * This allows the frontend to communicate with the backend without CORS issues.
 */
async function proxyRequest(
  request: NextRequest,
  method: string,
  path: string[]
) {
  const targetPath = `/api/narrative/${path.join("/")}`;
  const targetUrl = `${BACKEND_URL}${targetPath}${request.nextUrl.search}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward any authorization headers
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    // Add body for non-GET requests
    if (method !== "GET" && method !== "HEAD") {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Get response data
    const contentType = response.headers.get("content-type");
    let data;
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Return proxied response
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "X-Proxied-From": targetUrl,
      },
    });
  } catch (error) {
    console.error(`Proxy error for ${targetUrl}:`, error);
    return NextResponse.json(
      {
        error: "Failed to connect to backend",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, "GET", path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, "POST", path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, "PUT", path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, "DELETE", path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, "PATCH", path);
}
