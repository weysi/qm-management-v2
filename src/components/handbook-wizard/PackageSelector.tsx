'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface PackageInfo {
	code: string;
	version: string;
	label: string;
	description: string;
	lang: string;
	icon: React.ReactNode;
}

const PACKAGES: PackageInfo[] = [
	{
		code: 'ISO9001',
		version: 'v1',
		label: 'ISO 9001',
		description: 'Qualitätsmanagementsystem – Anforderungen und Handbuch',
		lang: 'DE',
		icon: (
			<div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
				<span className="text-blue-700 font-bold text-xs">9001</span>
			</div>
		),
	},
	{
		code: 'SSCP',
		version: 'v1',
		label: 'SSCP',
		description: 'Summary of Safety & Clinical Performance',
		lang: 'EN',
		icon: (
			<div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
				<span className="text-green-700 font-bold text-xs">SSCP</span>
			</div>
		),
	},
	{
		code: 'ISO14007',
		version: 'v1',
		label: 'ISO 14007',
		description: 'Umweltmanagement – Kosten der Umweltauswirkungen',
		lang: 'EN',
		icon: (
			<div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
				<span className="text-emerald-700 font-bold text-xs">14007</span>
			</div>
		),
	},
];

interface PackageSelectorProps {
	value: string | null;
	onChange: (code: string) => void;
}

export function PackageSelector({ value, onChange }: PackageSelectorProps) {
	return (
		<div className="grid grid-cols-1 gap-3">
			{PACKAGES.map(pkg => (
				<Card
					key={pkg.code}
					className={cn(
						'cursor-pointer transition-all border-2',
						value === pkg.code
							? 'border-primary ring-2 ring-primary/20'
							: 'border-gray-100 hover:border-gray-200',
					)}
					onClick={() => onChange(pkg.code)}
				>
					<CardContent className="py-3">
						<div className="flex items-center gap-4">
							{pkg.icon}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<p className="font-semibold text-gray-900">{pkg.label}</p>
									<Badge variant="gray">{pkg.lang}</Badge>
								</div>
								<p className="text-sm text-gray-500 mt-0.5">
									{pkg.description}
								</p>
							</div>
							{value === pkg.code && (
								<svg
									className="w-5 h-5 text-primary shrink-0"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
								</svg>
							)}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export function getPackageInfo(code: string): PackageInfo | undefined {
	return PACKAGES.find(p => p.code === code);
}

export { PACKAGES };
