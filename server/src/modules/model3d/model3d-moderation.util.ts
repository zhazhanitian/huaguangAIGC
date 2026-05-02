function normalizeUrlLike(raw: string | null | undefined): string {
  return String(raw || '').trim();
}

export function isModel3dTrustedUploadedImageUrl(
  rawUrl: string | null | undefined,
): boolean {
  const url = normalizeUrlLike(rawUrl);
  if (!url) return false;
  if (url.startsWith('/uploads/')) return true;

  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/uploads/')) return true;

    const ossBucket = String(process.env.OSS_BUCKET || '').trim();
    const ossRegion = String(process.env.OSS_REGION || '').trim();
    if (ossBucket && ossRegion) {
      const host = `${ossBucket}.${ossRegion}.aliyuncs.com`.toLowerCase();
      if (parsed.hostname.toLowerCase() === host) return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function shouldSkipModel3dImg2ImgModeration(
  inputImageUrl: string | null | undefined,
): boolean {
  return isModel3dTrustedUploadedImageUrl(inputImageUrl);
}
