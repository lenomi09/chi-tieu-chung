const MAX_DIMENSION = 1600
const MAX_BASE64_LENGTH = 1_800_000 // an toàn dưới giới hạn 6mb JSON body của server

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Không đọc được ảnh'))
    img.src = URL.createObjectURL(file)
  })
}

// Nén ảnh bill về JPEG, giới hạn kích thước cạnh dài và giảm chất lượng dần cho
// tới khi base64 đủ nhỏ để gửi trong body JSON — tránh lỗi 413 khi ảnh gốc quá lớn.
export async function compressImageFile(file: File): Promise<string> {
  const img = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    let quality = 0.85
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > MAX_BASE64_LENGTH && quality > 0.3) {
      quality -= 0.1
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    if (dataUrl.length > MAX_BASE64_LENGTH) {
      throw new Error('Ảnh quá lớn, vui lòng chọn ảnh khác hoặc chụp lại với độ phân giải thấp hơn')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
