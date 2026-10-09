export type AssetState = "missing" | "uploading" | "ready";

export function canSendToLine({
  assetState,
  caption,
  connectedRecipient,
  authenticatedAdmin,
  isSending,
  assetType,
  previewReady,
}: {
  assetState: AssetState;
  caption: string;
  connectedRecipient: boolean;
  authenticatedAdmin: boolean;
  isSending: boolean;
  assetType: string | undefined;
  previewReady: boolean;
}): boolean {
  const supportedType = assetType === "image/jpeg" || assetType === "image/png" || assetType === "video/mp4";
  const previewIsReady = assetType !== "video/mp4" || previewReady;
  return assetState === "ready"
    && caption.trim().length > 0
    && connectedRecipient
    && authenticatedAdmin
    && !isSending
    && supportedType
    && previewIsReady;
}
