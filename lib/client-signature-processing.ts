"use client"

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to load signature image"))
    image.src = src
  })

export const processSignatureForPrint = async (
  src: string,
  {
    maxWidth = 900,
    maxHeight = 360,
    backgroundThreshold = 235,
    boldOffset = 0.75,
    darkenBy = 70,
  }: {
    maxWidth?: number
    maxHeight?: number
    backgroundThreshold?: number
    boldOffset?: number
    darkenBy?: number
  } = {},
) => {
  if (!src) return src
  if (typeof window === "undefined") return src

  try {
    const image = await loadImage(src)

    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return src

    ctx.clearRect(0, 0, width, height)

    const offsets: Array<[number, number]> = [
      [0, 0],
      [boldOffset, 0],
      [-boldOffset, 0],
      [0, boldOffset],
      [0, -boldOffset],
      [boldOffset, boldOffset],
      [-boldOffset, boldOffset],
      [boldOffset, -boldOffset],
      [-boldOffset, -boldOffset],
    ]

    offsets.forEach(([dx, dy]) => {
      ctx.drawImage(image, dx, dy, width, height)
    })

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha === 0) continue

      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (brightness >= backgroundThreshold) {
        data[i + 3] = 0
        continue
      }

      data[i] = Math.max(0, data[i] - darkenBy)
      data[i + 1] = Math.max(0, data[i + 1] - darkenBy)
      data[i + 2] = Math.max(0, data[i + 2] - darkenBy)
      data[i + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL("image/png")
  } catch {
    return src
  }
}

