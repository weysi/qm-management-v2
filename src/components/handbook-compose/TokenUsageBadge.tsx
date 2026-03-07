import { Badge } from '@/components/ui/badge';

interface TokenUsageBadgeProps {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  label?: string;
}

export function TokenUsageBadge({ usage, label = 'Tokens' }: TokenUsageBadgeProps) {
  if (!usage) {
    return <Badge variant="gray">{label}: n/a</Badge>;
  }

  return (
    <Badge variant="blue" className="whitespace-nowrap">
      {label}: {usage.total_tokens ?? 0} ({usage.prompt_tokens ?? 0}/{usage.completion_tokens ?? 0})
    </Badge>
  );
}
