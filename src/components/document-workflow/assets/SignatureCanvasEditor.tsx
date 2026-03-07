'use client';

import { useEffect, useMemo, useRef } from 'react';
import ReactSignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';

interface SignatureCanvasEditorProps {
	previewUrl?: string | null;
	disabled?: boolean;
	onSignatureChange: (dataUrl: string | null) => void;
}

export function SignatureCanvasEditor({
	previewUrl,
	disabled,
	onSignatureChange,
}: SignatureCanvasEditorProps) {
	const signatureRef = useRef<ReactSignatureCanvas | null>(null);
	const canvasProps = useMemo(
		() => ({
			className: 'h-64 w-full rounded-2xl bg-white',
		}),
		[],
	);

	useEffect(() => {
		signatureRef.current?.clear();
		onSignatureChange(null);
	}, [onSignatureChange, previewUrl]);

	function updateValue() {
		const signature = signatureRef.current;
		if (!signature || signature.isEmpty()) {
			onSignatureChange(null);
			return;
		}

		onSignatureChange(signature.getTrimmedCanvas().toDataURL('image/png'));
	}

	return (
		<div className="space-y-4">
			{previewUrl ? (
				<div className="rounded-3xl border border-slate-200 bg-white p-4">
					<p className="mb-3 text-sm font-medium text-slate-900">
						Current signature
					</p>
					<img
						src={previewUrl}
						alt="Current signature"
						className="max-h-32 rounded-2xl border border-slate-200 object-contain"
					/>
				</div>
			) : null}

			<div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
				<p className="mb-3 text-sm font-medium text-slate-900">Draw signature</p>
				<div className="rounded-2xl border border-slate-200 bg-white p-2">
					<ReactSignatureCanvas
						ref={signatureRef}
						canvasProps={canvasProps}
						onEnd={updateValue}
						penColor="#0f172a"
					/>
				</div>
				<div className="mt-4">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => {
							signatureRef.current?.clear();
							onSignatureChange(null);
						}}
						disabled={disabled}
					>
						Clear canvas
					</Button>
				</div>
			</div>
		</div>
	);
}
