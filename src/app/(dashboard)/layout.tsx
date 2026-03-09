import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/layout/Sidebar';
import { isAuthenticated } from '@/lib/mock-auth';

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	if (!(await isAuthenticated())) {
		redirect('/login');
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<Sidebar />
			<main className="ml-60 min-h-screen">{children}</main>
		</div>
	);
}
