import 'server-only';

import { cookies } from 'next/headers';

import {
  createSessionToken,
  getLoginCredentials,
  getSessionCookieName,
  getSessionMaxAge,
  verifySessionToken,
} from '@/lib/auth/session';

export async function isAuthenticated() {
	const cookieStore = await cookies();
	return verifySessionToken(cookieStore.get(getSessionCookieName())?.value);
}

export async function signInWithMockCredentials(
	username: string,
	password: string,
) {
	const credentials = getLoginCredentials();
	if (username !== credentials.username || password !== credentials.password) {
		return false;
	}

	const cookieStore = await cookies();
	cookieStore.set(getSessionCookieName(), await createSessionToken(username), {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: getSessionMaxAge(),
	});

	return true;
}

export async function signOutMockSession() {
	const cookieStore = await cookies();
	cookieStore.delete(getSessionCookieName());
}
