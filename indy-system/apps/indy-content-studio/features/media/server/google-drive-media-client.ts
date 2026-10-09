import { JWT } from "google-auth-library";

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AccessTokenAuthClient {
  getAccessToken(): Promise<{ token?: string | null } | string | null>;
}

export interface GoogleDriveMediaClient {
  uploadFile(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ fileId: string }>;
  deleteFile(input: { fileId: string }): Promise<void>;
  streamFile(input: { fileId: string; range?: string }): Promise<Response>;
  probeStorage?(options?: { signal?: AbortSignal }): Promise<"connected" | "auth" | "folder_not_found" | "storage_permission" | "quota">;
}

type GoogleDriveMediaClientOptions = {
  folderId: string;
  authClient: AccessTokenAuthClient;
  fetcher?: Fetcher;
};

export type GoogleAuthClientFactory = (options: {
  email: string;
  key: string;
  scopes: string[];
}) => AccessTokenAuthClient;

type Environment = Readonly<Record<string, string | undefined>>;

const defaultGoogleAuthClientFactory: GoogleAuthClientFactory = (options) => {
  return new JWT(options);
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const RESUMABLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024;
const GOOGLE_DRIVE_API_ORIGIN = "https://www.googleapis.com";

function resolveAccessToken(result: Awaited<ReturnType<AccessTokenAuthClient["getAccessToken"]>>): string {
  const token = typeof result === "string" ? result : result?.token;
  if (!token) throw new Error("Google authentication did not return an access token");
  return token;
}

function escapeMultipartHeader(value: string): string {
  return value.replace(/[\r\n"]/g, "_");
}

function createMultipartBody({
  boundary,
  folderId,
  name,
  mimeType,
  bytes,
}: {
  boundary: string;
  folderId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Blob {
  const metadata = JSON.stringify({ name, parents: [folderId] });
  return new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${escapeMultipartHeader(mimeType)}\r\n\r\n`,
    Uint8Array.from(bytes),
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });
}

async function resumableUploadFile({
  accessToken,
  folderId,
  name,
  mimeType,
  bytes,
  fetcher,
}: {
  accessToken: string;
  folderId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  fetcher: Fetcher;
}): Promise<{ fileId: string }> {
  const initiation = await fetcher(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(bytes.byteLength),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
  );
  if (!initiation.ok) throw new Error("Google Drive rejected the upload");

  const location = initiation.headers.get("location");
  let sessionUrl: URL;
  try {
    sessionUrl = new URL(location ?? "");
  } catch {
    throw new Error("Google Drive rejected the upload");
  }
  if (sessionUrl.origin !== GOOGLE_DRIVE_API_ORIGIN) throw new Error("Google Drive rejected the upload");

  const response = await fetcher(sessionUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    },
    body: bytes.slice().buffer as ArrayBuffer,
  });
  if (!response.ok) throw new Error("Google Drive rejected the upload");
  const payload = await response.json() as { id?: string };
  if (!payload.id) throw new Error("Google Drive did not return a file ID");
  return { fileId: payload.id };
}

async function isDriveQuotaFailure(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  try {
    const payload = await response.clone().json() as { error?: { errors?: Array<{ reason?: string }> } };
    return (payload.error?.errors ?? []).some(({ reason = "" }) => /quota|rate.?limit|daily.?limit/i.test(reason));
  } catch {
    return false;
  }
}

export function createGoogleDriveMediaClient({
  folderId,
  authClient,
  fetcher = fetch,
}: GoogleDriveMediaClientOptions): GoogleDriveMediaClient {
  return {
    async uploadFile({ name, mimeType, bytes }) {
      const accessToken = resolveAccessToken(await authClient.getAccessToken());
      if (bytes.byteLength > RESUMABLE_UPLOAD_THRESHOLD) {
        return resumableUploadFile({ accessToken, folderId, name, mimeType, bytes, fetcher });
      }
      const boundary = `indy-media-${crypto.randomUUID()}`;
      const body = createMultipartBody({ boundary, folderId, name, mimeType, bytes });
      const response = await fetcher(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": body.type,
          },
          body,
        },
      );

      if (!response.ok) throw new Error("Google Drive rejected the upload");
      const payload = await response.json() as { id?: string };
      if (!payload.id) throw new Error("Google Drive did not return a file ID");
      return { fileId: payload.id };
    },

    async deleteFile({ fileId }) {
      const accessToken = resolveAccessToken(await authClient.getAccessToken());
      const response = await fetcher(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok && response.status !== 404) throw new Error("Google Drive rejected the cleanup");
    },

    async streamFile({ fileId, range }) {
      const accessToken = resolveAccessToken(await authClient.getAccessToken());
      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
      if (range) headers.Range = range;
      const response = await fetcher(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        { headers },
      );
      if (!response.ok && response.status !== 206) throw new Error("Google Drive rejected the download");
      return response;
    },

    async probeStorage({ signal } = {}) {
      try {
        const accessToken = resolveAccessToken(await authClient.getAccessToken());
        const response = await fetcher(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` }, signal },
        );
        if (response.status === 404) return "folder_not_found";
        if (response.status === 401) return "auth";
        if (await isDriveQuotaFailure(response)) return "quota";
        if (response.status === 403) return "storage_permission";
        if (!response.ok) return "auth";
        const folder = await response.json() as {
          id?: string;
          mimeType?: string;
          capabilities?: { canAddChildren?: boolean };
        };
        if (folder.id !== folderId || folder.mimeType !== "application/vnd.google-apps.folder") return "folder_not_found";
        if (folder.capabilities?.canAddChildren !== true) return "storage_permission";
        return "connected";
      } catch {
        return "auth";
      }
    },
  };
}

export function createGoogleDriveMediaClientFromEnvironment(
  environment: Environment = process.env,
  fetcher: Fetcher = fetch,
  createAuthClient: GoogleAuthClientFactory = defaultGoogleAuthClientFactory,
): GoogleDriveMediaClient | null {
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = environment.GOOGLE_PRIVATE_KEY;
  const folderId = environment.GOOGLE_DRIVE_FOLDER_ID;
  if (!serviceAccountEmail || !privateKey || !folderId) return null;

  return createGoogleDriveMediaClient({
    folderId,
    fetcher,
    authClient: createAuthClient({
      email: serviceAccountEmail,
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: [DRIVE_SCOPE],
    }),
  });
}
