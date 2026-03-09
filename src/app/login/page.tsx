import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/LoginForm';
import { isAuthenticated } from '@/lib/mock-auth';

export default async function LoginPage() {
	if (await isAuthenticated()) {
		redirect('/dashboard');
	}

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_32%,#f8fafc_100%)] px-4 py-10 sm:px-6 lg:px-8">
			<div className="mx-auto flex min-h-[calc(100vh-5rem)] items-center justify-center">
				<LoginForm />
			</div>
		</div>
	);
}
