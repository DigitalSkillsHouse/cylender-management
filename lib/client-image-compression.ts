"use client"

const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to load image"))
    image.src = src
  })

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error("Failed to compress image"))
      },
      "image/webp",
      quality,
    )
  })

export const compressImageToWebpDataUrl = async (
  file: File,
  {
    maxBytes = 12 * 1024,
    maxDimension = 700,
    minDimension = 260,
    minQuality = 0.12,
  }: {
    maxBytes?: number
    maxDimension?: number
    minDimension?: number
    minQuality?: number
  } = {},
) => {
  const sourceUrl = await readFileAsDataUrl(file)
  const image = await loadImage(sourceUrl)

  let width = image.width
  let height = image.height
  const longestSide = Math.max(width, height)
  if (longestSide > maxDimension) {
    const scale = maxDimension / longestSide
    width = Math.max(1, Math.round(width * scale))
    height = Math.max(1, Math.round(height * scale))
  }

  let bestBlob: Blob | null = null
  let bestDataUrl = ""
  let bestQuality = 0.7

  while (Math.max(width, height) >= minDimension) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas is not supported in this browser")

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    let quality = 0.72
    while (quality >= minQuality) {
      const blob = await canvasToBlob(canvas, quality)
      const dataUrl = await readFileAsDataUrl(blob)

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
        bestDataUrl = dataUrl
        bestQuality = quality
      }

      if (blob.size <= maxBytes) {
        return {
          dataUrl,
          sizeBytes: blob.size,
          sizeKb: Number((blob.size / 1024).toFixed(2)),
          width,
          height,
          quality,
        }
      }

      quality -= 0.08
    }

    if (Math.max(width, height) <= minDimension) break
    width = Math.max(minDimension, Math.round(width * 0.82))
    height = Math.max(minDimension, Math.round(height * 0.82))
  }

  if (!bestBlob || !bestDataUrl) {
    throw new Error("Unable to compress image")
  }

  return {
    dataUrl: bestDataUrl,
    sizeBytes: bestBlob.size,
    sizeKb: Number((bestBlob.size / 1024).toFixed(2)),
    width,
    height,
    quality: bestQuality,
  }
}
