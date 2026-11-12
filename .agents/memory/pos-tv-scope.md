---
name: POS and TV app scope separation
description: Keep Android TV app management separate from the live KoaPOS point-of-sale system.
---

Android TV app updates belong in a separate Replit app and must not interact with this live POS.

**Why:** the user explicitly says the POS is an active point-of-sale system and the two products must remain isolated.

**How to apply:** Do not add Android TV update pages, routes, storage handling, origin exceptions, or download links to this POS.
