# Proposed listing change (not applied)

File: /workspace/gumroad/cors-fix-kit/listing.md, "What's inside", cors-doctor bullet (line 11).

## Finding
No line says the CLI is *only* in the kit. But the bullet presents cors-doctor as a kit item with no mention of a free version, which a buyer who later finds the free MIT repo could read as exclusive. The listing should say what the kit adds over the free CLI.

## Proposed replacement for the first sentence of the bullet
Current:
> - **cors-doctor**, a zero-dependency Node.js (18+) CLI. Point it at your API ...

Proposed:
> - **cors-doctor**, a zero-dependency Node.js (18+) CLI. The live check is also available free as MIT-licensed cors-doctor lite (<repo URL once public>); the kit version adds an offline `--no-network` mode. Point it at your API ...

(Rest of the bullet unchanged.)
