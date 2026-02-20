import { useFormContext } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import type { CreateClientInput } from "@/lib/schemas";

export function Step3Products() {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateClientInput>();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Produkte & Dienstleistungen</h2>
      <p className="text-sm text-gray-500">
        Diese Informationen werden direkt in den Anwendungsbereich und weitere Kapitel eingearbeitet.
      </p>

      <Textarea
        label="Produktbeschreibung *"
        id="products"
        rows={3}
        placeholder="z. B. Medizinische Messgeräte und Diagnosesysteme"
        error={errors.products?.message}
        {...register("products")}
      />
      <Textarea
        label="Dienstleistungsbeschreibung *"
        id="services"
        rows={3}
        placeholder="z. B. Beratung, Wartung und Kalibrierung medizintechnischer Geräte"
        error={errors.services?.message}
        {...register("services")}
      />
    </div>
  );
}
