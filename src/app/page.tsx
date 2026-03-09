import { redirect } from "next/navigation";

import { isAuthenticated } from '@/lib/mock-auth';

export default async function RootPage() {
	redirect((await isAuthenticated()) ? '/dashboard' : '/login');
}
