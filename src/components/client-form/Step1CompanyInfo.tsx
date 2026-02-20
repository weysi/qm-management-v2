import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import type { CreateClientInput } from "@/lib/schemas";

export function Step1CompanyInfo() {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateClientInput>();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Firmendaten</h2>
      <p className="text-sm text-gray-500">
        Grundlegende Unternehmensinformationen für das QM-Handbuch.
      </p>

      <Input
        label="Firmenname *"
        id="name"
        placeholder="z. B. Mustermann GmbH"
        error={errors.name?.message}
        {...register("name")}
      />
      <Input
        label="Straße & Hausnummer *"
        id="address"
        placeholder="z. B. Musterstraße 42"
        error={errors.address?.message}
        {...register("address")}
      />
      <Input
        label="PLZ und Ort *"
        id="zipCity"
        placeholder="z. B. 80331 München"
        error={errors.zipCity?.message}
        {...register("zipCity")}
      />
      <Input
        label="Branche *"
        id="industry"
        placeholder="z. B. Medizintechnik, Maschinenbau"
        error={errors.industry?.message}
        {...register("industry")}
      />
    </div>
  );
}
