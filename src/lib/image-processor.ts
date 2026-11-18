export interface ProcessImageOptions {
  watermarkText?: string;
  quality?: number; // 0.1 - 1.0 (ค่าเริ่มต้น 0.88)
  maxWidth?: number; // จำกัดความกว้างสูงสุดเพื่อประหยัดพื้นที่ R2 (ค่าเริ่มต้น 1600px)
}

/**
 * แปลงไฟล์ภาพเป็น WebP บนเบราว์เซอร์ก่อนอัปโหลด
 * หากระบุ watermarkText จะประทับลายน้ำร้านแนวทแยงมุมอัตโนมัติ
 */
export async function processImageToWebP(
  file: File,
  options: ProcessImageOptions = {}
): Promise<Blob> {
  const { watermarkText, quality = 0.88, maxWidth = 1600 } = options;

  const imageBitmap = await loadImageFromFile(file);
  const { width, height } = calculateScaledDimensions(
    imageBitmap.width,
    imageBitmap.height,
    maxWidth
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('ไม่สามารถสร้าง Canvas 2D Context ได้');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  if (watermarkText && watermarkText.trim().length > 0) {
    drawDiagonalWatermark(ctx, width, height, watermarkText.trim());
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('แปลงไฟล์ภาพเป็น WebP ไม่สำเร็จ'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality
    );
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`ไม่สามารถอ่านไฟล์รูปภาพ "${file.name}" ได้`));
    };
    img.src = objectUrl;
  });
}

function calculateScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number
): { width: number; height: number } {
  if (originalWidth <= maxWidth) {
    return { width: originalWidth, height: originalHeight };
  }
  const ratio = maxWidth / originalWidth;
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}

/**
 * วาดลายน้ำร้านแนวทแยงทั่วภาพแบบโปร่งแสง เพื่อป้องกันมิจฉาชีพนำรูปพอร์ตไปแอบอ้าง
 */
function drawDiagonalWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string
): void {
  ctx.save();

  const fontSize = Math.max(20, Math.round(width * 0.032));
  ctx.font = `700 ${fontSize}px "Space Grotesk", "IBM Plex Sans Thai", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const angle = (-28 * Math.PI) / 180;
  const stepX = Math.max(260, fontSize * 9);
  const stepY = Math.max(180, fontSize * 6);

  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);

  const diagonal = Math.hypot(width, height);
  for (let y = -diagonal; y <= diagonal; y += stepY) {
    for (let x = -diagonal; x <= diagonal; x += stepX) {
      // ขอบเงาเข้มบางๆ เพื่อให้อ่านออกทั้งบนพื้นหลังสว่างและมืด
      ctx.fillStyle = 'rgba(9, 13, 22, 0.28)';
      ctx.fillText(text, x + 1.5, y + 1.5);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.fillText(text, x, y);
    }
  }

  ctx.restore();
}