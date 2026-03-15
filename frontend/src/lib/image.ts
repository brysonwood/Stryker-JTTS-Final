function readFileAsDataUrl(file: File) {
  // Convert a file to a base64 data URL.
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode compressed image'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImageFile(file: File, maxDimension = 1280, quality = 0.7) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image uploads are supported');
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available in this browser');
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, quality);
  const stem = file.name.replace(/\.[^.]+$/, '') || 'upload';

  return {
    blob,
    width,
    height,
    originalSize: file.size,
    compressedSize: blob.size,
    mime: 'image/jpeg',
    fileName: `${stem}.jpg`,
  };
}