/** 快照进 Pinia 前深拷贝，避免 UI 写回权威对象。 */
export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
