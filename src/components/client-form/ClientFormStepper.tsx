import { cn } from "@/lib/utils";

interface Step {
  number: number;
  label: string;
}

const STEPS: Step[] = [
  { number: 1, label: "Firmendaten" },
  { number: 2, label: "Kontaktpersonen" },
  { number: 3, label: "Produkte & Dienste" },
];

interface ClientFormStepperProps {
  currentStep: number;
}

export function ClientFormStepper({ currentStep }: ClientFormStepperProps) {
  return (
    <nav className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const done = currentStep > step.number;
        const active = currentStep === step.number;

        return (
          <div key={step.number} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2",
                  done
                    ? "bg-brand-600 border-brand-600 text-white"
                    : active
                    ? "border-brand-600 text-brand-600 bg-white"
                    : "border-gray-300 text-gray-400 bg-white"
                )}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  active ? "text-brand-700" : done ? "text-gray-700" : "text-gray-400"
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-16 mx-3",
                  done ? "bg-brand-600" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
