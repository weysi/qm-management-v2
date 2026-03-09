"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Users, BookOpen } from 'lucide-react';

const navItems = [
	{
		href: '/dashboard',
		label: 'Dashboard',
		icon: <Home className="w-5 h-5" />,
	},
	{
		href: '/clients',
		label: 'Kunden',
		icon: <Users className="w-5 h-5" />,
	},
	{
		href: '/handbooks',
		label: 'Dokumente',
		icon: <BookOpen className="w-5 h-5" />,
	},
];

export function Sidebar() {
  const pathname = usePathname();

  return (
		<aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col z-20">
			{/* Logo */}
			<div className="px-6 py-5 border-b border-gray-100">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
						<span className="text-white text-xs font-bold">QM</span>
					</div>
					<div>
						<p className="text-sm font-bold text-gray-900">QM Manager</p>
						<p className="text-xs text-gray-500"> Handbook/Workspace </p>
					</div>
				</div>
			</div>

			{/* Nav */}
			<nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
				{navItems.map(item => {
					const active = pathname.startsWith(item.href);
					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
								active
									? 'bg-primary/10 text-primary'
									: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
							)}
						>
							{item.icon}
							{item.label}
						</Link>
					);
				})}
			</nav>

			{/* Footer */}
			<div className="px-4 py-4 border-t border-gray-100">
				<p className="text-xs text-gray-400 text-center">ISO 9001:2015</p>
			</div>
		</aside>
	);
}
