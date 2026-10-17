# Frontend and map architecture

The web application implements the design reference as URL-addressable Next.js routes rather than importing the generated prototype. Public content lives at `/`, `/methodology`, `/help`, `/privacy`, and `/terms`. Clerk protects every `/analyses/**` route on the server. Analysis screens read authoritative API state through parsed shared contracts; TanStack Query owns remote cache and polling, while browser files, upload abort controllers, and upload progress remain local ephemeral state.

The setup lifecycle is Data → Validation → Configuration → Review. Completing uploads queues an input-profile job. Saving configuration increments its revision and queues an authoritative preflight. Queueing requires the exact input revision, configuration revision, fingerprint, and matching passed preflight. The worker repeats scientific validation against the frozen snapshot before execution.

Results expose overview, diagnostics, downloads, and an interactive MapLibre map. The API maps opaque layer IDs to internal object keys, checks ownership, and proxies bounded requests to the private TiTiler service. TiTiler has no edge network or Caddy route. Basemap style URLs and attribution are deployment-owned environment pairs; an incomplete pair fails environment validation. Terrain is advertised only for a continuous predictor explicitly confirmed as elevation in metres and published as a compatible DEM.

Inputs, validation state, results, map assets, and the verified ZIP bundle follow the same 48-hour lifecycle. No SQL database or permanent analysis history is introduced.

## Legal review gate

The Privacy and Terms pages are concise factual drafts reflecting Clerk authentication, temporary object storage, ownership isolation, acceptable use, and lifecycle deletion. The repository owner and qualified legal counsel must review and approve both pages before production deployment.
