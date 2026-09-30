# Automatic registration SMS

After an owner and patient transaction commits, registration attempts one SMS synchronously (provider timeout: eight seconds). Patient registration succeeds even when SMS fails. No extra patient-form checkbox is required.

Configure the approved registration template and API key in clinic settings, then enable clinic SMS. Existing settings remain readable; an empty registration template means not configured. Existing patients are not sent retroactive messages.

SMS.ir registration parameters: `CLINIC` maps to `clinic`, `PET` to `pet`, `PHONE` to `phone`. Kavenegar requires its supported token names instead. Reference text uses `{clinic}`, `{pet}`, `{phone}`; the actual provider template controls sent text.

Each delivery is linked to the patient and claimed with the unique key `registration:<patient-id>` before calling the provider. Provider acceptance is not proof of handset delivery. Failed or uncertain attempts require manual provider-panel reconciliation; they are not automatically retried. A process interruption before the delivery claim may leave a committed patient without an attempted SMS; no recovery queue is implemented.

Back up the production database and apply migration `0003` before deploying this version. It preserves existing delivery records while allowing patient-linked deliveries without a reminder. Test locally with mock transports only; do not invoke the reminder worker as a registration smoke test because it can send unrelated patient reminders.
