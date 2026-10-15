/**
 * 內容來源。遊戲用 HTTP 讀 content/；編輯器可以改餵本機檔案或未存檔的草稿。
 * path 一律相對 content/，例如 'monsters/mob_0001.json'。
 */
export interface ContentSource {
  json<T = unknown>(path: string): Promise<T>;
  /** 回傳 Phaser 可載入的 URL（http: 或 blob:）。 */
  imageUrl(path: string): Promise<string>;
}

export function httpContentSource(baseUrl: string): ContentSource {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    async json<T>(path: string): Promise<T> {
      const response = await fetch(base + path);
      if (!response.ok) throw new Error(`讀取 ${path} 失敗：HTTP ${response.status}`);
      return (await response.json()) as T;
    },
    async imageUrl(path: string): Promise<string> {
      return base + path;
    },
  };
}
