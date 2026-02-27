'use client';

import { useState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRagChat, type ChatResult } from '@/hooks/useRagTraining';

interface RagChatPanelProps {
	manualId: string;
	tenantId: string;
}

interface Message {
	role: 'user' | 'assistant';
	content: string;
	citations?: ChatResult['citations'];
}

export function RagChatPanel({ manualId, tenantId }: RagChatPanelProps) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const scrollRef = useRef<HTMLDivElement>(null);
	const { mutateAsync: chat, isPending } = useRagChat();

	async function handleSend() {
		const question = input.trim();
		if (!question) return;

		setInput('');
		setMessages(prev => [...prev, { role: 'user', content: question }]);

		try {
			const result = await chat({
				manual_id: manualId,
				tenant_id: tenantId,
				question,
			});
			setMessages(prev => [
				...prev,
				{
					role: 'assistant',
					content: result.answer,
					citations: result.citations,
				},
			]);
		} catch (err) {
			setMessages(prev => [
				...prev,
				{
					role: 'assistant',
					content: `Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
				},
			]);
		}

		setTimeout(() => {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: 'smooth',
			});
		}, 100);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-gray-900">RAG Chat Test</h3>
					<Badge variant="blue">
						{messages.filter(m => m.role === 'user').length} Fragen
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				{/* Messages area */}
				<ScrollArea
					className="h-[320px] px-4"
					ref={scrollRef}
				>
					{messages.length === 0 ? (
						<div className="text-center py-12 text-gray-400">
							<svg
								className="w-10 h-10 mx-auto mb-2 text-gray-300"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
								/>
							</svg>
							<p className="text-sm">
								Stellen Sie Fragen zu Ihren indizierten Dokumenten.
							</p>
						</div>
					) : (
						<div className="space-y-3 py-4">
							{messages.map((msg, i) => (
								<div
									key={i}
									className={`flex ${
										msg.role === 'user' ? 'justify-end' : 'justify-start'
									}`}
								>
									<div
										className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
											msg.role === 'user'
												? 'bg-primary text-white'
												: 'bg-gray-100 text-gray-800'
										}`}
									>
										<p className="whitespace-pre-wrap">{msg.content}</p>
										{msg.citations && msg.citations.length > 0 && (
											<div className="mt-2 space-y-1">
												<p className="text-xs font-medium opacity-70">
													Quellen:
												</p>
												{msg.citations.map((c, ci) => (
													<div
														key={ci}
														className="text-xs opacity-60 truncate"
													>
														📄 {c.asset_path}
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</ScrollArea>

				{/* Input */}
				<div className="border-t p-3 flex gap-2">
					<Input
						placeholder="Frage eingeben…"
						value={input}
						onChange={e => setInput(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								handleSend();
							}
						}}
						disabled={isPending}
					/>
					<Button
						size="sm"
						onClick={handleSend}
						loading={isPending}
						disabled={!input.trim()}
					>
						{isPending ? <Spinner /> : 'Senden'}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
