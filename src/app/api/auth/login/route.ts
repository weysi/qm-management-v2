import { NextResponse } from 'next/server';
import { z } from 'zod';

import { signInWithMockCredentials } from '@/lib/mock-auth';

const LoginSchema = z.object({
	username: z.string().trim().min(1, 'Benutzername ist erforderlich.'),
	password: z.string().trim().min(1, 'Passwort ist erforderlich.'),
});

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json().catch(() => null);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.',
			},
			{ status: 500 },
		);
	}

	const parsed = LoginSchema.safeParse(body);

	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? 'Anmeldung fehlgeschlagen.' },
			{ status: 400 },
		);
	}

	let authenticated = false;
	try {
		authenticated = await signInWithMockCredentials(
			parsed.data.username,
			parsed.data.password,
		);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.',
			},
			{ status: 500 },
		);
	}

	if (!authenticated) {
		return NextResponse.json(
			{ error: 'Ungültige Zugangsdaten.' },
			{ status: 401 },
		);
	}

	return NextResponse.json({ ok: true });
}
