/**
 * CSP Violation Report Endpoint
 * Logs Content Security Policy violations for monitoring
 */

import { NextRequest, NextResponse } from 'next/server';

// Disable CSRF protection for CSP reports (they come from the browser, not user actions)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');

    // CSP reports come as application/csp-report or application/json
    let report;
    if (contentType?.includes('application/csp-report') || contentType?.includes('application/json')) {
      report = await request.json();
    } else {
      const text = await request.text();
      report = text;
    }

    // Log CSP violations in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[CSP Violation]', typeof report === 'string' ? report : JSON.stringify(report, null, 2));
    }

    // In production, you might want to send this to a logging service
    // e.g., Sentry, CloudWatch, etc.

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[CSP Report] Error processing report:', error);
    return new NextResponse(null, { status: 204 }); // Always return 204 to avoid retry loops
  }
}

