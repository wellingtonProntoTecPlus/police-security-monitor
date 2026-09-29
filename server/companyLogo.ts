import { storagePut } from "./storage";

export const COMPANY_LOGO_MAX_BYTES = 1024 * 1024;
export const COMPANY_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type CompanyLogoMimeType = (typeof COMPANY_LOGO_MIME_TYPES)[number];

const MAX_BASE64_LENGTH = Math.ceil(COMPANY_LOGO_MAX_BYTES / 3) * 4 + 16;

function isCompanyLogoMimeType(value: string): value is CompanyLogoMimeType {
  return (COMPANY_LOGO_MIME_TYPES as readonly string[]).includes(value);
}

function hasValidSignature(buffer: Buffer, mimeType: CompanyLogoMimeType) {
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  return buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export function decodeCompanyLogo(dataBase64: string, mimeType: string) {
  if (!isCompanyLogoMimeType(mimeType)) {
    throw new Error("Formato de logo não aceito. Use PNG, JPG ou WebP.");
  }
  if (!dataBase64 || dataBase64.length > MAX_BASE64_LENGTH) {
    throw new Error("A logo deve ter no máximo 1 MB.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64) || dataBase64.length % 4 === 1) {
    throw new Error("Arquivo de logo inválido.");
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0 || buffer.length > COMPANY_LOGO_MAX_BYTES) {
    throw new Error("A logo deve ter no máximo 1 MB.");
  }
  if (!hasValidSignature(buffer, mimeType)) {
    throw new Error("O conteúdo do arquivo não corresponde ao formato informado.");
  }

  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return { buffer, extension };
}

export async function uploadCompanyLogo({
  ownerType,
  ownerId,
  dataBase64,
  mimeType,
}: {
  ownerType: "managing" | "partner";
  ownerId: number;
  dataBase64: string;
  mimeType: string;
}) {
  const { buffer, extension } = decodeCompanyLogo(dataBase64, mimeType);
  return storagePut(`company-logos/${ownerType}/${ownerId}/logo.${extension}`, buffer, mimeType);
}
