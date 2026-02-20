import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import type { CreateClientInput } from "@/lib/schemas";

export function Step2People() {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateClientInput>();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Kontaktpersonen</h2>
      <p className="text-sm text-gray-500">
        Namen der Führungskräfte für das Handbuch und Platzhalterauflösung.
      </p>

      <Input
        label="Geschäftsführer/-in *"
        id="ceo"
        placeholder="z. B. Hans Mustermann"
        error={errors.ceo?.message}
        {...register("ceo")}
      />
      <Input
        label="QM-Manager/-in *"
        id="qmManager"
        placeholder="z. B. Maria Muster"
        error={errors.qmManager?.message}
        {...register("qmManager")}
      />
      <Input
        label="Anzahl Mitarbeiter/-innen *"
        id="employeeCount"
        type="number"
        min={1}
        placeholder="z. B. 85"
        error={errors.employeeCount?.message}
        {...register("employeeCount", { valueAsNumber: true })}
      />
    </div>
  );
}
