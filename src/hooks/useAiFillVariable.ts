import { useCallback, useState } from 'react';
import { aiFillVariable, type ApiRequestError } from '@/lib/documents';

export interface AiFillVariablePayload {
  handbookId: string;
  variableName: string;
  currentValue: string | null;
  instruction: string;
  clientContext: Record<string, unknown>;
  language: 'de-DE' | 'en-US';
  constraints: {
    maxLength: number | null;
    required: boolean;
  };
  variableDescription?: string | null;
}

export function useAiFillVariable() {
  const [loadingByVariable, setLoadingByVariable] = useState<Record<string, boolean>>({});

  const fillVariable = useCallback(async (payload: AiFillVariablePayload) => {
    const key = payload.variableName;
    setLoadingByVariable(prev => ({ ...prev, [key]: true }));
    try {
      return await aiFillVariable(payload);
    } catch (error) {
      throw error as Error | ApiRequestError;
    } finally {
      setLoadingByVariable(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const isLoadingVariable = useCallback(
    (variableName: string) => Boolean(loadingByVariable[variableName]),
    [loadingByVariable],
  );

  return {
    fillVariable,
    loadingByVariable,
    isLoadingVariable,
  };
}
