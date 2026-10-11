/** Longest side of an uploaded photo; the server keeps no more than this either. */
const MAX_SIDE = 1600
/** A photo this small goes up as it is. */
const SMALL_BYTES = 1_500_000

/**
 * A phone camera photo made small enough to upload quickly on a mobile connection: at most 1600px on its
 * longest side, as JPEG. Gives back the file itself when it is already small or the browser can't draw it.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= SMALL_BYTES) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
