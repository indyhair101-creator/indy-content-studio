export interface VideoPosterDecoder {
  decodeFirstFrame(file: File): Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
    dispose?: () => void;
  }>;
  encodeJpeg(frame: {
    source: CanvasImageSource;
    width: number;
    height: number;
  }): Promise<Blob>;
}

function waitForVideoEvent(video: HTMLVideoElement, event: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, resolveEvent);
      video.removeEventListener("error", rejectEvent);
    };
    const resolveEvent = () => {
      cleanup();
      resolve();
    };
    const rejectEvent = () => {
      cleanup();
      reject(new Error("ไม่สามารถถอดรหัสวิดีโอเพื่อสร้างภาพตัวอย่างได้"));
    };
    video.addEventListener(event, resolveEvent, { once: true });
    video.addEventListener("error", rejectEvent, { once: true });
  });
}

const browserVideoPosterDecoder: VideoPosterDecoder = {
  async decodeFirstFrame(file) {
    if (typeof document === "undefined") throw new Error("Video poster generation requires a browser");
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.src = objectUrl;
    try {
      await waitForVideoEvent(video, "loadeddata");
      if (Number.isFinite(video.duration) && video.duration > 0.05) {
        const seeked = waitForVideoEvent(video, "seeked");
        video.currentTime = Math.min(0.1, video.duration / 2);
        await seeked;
      }
      if (!video.videoWidth || !video.videoHeight) throw new Error("วิดีโอไม่มีเฟรมที่อ่านได้");
      return {
        source: video,
        width: video.videoWidth,
        height: video.videoHeight,
        dispose: () => {
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(objectUrl);
        },
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  },

  async encodeJpeg({ source, width, height }) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("ไม่สามารถเตรียมภาพตัวอย่างวิดีโอได้");
    context.drawImage(source, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("ไม่สามารถบันทึกภาพตัวอย่างวิดีโอได้")),
        "image/jpeg",
        0.86,
      );
    });
  },
};

export async function createVideoPoster(
  file: File,
  decoder: VideoPosterDecoder = browserVideoPosterDecoder,
): Promise<Blob> {
  const frame = await decoder.decodeFirstFrame(file);
  try {
    const poster = await decoder.encodeJpeg(frame);
    if (poster.type !== "image/jpeg" || poster.size === 0) {
      throw new Error("ภาพตัวอย่างวิดีโอต้องเป็น JPEG");
    }
    return poster;
  } finally {
    frame.dispose?.();
  }
}
