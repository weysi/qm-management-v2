'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompletionStatusBadge } from '@/components/document-workflow/workflow/CompletionStatusBadge';
import { GlobalAssetManager } from '@/components/document-workflow/workflow/GlobalAssetManager';

interface AssetSetupStepProps {
	logoAsset: any;
	signatureAsset: any;
	assetActionType: 'logo' | 'signature' | null;
	autofillSummary: Array<{
		id: string;
		label: string;
		status: 'ready' | 'pending';
		description: string;
	}>;
	onUploadAsset: (
		assetType: 'logo' | 'signature',
		file: File,
	) => void | Promise<void>;
	onRemoveAsset: (assetType: 'logo' | 'signature') => void | Promise<void>;
	onBack: () => void | Promise<void>;
	onContinue: () => void | Promise<void>;
}

export function AssetSetupStep({
	logoAsset,
	signatureAsset,
	assetActionType,
	autofillSummary,
	onUploadAsset,
	onRemoveAsset,
	onBack,
	onContinue,
}: AssetSetupStepProps) {
	return (
		<div className="space-y-4">
			<div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
				<div className="space-y-3">
					<p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
						Assets
					</p>
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold text-slate-950">
							Shared assets and defaults
						</h2>
						<p className="max-w-3xl text-sm text-slate-600">
							Set logo and signature once, then review the defaults already
							prepared for this upload.
						</p>
					</div>
				</div>

				<div className="mt-5 grid gap-3 md:grid-cols-3">
					{autofillSummary.map(item => (
						<div
							key={item.id}
							className="rounded-3xl border border-border bg-muted/20 px-4 py-4"
						>
							<div className="flex items-center justify-between gap-3">
								<p className="text-sm font-semibold text-slate-900">
									{item.label}
								</p>
								<CompletionStatusBadge
									status={item.status === 'ready' ? 'saved' : 'pending'}
									label={item.status === 'ready' ? 'Prepared' : 'Pending'}
								/>
							</div>
							<p className="mt-2 text-sm text-slate-500">{item.description}</p>
						</div>
					))}
				</div>
			</div>

			<GlobalAssetManager
				logoAsset={logoAsset}
				signatureAsset={signatureAsset}
				busyType={assetActionType}
				onUpload={onUploadAsset}
				onRemove={onRemoveAsset}
			/>

			<div className="flex flex-wrap justify-between gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => void onBack()}
				>
					<ArrowLeft className="h-4 w-4" />
					Back to upload
				</Button>
				<Button
					type="button"
					onClick={() => void onContinue()}
				>
					Continue to review
					<ArrowRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
