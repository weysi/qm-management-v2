'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function LoginForm() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	async function handleSubmit(formData: FormData) {
		setError(null);

		const response = await fetch('/api/auth/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				username: formData.get('username'),
				password: formData.get('password'),
			}),
		});

		const result = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;

		if (!response.ok) {
			setError(result?.error ?? 'Anmeldung fehlgeschlagen.');
			return;
		}

		startTransition(() => {
			router.push('/dashboard');
			router.refresh();
		});
	}

	return (
		<div className="flex w-full max-w-sm flex-col justify-center">
			<div className="mb-8 flex flex-col items-center justify-center space-y-4 text-center">
				<span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
					<ShieldCheck className="h-6 w-6" />
				</span>
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight text-slate-950">
						QM Management
					</h1>
					<p className="text-sm text-slate-500">
						Melden Sie sich mit Ihren Zugangsdaten an.
					</p>
				</div>
			</div>

			<Card className="border-slate-200 shadow-sm">
				<CardHeader className="space-y-1">
					<CardTitle className="text-xl">Anmelden</CardTitle>
					{/* <CardDescription className="text-sm">
						Mock-Zugang für die lokale Entwicklung
					</CardDescription> */}
				</CardHeader>
				<CardContent className="space-y-6">
					<form
						action={formData => {
							void handleSubmit(formData);
						}}
						className="space-y-4"
					>
						<div className="space-y-2">
							<label
								htmlFor="username"
								className="text-sm font-medium text-slate-800"
							>
								Benutzername
							</label>
							<Input
								id="username"
								name="username"
								autoComplete="username"
								placeholder="Benutzername"
								required
							/>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="password"
								className="text-sm font-medium text-slate-800"
							>
								Passwort
							</label>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								placeholder="Passwort"
								required
							/>
						</div>

						{error && (
							<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
								{error}
							</div>
						)}

						<Button
							type="submit"
							className="w-full"
							loading={isPending}
						>
							Anmelden
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
