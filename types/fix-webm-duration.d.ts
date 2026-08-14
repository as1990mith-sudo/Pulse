// Ambient types for the dependency-free `fix-webm-duration` package, which
// ships no bundled declarations. It patches the container-level Duration into a
// MediaRecorder WebM blob so players report the correct length.
declare module "fix-webm-duration" {
  interface FixWebmDurationOptions {
    logger?: boolean
  }
  function fixWebmDuration(
    blob: Blob,
    durationInMs: number,
    options?: FixWebmDurationOptions,
  ): Promise<Blob>
  export default fixWebmDuration
}
