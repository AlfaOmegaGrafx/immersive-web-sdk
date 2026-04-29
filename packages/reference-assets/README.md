# `@iwsdk/reference-assets`

Producer pipeline and versioned corpus payloads for `@iwsdk/reference`.

This package is not meant to be installed into apps directly. In the monorepo it
owns the offline ingest/build pipeline that generates the reference corpus and
records the model archive metadata used to build embeddings. The published
package only exposes the compressed `data` warmup payload that
`iwsdk reference warmup` downloads into the shared corpus store. The matching
`model.tgz` is packaged separately with `pnpm --filter @iwsdk/reference-assets run build:model`
and must be hosted at the URL supplied via `IWSDK_REFERENCE_MODEL_URL`.
