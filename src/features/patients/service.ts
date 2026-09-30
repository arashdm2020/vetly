import 'server-only';
import { getDatabase } from '@/db';
import { owners, pets } from '@/db/schema';
import { createPatientSchema } from './schema';
import { readClinicSettings } from '@/features/settings/service';

// Internal service. Wire into authenticated actions only after clinic login is implemented.
export async function createPatient(input: unknown) {
  const patient = createPatientSchema.parse(input);
  if (patient.customSpecies && (patient.species !== 'other' || !(await readClinicSettings()).customSpecies.includes(patient.customSpecies))) {
    throw new Error('نوع حیوان را از فهرست تنظیمات انتخاب کنید.');
  }
  const ownerId = crypto.randomUUID();
  const petId = crypto.randomUUID();
  const database = getDatabase();
  // libSQL batch statements execute in one transaction; a failed pet insert rolls back its owner.
  await database.batch([
    database.insert(owners).values({ id: ownerId, fullName: patient.owner, phone: patient.phone }),
    database.insert(pets).values({ id: petId, ownerId, name: patient.name, species: patient.species, customSpecies: patient.customSpecies }),
  ]);
  return { id: petId, ...patient };
}
