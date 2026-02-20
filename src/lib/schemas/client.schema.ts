import { z } from 'zod';

export const ClientSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1, 'Firmenname ist erforderlich'),
	address: z.string().min(1, 'Straße ist erforderlich'),
	zipCity: z.string().min(1, 'PLZ und Ort sind erforderlich'),
	ceo: z.string().min(1, 'Geschäftsführer ist erforderlich'),
	qmManager: z.string().min(1, 'QM-Manager ist erforderlich'),
	employeeCount: z
		.number()
		.int()
		.positive('Mitarbeiteranzahl muss positiv sein'),
	products: z.string().min(1, 'Produktbeschreibung ist erforderlich'),
	services: z.string().min(1, 'Dienstleistungsbeschreibung ist erforderlich'),
	industry: z.string().min(1, 'Branche ist erforderlich'),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const CreateClientSchema = ClientSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

export const UpdateClientSchema = CreateClientSchema.partial();

export type Client = z.infer<typeof ClientSchema>;
export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
