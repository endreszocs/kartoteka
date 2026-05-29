/**
 * Canvas-alapú háttér-eltávolító scannelt aláírásokhoz / pecsétekhez.
 *
 * Feltételezi, hogy a kép szürke / fehér papírra van rajzolva (klasszikus
 * tinta + szkenner eset). A világos pixeleket transzparenssé teszi, a
 * sötétebbeket változatlanul hagyja.
 *
 * `threshold`:  e fölötti átlagos fényesség 100%-ban transzparens (255 = tiszta fehér).
 * `softZone`:   threshold − softZone és threshold közötti sávban arányosan halványít.
 */
export async function removeWhiteBackground(
  dataUrl: string,
  opts: { threshold?: number; softZone?: number } = {},
): Promise<string> {
  const threshold = opts.threshold ?? 235
  const softZone = opts.softZone ?? 35

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D kontextus nem elérhető'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = imageData.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]
        const g = d[i + 1]
        const b = d[i + 2]
        const brightness = (r + g + b) / 3
        if (brightness >= threshold) {
          d[i + 3] = 0
        } else if (brightness >= threshold - softZone) {
          const ratio = (brightness - (threshold - softZone)) / softZone
          d[i + 3] = Math.round(d[i + 3] * (1 - ratio))
        }
      }
      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Kép betöltése sikertelen'))
    img.src = dataUrl
  })
}

/** File → base64 dataURL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Fájl olvasása sikertelen'))
    reader.readAsDataURL(file)
  })
}
