# Privacy and launch requirements

This implementation includes privacy controls, but it is not a legal-compliance certification. Launch jurisdiction, users' ages, operating entity, hosting regions, and provider contracts must be decided before real user data is collected.

## Implemented controls

- Every family route authenticates the opaque, hashed session token and checks family membership on the server. Random UUIDs alone are not authorization.
- Phone numbers entered about relatives are encrypted using AES-256-GCM. Only the account that entered a number can retrieve it. Even family members cannot retrieve someone else's stored contact copy.
- Profile fields default to private. The owner may grant access to their family or a branch head and descendants. Branch membership is evaluated dynamically, including future descendants. Partners who are not descendants do not inherit a branch grant.
- Users cannot edit a claimed member's profile or another account's sharing settings through the current API. Unclaimed profiles are visible only to their creator.
- Scrypt password hashes, 256-bit session tokens, HttpOnly/SameSite cookies, origin checks for writes, request limits, security headers, parameterized SQL, and composite family foreign keys are included. Cookie Secure is enabled in production.
- Names and relationships remain unverified until a real verification/consent process exists. Authentication and relationship confirmation are distinct concepts. Sample verification badges are explicitly fictional.
- Sensitive details such as faith, caste/community, gotra, and birth date are optional and are never inferred.
- Entry archives are encrypted before being sent to Drive. Keys remain server-side.

## Required before real public launch

Define and implement the consent notice, legitimate purpose and data minimization for third-party names/numbers, verified guardian consent and age handling where applicable, profile claiming with two-sided relationship confirmation, correction/dispute flows, withdrawal and erasure, retention schedules, data export scope, breach response, grievance handling, backup deletion/expiry, processor contracts, transfer restrictions, and audit access. Add verified email/password recovery and account deletion workflows.

Do not automatically send SMS/WhatsApp to every number typed by another user. Require a documented purpose, recipient consent/opt-in where applicable, abuse protection, an appropriate approved template when required, delivery tracking, expiry, attempt limits, and server-side verification. OTP proof of possession does not by itself prove a family relationship. The current verification route returns an explicit unavailable response and sends nothing.

WhatsApp's business platform is a provider integration; it does not automatically mirror arbitrary personal chats or bulk-invite contacts into your app. Current code supports manually opening WhatsApp with invitation text. Consult [WhatsApp's developer hub](https://whatsappbusiness.com/developers/developer-hub/) and [template guidance](https://whatsappbusiness.com/blog/manage-message-templates-whatsapp-business-api/) when implementing automated delivery.

For an India-focused service, review the official [MeitY Act and policies](https://www.meity.gov.in/documents/act-and-policies), including the DPDP Act and notified rules and their applicable commencement schedules. Obtain jurisdiction-specific review rather than assuming all obligations apply on the same date. Additional requirements may apply for users in other countries.

## Hosting and backups

Serve the web app and API under the same HTTPS origin. Never expose `.env`, database dumps, tokens, archive keys, or user records in a static site bundle. Encrypted Drive archives are operator infrastructure, not a public family folder. Retain ordinary PostgreSQL backups, encryption keys, and tested restoration plans separately. Rotate secrets and implement monitoring and incident response before real user launch.
