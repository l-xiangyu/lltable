/**
 * 附件正文抽取：从 docx / pdf / pptx / xlsx 中提取纯文本，供 AI 总结/提取等使用。
 * 使用 office-text-extractor（ESM），通过动态 import 加载以兼容 CJS 构建。
 */
/// <reference path="./office-text-extractor.d.ts" />

/** 支持抽取正文的文档 MIME 类型 */
export const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
]);

/** 仅作为图片传给模型的 MIME 类型（走 FilePart / image_url） */
export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

/**
 * 判断是否为可抽正文的文档类型
 */
export function isDocumentMime(mime: string): boolean {
  return DOCUMENT_MIME_TYPES.has(mime?.toLowerCase?.());
}

/**
 * 判断是否为图片类型（可传给视觉模型）
 */
export function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.has(mime?.toLowerCase?.());
}

/** 从 buffer 中抽取正文，仅对 DOCUMENT_MIME_TYPES 有效；失败或非文档类型返回空字符串 */
export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!buffer?.length || !isDocumentMime(mimeType)) {
    return '';
  }
  try {
    const { getTextExtractor } = await import('office-text-extractor');
    const extractor = getTextExtractor();
    const text = await extractor.extractText({ input: new Uint8Array(buffer), type: 'buffer' });
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return '';
  }
}
