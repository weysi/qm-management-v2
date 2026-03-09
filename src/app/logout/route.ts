import { NextResponse } from 'next/server';

import { signOutMockSession } from '@/lib/mock-auth';

export async function GET(request: Request) {
	await signOutMockSession();
	return NextResponse.redirect(new URL('/login', request.url));
}
