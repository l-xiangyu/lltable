/**
 * office-text-extractor 为 ESM 包，类型声明供 TS 解析用
 */
declare module 'office-text-extractor' {
  export function getTextExtractor(): {
    extractText(options: {
      input: string | Uint8Array;
      type: 'url' | 'file' | 'buffer';
    }): Promise<string>;
  };
}
