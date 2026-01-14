const SUCCESS_FALLBACK_MESSAGE = "File sent successfully. Proceeding to slicing...";

const extractMessage = (payload: unknown): string | null => {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length ? trimmed : null;
  }

  if (payload && typeof payload === "object" && "message" in payload) {
    const value = (payload as Record<string, unknown>).message;
    return typeof value === "string" ? value : null;
  }

  return null;
};

export type UploadResult = {
  message: string;
  raw?: unknown;
};

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  const message = extractMessage(payload);

  if (!response.ok) {
    throw new Error(message ?? "Failed to send file to the backend.");
  }

  return {
    message: message ?? SUCCESS_FALLBACK_MESSAGE,
    raw: payload,
  };
}
