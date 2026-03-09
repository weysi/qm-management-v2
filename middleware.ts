import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSessionCookieName, verifySessionToken } from '@/lib/auth/session';

function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/login')
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(getSessionCookieName())?.value;
  const authenticated = await verifySessionToken(token);

  if (authenticated) {
    if (pathname === '/' || pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('next', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
