import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  try {
    const { slug } = await params;
    const path = '/' + slug.join('/');
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();

    const backendUrl = `${API_BASE_URL}${path}${searchParams ? '?' + searchParams : ''}`;

    console.log('Proxying GET to:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Proxy GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  try {
    const { slug } = await params;
    const path = '/' + slug.join('/');
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString();

    const backendUrl = `${API_BASE_URL}${path}${searchParams ? '?' + searchParams : ''}`;

    console.log('Proxying POST to:', backendUrl);

    // Check if this is a streaming endpoint (Python/Lua execution)
    const isStreamingEndpoint = path.includes('/vm/default/python') || path.includes('/vm/default/lua');

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: await request.text(),
    });

    if (isStreamingEndpoint) {
      // Return the streaming response directly for Python/Lua execution
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Parse as JSON for other endpoints
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
  } catch (error) {
    console.error('Proxy POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
