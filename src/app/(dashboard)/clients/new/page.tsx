"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateClientSchema } from "@/lib/schemas";
import { useCreateClient } from "@/hooks/useClients";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClientFormStepper,
  Step1CompanyInfo,
  Step2People,
  Step3Products,
} from "@/components/client-form";
import type { CreateClientInput } from "@/lib/schemas";

const STEP_FIELDS: (keyof CreateClientInput)[][] = [
  ["name", "address", "zipCity", "industry"],
  ["ceo", "qmManager", "employeeCount"],
  ["products", "services"],
];

export default function NewClientPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const { mutate: createClient, isPending } = useCreateClient();

  const methods = useForm<CreateClientInput>({
    resolver: zodResolver(CreateClientSchema),
    mode: "onTouched",
  });

  async function handleNext() {
    const fields = STEP_FIELDS[step - 1];
    const ok = await methods.trigger(fields);
    if (ok) setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function onSubmit(data: CreateClientInput) {
    createClient(data, {
      onSuccess: (client) => {
        router.push(`/clients/${client.id}`);
      },
    });
  }

  return (
    <div>
      <Header title="Neuer Kunde" subtitle="Kundendaten für QM-Handbuch erfassen" />

      <div className="px-8 py-6 max-w-2xl">
        <div className="mb-6">
          <ClientFormStepper currentStep={step} />
        </div>

        <Card>
          <CardContent>
            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
                {step === 1 && <Step1CompanyInfo />}
                {step === 2 && <Step2People />}
                {step === 3 && <Step3Products />}

                <div className="flex justify-between pt-2">
                  {step > 1 ? (
                    <Button type="button" variant="outline" onClick={handleBack}>
                      Zurück
                    </Button>
                  ) : (
                    <div />
                  )}
                  {step < 3 ? (
                    <Button type="button" onClick={handleNext}>
                      Weiter
                    </Button>
                  ) : (
                    <Button type="submit" loading={isPending}>
                      Kunde anlegen
                    </Button>
                  )}
                </div>
              </form>
            </FormProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
