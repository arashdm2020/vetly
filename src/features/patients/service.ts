import 'server-only';
import { getDatabase } from '@/db';
import { owners, pets } from '@/db/schema';
import { createPatientSchema } from './schema';

// Internal service. Wire into authenticated actions only after clinic login is implemented.
export async function createPatient(input: unknown) {
  const patient = createPatientSchema.parse(input);
  const ownerId = crypto.randomUUID();
  const petId = crypto.randomUUID();
  const database = getDatabase();
  // libSQL batch statements execute in one transaction; a failed pet insert rolls back its owner.
  await database.batch([
    database.insert(owners).values({ id: ownerId, fullName: patient.owner, phone: patient.phone }),
    database.insert(pets).values({ id: petId, ownerId, name: patient.name, species: patient.species }),
  ]);
  return { id: petId, ...patient };
}
